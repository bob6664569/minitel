/**
 * A "telephone line": two connected ends exchanging bytes.
 *
 *   const [terminalEnd, serverEnd] = createLine();
 *   terminal.connect(terminalEnd);
 *   new Session(serverEnd) ...
 *
 * Each end emits 'data' (detail: Uint8Array) for bytes sent by the other
 * end, and 'close' when the line is hung up.
 */
export class LineEnd extends EventTarget {
  constructor() {
    super();
    this.peer = null;
    this.open = true;
  }

  /** Send bytes to the other end (delivered asynchronously, in order). */
  send(bytes) {
    if (!this.open || !this.peer) return;
    const data = bytes instanceof Uint8Array ? bytes : Uint8Array.from(bytes);
    const peer = this.peer;
    queueMicrotask(() => {
      if (peer.open) peer.dispatchEvent(new CustomEvent('data', { detail: data }));
    });
  }

  /** Hang up: both ends are closed. */
  close() {
    if (!this.open) return;
    this.open = false;
    this.dispatchEvent(new Event('close'));
    this.peer?.close();
  }
}

export function createLine() {
  const a = new LineEnd();
  const b = new LineEnd();
  a.peer = b;
  b.peer = a;
  return [a, b];
}

/**
 * Bridge a line end to a WebSocket (e.g. a real Minitel server that speaks
 * raw Videotex over WebSocket). Binary and text frames are both accepted.
 */
export function websocketLine(url, protocols) {
  const [local, remote] = createLine();
  const socket = new WebSocket(url, protocols);
  socket.binaryType = 'arraybuffer';
  socket.addEventListener('message', (event) => {
    if (typeof event.data === 'string') {
      const bytes = new Uint8Array(event.data.length);
      for (let i = 0; i < event.data.length; i++) bytes[i] = event.data.charCodeAt(i) & 0xff;
      remote.send(bytes);
    } else {
      remote.send(new Uint8Array(event.data));
    }
  });
  socket.addEventListener('close', () => remote.close());
  socket.addEventListener('error', () => remote.close());
  remote.addEventListener('data', (event) => {
    if (socket.readyState === WebSocket.OPEN) socket.send(event.detail);
  });
  remote.addEventListener('close', () => socket.close());
  local.socket = socket;
  return local;
}

/**
 * Drive a physical Minitel through its DIN "prise péri-informatique" with the
 * Web Serial API (Chromium), e.g. via a USB-TTL adapter. Returns the line end
 * a Session uses: the service runs in the browser, the real Minitel displays.
 *
 *   const line = await serialLine({ baudRate: 1200 });
 *   runService(myService, line);
 */
export async function serialLine({ baudRate = 1200, port } = {}) {
  if (!('serial' in navigator)) throw new Error('Web Serial is not available in this browser');
  const serial = port || (await navigator.serial.requestPort());
  await serial.open({ baudRate, dataBits: 7, parity: 'even', stopBits: 1 });
  const [service, device] = createLine();
  const writer = serial.writable.getWriter();
  device.addEventListener('data', (event) => writer.write(event.detail));
  (async () => {
    const reader = serial.readable.getReader();
    try {
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        device.send(value.map((b) => b & 0x7f));
      }
    } catch {
      // port unplugged
    } finally {
      reader.releaseLock();
      device.close();
    }
  })();
  device.addEventListener('close', async () => {
    writer.releaseLock();
    await serial.close().catch(() => {});
  });
  service.port = serial;
  return service;
}
