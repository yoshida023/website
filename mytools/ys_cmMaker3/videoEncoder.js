// videoEncoder.js (抜粋)
// ... (前略)
            // 1. 背景
            ctx.fillStyle = bgColor;
            ctx.fillRect(0, 0, config.width, config.height);

            // 2. ヘッダーアイコン
            UIHelper.drawRoundedImage(ctx, mainImg, (config.width - 110) / 2, 60, 110, 20, stampBgColor);
            
            // 3. タイトル
            let currentY = 190;
            const titleHeight = UIHelper.drawTextFit(ctx, title, config.width / 2, currentY, 480, 34, textColor);
            currentY += titleHeight + 5;

            // 4. 作者名
            ctx.save();
            ctx.font = "20px sans-serif";
            ctx.textAlign = "center";
            ctx.textBaseline = "top";
            ctx.fillStyle = textColor;
            ctx.fillText(author, config.width / 2, currentY);
            ctx.restore();

            // 5. メインスタンプ
            const currentFrame = getFrameAtTime(frames, stampTime, totalApngMs);
            UIHelper.drawRoundedImage(ctx, currentFrame.img, (config.width - 420) / 2, 300, 420, 30, stampBgColor);

            // 6. スタンプ番号
            ctx.save();
            ctx.font = "bold 40px sans-serif";
            ctx.fillStyle = textColor;
            ctx.textAlign = "center";
            ctx.fillText(`No. ${i + 1}`, config.width / 2, 750);
            ctx.restore();

            // 7. フッター（折り返し）
            UIHelper.drawTextWrap(ctx, footer, config.width / 2, 820, 480, 28, textColor);
// ... (後略)
