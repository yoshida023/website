// videoEncoder.js - preBuild for hp2025
import { VideoCore } from './modules/VideoCore.js';

export const CONFIG_MOBILE = { width: 544, height: 960, fps: 30, bitrate: 1_200_000, codec: 'avc1.42E01E' };
export const CONFIG_PC = { width: 540, height: 960, fps: 30, bitrate: 2_500_000, codec: 'avc1.4D401F' };

export async function generateStampVideo(params, onProgress) {
    const isMobile = /iPhone|iPad|Android/i.test(navigator.userAgent);
    const config = isMobile ? CONFIG_MOBILE : CONFIG_PC;
    const { stampFiles, title, author, bgColor, stampBgColor, textColor, canvas, ctx } = params;

    const sortedFiles = [...stampFiles].sort((a, b) => {
        const numA = parseInt(a.name.match(/\d+/)?.[0] || 0);
        const numB = parseInt(b.name.match(/\d+/)?.[0] || 0);
        return numA - numB;
    });

    const stampData = await Promise.all(sortedFiles.map(async (file) => {
        const buffer = await file.async("arraybuffer");
        const frames = await VideoCore.getRenderedFrames(buffer);
        const totalDuration = frames ? frames.reduce((acc, f) => acc + f.delay, 0) : 1000;
        const width = frames ? frames[0].img.width : 0;
        return { frames, totalDuration, width };
    }));

    const isEmoji = stampData.length > 0 && stampData[0].width === 180;
    const cols = isEmoji ? 7 : 4;
    const cellWidth = config.width / cols;
    const padding = 10; // 枠線とアイテムの隙間
    const itemSize = cellWidth - (padding * 2);

    const { muxer, encoder } = await VideoCore.createEncoder(config, isMobile);

    // スクロールせず、全フレームを静止画として一定時間出力する
    const totalFrames = 90; // 3秒間固定表示

    for (let f = 0; f < totalFrames; f++) {
        if (f % 10 === 0 && onProgress) onProgress(f, totalFrames);

        ctx.fillStyle = bgColor;
        ctx.fillRect(0, 0, config.width, config.height);

        for (let i = 0; i < stampData.length; i++) {
            const { frames, totalDuration } = stampData[i];
            const row = Math.floor(i / cols);
            const col = i % cols;
            const x = (col * cellWidth) + padding;
            const y = (row * cellWidth) + 200 + padding; // タイトル分下げる

            // アニメーションフレームの計算
            const currentTimeMs = (f / config.fps) * 1000;
            const loopTime = currentTimeMs % totalDuration;
            let acc = 0;
            let activeFrame = frames[frames.length - 1].img;
            for (const frame of frames) {
                acc += frame.delay;
                if (loopTime < acc) {
                    activeFrame = frame.img;
                    break;
                }
            }

            // 1. スタンプの角丸背景・枠線描画
            ctx.save();
            ctx.beginPath();
            ctx.roundRect(x, y, itemSize, itemSize, 12);
            ctx.fillStyle = stampBgColor;
            ctx.fill();
            ctx.strokeStyle = "rgba(0,0,0,0.15)"; // 薄い線
            ctx.lineWidth = 2;
            ctx.stroke();
            ctx.clip(); // はみ出し防止

            // 2. 画像描画
            ctx.drawImage(activeFrame, x, y, itemSize, itemSize);
            ctx.restore();
        }

        // タイトル表示
        ctx.fillStyle = bgColor;
        ctx.fillRect(0, 0, config.width, 180);
        ctx.fillStyle = textColor;
        ctx.font = "bold 32px sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(title, config.width / 2, 80);

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
