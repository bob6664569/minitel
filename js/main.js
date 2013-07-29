$(document).ready(function(){

    var adaptText = function()
    {
        var minitel = {
            lines : 24,
            columns : 80
        };

        var vW = $(window).width() - 32;
        var vH = $(window).height() - 32;

        var mRatio = minitel.columns / minitel.lines;
        var sRatio = vW / vH;

        var container = $('#container');

        if(sRatio > mRatio)
        {
            $('body').css('font-size', vH / 24);
            container.css({
                'width': vH * mRatio,
                'height': vH - 32,
                'margin-top': 16
            });
            $('body').css('font-size', (vH - 32) / 24);
        }else{
            $('body').css('font-size', (vW - 32) / 80);
            container.css({
                'width': vW - 32,
                'height': vW / mRatio,
                'margin-top': (vH - 16 - (vW / mRatio)) / 2
            });
        }
        console.debug(mRatio, sRatio);
    }

    $(window).resize(function() {
        adaptText();
    });
    adaptText();
});