// videoEncoder.js - preBuild for hp2025
import { VideoCore } from './modules/VideoCore.js';

export const CONFIG_MOBILE = { width: 544, height: 960, fps: 30, bitrate: 1_200_000, codec: 'avc1.42E01E' };
export const CONFIG_PC = { width: 540, height: 960, fps: 30, bitrate: 2_500_000, codec: 'avc1.4D401F' };

export async function generateStampVideo(params, onProgress) {
    const isMobile = /iPhone|iPad|Android/i.test(navigator.userAgent);
    const config = isMobile ? CONFIG_MOBILE : CONFIG_PC;
    const { stampFiles, title, bgColor, stampBgColor, textColor, canvas, ctx } = params;

    const sortedFiles = [...stampFiles].sort((a, b) => {
        const numA = parseInt(a.name.match(/\d+/)?.[0] || 0);
        const numB = parseInt(b.name.match(/\d+/)?.[0] || 0);
        return numA - numB;
    });

    const stampData = await Promise.all(sortedFiles.map(async (file) => {
        const buffer = await file.async("arraybuffer");
        const frames = await VideoCore.getRenderedFrames(buffer);
        const totalDuration = frames ? frames.reduce((acc, f) => acc + f.delay, 0) : 1000;
        const img = frames ? frames[0].img : null;
        return { frames, totalDuration, img };
    }));

    // 判定: 幅180pxなら絵文字(7列)、それ以外はスタンプ(4列)
    const isEmoji = stampData.length > 0 && stampData[0].img?.width === 180;
    const cols = isEmoji ? 7 : 4;
    const cellWidth = config.width / cols;
    const cellHeight = cellWidth; // セルの高さは維持
    const padding = 12; // 枠との隙間

    const { muxer, encoder } = await VideoCore.createEncoder(config, isMobile);
    const totalFrames = 90; // 3秒間固定

    for (let f = 0; f < totalFrames; f++) {
        ctx.fillStyle = bgColor;
        ctx.fillRect(0, 0, config.width, config.height);

        for (let i = 0; i < stampData.length; i++) {
            const { frames, totalDuration, img } = stampData[i];
            if (!img) continue;

            const row = Math.floor(i / cols);
            const col = i % cols;
            const cellX = col * cellWidth;
            const cellY = (row * cellHeight) + 200;

            // アスペクト比を維持した拡大計算
            const availableW = cellWidth - (padding * 2);
            const availableH = cellHeight - (padding * 2);
            const ratio = Math.min(availableW / img.width, availableH / img.height);
            const drawW = img.width * ratio;
            const drawH = img.height * ratio;
            
            // セル内中央寄せ
            const drawX = cellX + (cellWidth - drawW) / 2;
            const drawY = cellY + (cellHeight - drawH) / 2;

            // アニメーションフレーム計算
            const loopTime = ((f / config.fps) * 1000) % totalDuration;
            let acc = 0;
            let activeFrame = frames[frames.length - 1].img;
            for (const frame of frames) {
                acc += frame.delay;
                if (loopTime < acc) { activeFrame = frame.img; break; }
            }

            // 角丸枠線と描画
            ctx.save();
            ctx.beginPath();
            ctx.roundRect(cellX + padding, cellY + padding, cellWidth - (padding*2), cellHeight - (padding*2), 12);
            ctx.fillStyle = stampBgColor;
            ctx.fill();
            ctx.strokeStyle = "rgba(0,0,0,0.1)";
            ctx.stroke();
            ctx.clip();
            ctx.drawImage(activeFrame, drawX, drawY, drawW, drawH);
            ctx.restore();
        }

        // タイトル
        ctx.fillStyle = bgColor;
        ctx.fillRect(0, 0, config.width, 200);
        ctx.fillStyle = textColor;
        ctx.font = "bold 32px sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(title, config.width / 2, 100);

        const vFrame = new VideoFrame(canvas, { 
            timestamp: (f * 1000000) / config.fps, 
            duration: 1000000 / config.fps 
        });
        encoder.encode(vFrame);
        vFrame.close();
    }

    await encoder.flush();
    muxer.finalize();
    return new Blob([muxer.target.buffer], { type: 'video/mp4' });
}
