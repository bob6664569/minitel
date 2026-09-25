/**
 * Procedural sample pictures for Mosaic Studio (no image files needed).
 * Each function returns a 640x480 canvas.
 */

function canvas(draw) {
  const c = document.createElement('canvas');
  c.width = 640;
  c.height = 480;
  draw(c.getContext('2d'), c.width, c.height);
  return c;
}

function seeded(seed) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

/** Striped sun over a calm sea, mountains on the horizon. */
export function sunset() {
  return canvas((ctx, w, h) => {
    const horizon = h * 0.62;
    const sky = ctx.createLinearGradient(0, 0, 0, horizon);
    sky.addColorStop(0, '#1a1060');
    sky.addColorStop(0.45, '#b0306a');
    sky.addColorStop(0.8, '#ff8a3c');
    sky.addColorStop(1, '#ffd35a');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, w, horizon);

    // Sun with retro cut-out stripes
    ctx.save();
    ctx.beginPath();
    ctx.arc(w / 2, horizon - 10, 150, Math.PI, 0);
    ctx.clip();
    const sun = ctx.createLinearGradient(0, horizon - 160, 0, horizon);
    sun.addColorStop(0, '#fff27a');
    sun.addColorStop(1, '#ff6a2a');
    ctx.fillStyle = sun;
    ctx.fillRect(0, 0, w, horizon);
    ctx.fillStyle = sky;
    for (let i = 0; i < 6; i++) ctx.fillRect(0, horizon - 70 + i * 14, w, 3 + i * 1.5);
    ctx.restore();

    // Mountains
    ctx.fillStyle = '#3a1848';
    ctx.beginPath();
    ctx.moveTo(0, horizon);
    const peaks = [[0, 0.8], [0.12, 0.62], [0.22, 0.74], [0.34, 0.55], [0.42, 0.7], [0.58, 0.66], [0.7, 0.5], [0.82, 0.68], [0.92, 0.58], [1, 0.72]];
    for (const [x, y] of peaks) ctx.lineTo(x * w, horizon - (1 - y) * 170);
    ctx.lineTo(w, horizon);
    ctx.fill();

    // Sea with reflections
    const sea = ctx.createLinearGradient(0, horizon, 0, h);
    sea.addColorStop(0, '#2a2f8a');
    sea.addColorStop(1, '#070a2a');
    ctx.fillStyle = sea;
    ctx.fillRect(0, horizon, w, h - horizon);
    const rand = seeded(7);
    for (let y = horizon + 6; y < h; y += 9) {
      const spread = 40 + (y - horizon) * 0.9;
      ctx.fillStyle = `rgba(255, ${160 + rand() * 80}, 70, ${0.85 - (y - horizon) / (h - horizon) * 0.6})`;
      ctx.fillRect(w / 2 - spread * (0.4 + rand() * 0.6), y, spread * (0.8 + rand()), 3);
    }
  });
}

/** The Eiffel tower on a starry night. */
export function eiffel() {
  return canvas((ctx, w, h) => {
    const sky = ctx.createLinearGradient(0, 0, 0, h);
    sky.addColorStop(0, '#050a24');
    sky.addColorStop(0.7, '#1c2a6e');
    sky.addColorStop(1, '#3b3f8f');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, w, h);

    const rand = seeded(42);
    ctx.fillStyle = '#ffffff';
    for (let i = 0; i < 90; i++) ctx.fillRect(rand() * w, rand() * h * 0.6, 2 + rand() * 2, 2 + rand() * 2);

    // Moon
    ctx.fillStyle = '#fff6c8';
    ctx.beginPath();
    ctx.arc(w * 0.8, h * 0.18, 34, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#0a1238';
    ctx.beginPath();
    ctx.arc(w * 0.8 + 14, h * 0.18 - 6, 30, 0, Math.PI * 2);
    ctx.fill();

    // Searchlight
    const beam = ctx.createLinearGradient(w / 2, 60, w * 0.15, 0);
    beam.addColorStop(0, 'rgba(255, 240, 180, 0.55)');
    beam.addColorStop(1, 'rgba(255, 240, 180, 0)');
    ctx.fillStyle = beam;
    ctx.beginPath();
    ctx.moveTo(w / 2, 70);
    ctx.lineTo(0, 0);
    ctx.lineTo(0, 60);
    ctx.fill();

    // Tower silhouette
    const cx = w / 2;
    const base = h - 30;
    ctx.fillStyle = '#e8a33a';
    ctx.beginPath();
    ctx.moveTo(cx - 3, 50);
    ctx.lineTo(cx + 3, 50);
    ctx.quadraticCurveTo(cx + 30, 250, cx + 150, base);
    ctx.lineTo(cx + 95, base);
    ctx.quadraticCurveTo(cx, 330, cx - 95, base);
    ctx.lineTo(cx - 150, base);
    ctx.quadraticCurveTo(cx - 30, 250, cx - 3, 50);
    ctx.fill();
    // Platforms
    ctx.fillStyle = '#ffd36a';
    ctx.fillRect(cx - 62, 300, 124, 12);
    ctx.fillRect(cx - 32, 190, 64, 9);
    ctx.fillRect(cx - 12, 105, 24, 7);
    // Lattice
    ctx.strokeStyle = 'rgba(80, 40, 10, 0.55)';
    ctx.lineWidth = 3;
    for (let y = 120; y < base; y += 26) {
      const half = 3 + ((y - 50) / (base - 50)) ** 1.8 * 150;
      ctx.beginPath();
      ctx.moveTo(cx - half, y);
      ctx.lineTo(cx + half, y + 22);
      ctx.moveTo(cx + half, y);
      ctx.lineTo(cx - half, y + 22);
      ctx.stroke();
    }
    // Ground
    ctx.fillStyle = '#0b1026';
    ctx.fillRect(0, base, w, h - base);
  });
}

/** A "3615" poster on a perspective grid. */
export function poster() {
  return canvas((ctx, w, h) => {
    const bg = ctx.createLinearGradient(0, 0, 0, h);
    bg.addColorStop(0, '#12002a');
    bg.addColorStop(0.55, '#5a0b6e');
    bg.addColorStop(0.56, '#08001a');
    bg.addColorStop(1, '#000000');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);

    // Grid floor
    const horizon = h * 0.56;
    ctx.strokeStyle = '#27e0ff';
    ctx.lineWidth = 3;
    for (let i = -12; i <= 12; i++) {
      ctx.beginPath();
      ctx.moveTo(w / 2 + i * 12, horizon);
      ctx.lineTo(w / 2 + i * 90, h);
      ctx.stroke();
    }
    for (let k = 1; k < 10; k++) {
      const y = horizon + (h - horizon) * (k / 9) ** 1.8;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }

    // Title
    ctx.font = 'bold 170px Arial, Helvetica, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    const text = ctx.createLinearGradient(0, 80, 0, 250);
    text.addColorStop(0, '#fff46a');
    text.addColorStop(0.55, '#ff5a2a');
    text.addColorStop(1, '#ff2a8a');
    ctx.fillStyle = text;
    ctx.fillText('3615', w / 2, 235);
    ctx.font = 'bold 52px Arial, Helvetica, sans-serif';
    ctx.fillStyle = '#27e0ff';
    ctx.fillText('MINITEL', w / 2, 300);
  });
}

export const SAMPLES = [
  { id: 'sunset', label: 'Coucher de soleil', make: sunset },
  { id: 'eiffel', label: 'Tour Eiffel', make: eiffel },
  { id: 'poster', label: 'Affiche 3615', make: poster },
];
