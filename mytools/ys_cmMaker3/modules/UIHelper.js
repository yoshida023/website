// modules/UIHelper.js
export const UIHelper = {
    /**
     * 【タイトル用】幅に合わせて1行に縮小描画
     */
    drawTextFit(ctx, text, x, y, maxWidth, initialSize) {
        ctx.save();
        let fontSize = initialSize;
        ctx.textAlign = "center";
        ctx.textBaseline = "top";
        ctx.fillStyle = ctx.fillStyle || "#000000"; // 色が未指定なら黒
        
        do {
            ctx.font = `bold ${fontSize}px sans-serif`;
            if (ctx.measureText(text).width <= maxWidth || fontSize <= 10) break;
            fontSize -= 1;
        } while (fontSize > 10);

        ctx.fillText(text, x, y);
        ctx.restore();
        return fontSize * 1.3; // 使用した高さを計算して返す
    },

    /**
     * 【紹介文用】指定された幅で自動折り返し描画
     */
    drawTextWrap(ctx, text, x, y, maxWidth, fontSize, lineHeightMult = 1.4) {
        ctx.save();
        ctx.font = `bold ${fontSize}px sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "top";
        
        const words = text.split(""); // 1文字ずつ分割して判定
        let line = "";
        let lines = [];

        for (let n = 0; n < words.length; n++) {
            let testLine = line + words[n];
            let metrics = ctx.measureText(testLine);
            if (metrics.width > maxWidth && n > 0) {
                lines.push(line);
                line = words[n];
            } else {
                line = testLine;
            }
        }
        lines.push(line);

        const lineHeight = fontSize * lineHeightMult;
        lines.forEach((l, i) => {
            ctx.fillText(l, x, y + (i * lineHeight));
        });

        ctx.restore();
        return lines.length * lineHeight; // 全体の高さを返す
    },

    /**
     * 画像を角丸で描画
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
