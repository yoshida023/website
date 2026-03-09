// videoEncoder.js
import { VideoCore } from './modules/VideoCore.js';
import { UIHelper } from './modules/UIHelper.js';

// デバイス別の最適化設定
export const CONFIG_MOBILE = { 
    width: 544, height: 960, fps: 30, bitrate: 1_200_000, codec: 'avc1.42E01E' 
};
export const CONFIG_PC = { 
    width: 540, height: 960, fps: 30, bitrate: 2_500_000, codec: 'avc1.4D401F' 
};

export async function generateStampVideo(params, onProgress) {
    const isMobile = /iPhone|iPad|Android/i.test(navigator.userAgent);
    const config = isMobile ? CONFIG_MOBILE : CONFIG_PC;
    const { 
        stampFiles, mainImg, title, author, footer, 
        bgColor, stampBgColor, textColor, fullAnim, canvas, ctx 
    } = params;

    const { muxer, encoder } = await VideoCore.createEncoder(config, isMobile);

    let frameCount = 0;
    
    for (let i = 0; i < stampFiles.length; i++) {
        if (onProgress) onProgress(i + 1, stampFiles.length);

        const buffer = await stampFiles[i].async("arraybuffer");
        let frames = await VideoCore.getRenderedFrames(buffer);
        
        if (!frames) {
            const blob = new Blob([buffer]);
            const img = await loadImage(URL.createObjectURL(blob));
            if (img) frames = [{ img, delay: 1000 }];
        }
        if (!frames) continue;

        const totalApngMs = frames.reduce((a, b) => a + b.delay, 0) || 1000;
        const durationLimit = fullAnim ? (totalApngMs / 1000) : 1.0;
        let stampTime = 0;

        while (stampTime < durationLimit) {
            while (encoder.encodeQueueSize > 2) await new Promise(r => setTimeout(r, 10));

            // --- 描画処理 ---
            ctx.fillStyle = bgColor;
            ctx.fillRect(0, 0, config.width, config.height);

            // ヘッダーアイコン
            UIHelper.drawRoundedImage(ctx, mainImg, (config.width - 110) / 2, 60, 110, 20, stampBgColor);
            
            // タイトル（自動縮小）
            let currentY = 190;
            const titleHeight = UIHelper.drawTextFit(ctx, title, config.width / 2, currentY, 480, 34, textColor);
            currentY += titleHeight + 5;

            // 作者名
            ctx.save();
            ctx.font = "20px sans-serif";
            ctx.textAlign = "center";
            ctx.textBaseline = "top";
            ctx.fillStyle = textColor;
            ctx.fillText(author, config.width / 2, currentY);
            ctx.restore();

            // メインスタンプ
            const currentFrame = getFrameAtTime(frames, stampTime, totalApngMs);
            UIHelper.drawRoundedImage(ctx, currentFrame.img, (config.width - 420) / 2, 300, 420, 30, stampBgColor);

            // スタンプ番号
            ctx.save();
            ctx.font = "bold 40px sans-serif";
            ctx.fillStyle = textColor;
            ctx.textAlign = "center";
            ctx.fillText(`No. ${i + 1}`, config.width / 2, 750);
            ctx.restore();

            // フッター（自動折り返し）
            UIHelper.drawTextWrap(ctx, footer, config.width / 2, 820, 480, 28, textColor);

            // エンコード実行
            const vFrame = new VideoFrame(canvas, { 
                timestamp: (frameCount++ * 1000000) / config.fps, 
                duration: 1000000 / config.fps 
            });
            encoder.encode(vFrame);
            vFrame.close();
            
            stampTime += 1 / config.fps;
        }
        await encoder.flush();
    }

    await encoder.flush();
    muxer.finalize();
    return new Blob([muxer.target.buffer], { type: 'video/mp4' });
}

function getFrameAtTime(frames, stampTime, totalApngMs) {
    const currentMs = (stampTime * 1000) % totalApngMs;
    let acc = 0;
    for (const f of frames) {
        acc += f.delay;
        if (currentMs < acc) return f;
    }
    return frames[frames.length - 1];
}

async function loadImage(url) {
    return new Promise(res => {
        const img = new Image();
        img.onload = () => res(img);
        img.onerror = () => res(null);
        img.src = url;
    });
}
