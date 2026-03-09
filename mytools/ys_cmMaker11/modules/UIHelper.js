// modules/UIHelper.js
export const UIHelper = {
    drawTextFit(ctx, text, x, y, maxWidth, initialSize, color) {
        ctx.save();
        ctx.fillStyle = color; // 色を確実に適用
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

    drawTextWrap(ctx, text, x, y, maxWidth, fontSize, color, lineHeightMult = 1.4) {
        ctx.save();
        ctx.fillStyle = color;
        ctx.font = `bold ${fontSize}px sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "top";
        
        const words = text.split(""); 
        let line = "";
        let lines = [];
        for (let n = 0; n < words.length; n++) {
            let testLine = line + words[n];
            if (ctx.measureText(testLine).width > maxWidth && n > 0) {
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
        return lines.length * lineHeight;
    },

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
