// modules/UIHelper.js
export const UIHelper = {
    /**
     * 指定幅に収まるように文字サイズを調整して描画
     */
    drawTextFit(ctx, text, x, y, maxWidth, initialSize) {
        ctx.save();
        let fontSize = initialSize;
        ctx.textAlign = "center";
        ctx.textBaseline = "top";
        do {
            ctx.font = `bold ${fontSize}px sans-serif`;
            if (ctx.measureText(text).width <= maxWidth || fontSize <= 10) break;
            fontSize -= 1;
        } while (fontSize > 10);
        ctx.fillText(text, x, y);
        ctx.restore();
        return fontSize * 1.3;
    },

    /**
     * 画像を角丸の枠の中にフィットさせて描画
     */
    drawRoundedImage(ctx, img, x, y, size, radius, bgColor) {
        ctx.save();
        ctx.beginPath();
        ctx.roundRect(x, y, size, size, radius);
        ctx.fillStyle = bgColor;
        ctx.fill();
        ctx.clip();
        if (img) {
            const r = Math.min((size - 40) / img.width, (size - 40) / img.height);
            const sw = img.width * r;
            const sh = img.height * r;
            ctx.drawImage(img, x + (size - sw) / 2, y + (size - sh) / 2, sw, sh);
        }
        ctx.restore();
    }
};
