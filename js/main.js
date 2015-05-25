columns = 40;

$(document).ready(function(){
    $(window).resize(function(){
      $('body').css('font-size', $(window).width() / columns);
    });
    $(window).resize();
});
