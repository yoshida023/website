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

    const isEmoji = stampData.length > 0 && stampData[0].img?.width === 180;
    const cols = isEmoji ? 7 : 4;
    
    // ヘッダーを120pxに縮小し、残りの高さをスタンプ領域に割り当て
    const headerHeight = 120;
    const footerMargin = 20;
    const availableHeight = config.height - headerHeight - footerMargin;
    
    // 6行で割り切れるようにセルの高さを計算
    const cellWidth = config.width / cols;
    const cellHeight = availableHeight / 6; 
    const padding = 6; // 枠線の隙間

    const totalRows = Math.ceil(stampData.length / cols);
    const shouldScroll = totalRows > 6;
    
    const scrollDuration = 5; 
    const totalFrames = shouldScroll ? (scrollDuration * config.fps) : 90;
    const scrollLimit = Math.max(0, (totalRows * cellHeight) - (config.height - headerHeight));

    const { muxer, encoder } = await VideoCore.createEncoder(config, isMobile);

    for (let f = 0; f < totalFrames; f++) {
        if (f % 30 === 0 && onProgress) onProgress(f, totalFrames);

        const progress = shouldScroll ? (f / totalFrames) : 0;
        const offsetY = progress * scrollLimit;

        ctx.fillStyle = bgColor;
        ctx.fillRect(0, 0, config.width, config.height);

        for (let i = 0; i < stampData.length; i++) {
            const { frames, totalDuration, img } = stampData[i];
            const row = Math.floor(i / cols);
            const col = i % cols;
            const cellX = col * cellWidth;
            const cellY = (row * cellHeight) + headerHeight - offsetY;

            if (cellY > headerHeight - cellHeight && cellY < config.height) {
                const availableW = cellWidth - (padding * 2);
                const availableH = cellHeight - (padding * 2);
                const ratio = Math.min(availableW / img.width, availableH / img.height);
                const drawW = img.width * ratio;
                const drawH = img.height * ratio;
                const drawX = cellX + (cellWidth - drawW) / 2;
                const drawY = cellY + (cellHeight - drawH) / 2;

                const loopTime = ((f / config.fps) * 1000) % totalDuration;
                let acc = 0;
                let activeFrame = frames[frames.length - 1].img;
                for (const frame of frames) {
                    acc += frame.delay;
                    if (loopTime < acc) { activeFrame = frame.img; break; }
                }

                ctx.save();
                ctx.beginPath();
                ctx.roundRect(cellX + padding, cellY + padding, cellWidth - (padding*2), cellHeight - (padding*2), 8);
                ctx.fillStyle = stampBgColor;
                ctx.fill();
                ctx.strokeStyle = "rgba(0,0,0,0.08)";
                ctx.stroke();
                ctx.clip();
                ctx.drawImage(activeFrame, drawX, drawY, drawW, drawH);
                ctx.restore();
            }
        }

        // タイトル背景（薄く）
        ctx.fillStyle = bgColor;
        ctx.fillRect(0, 0, config.width, headerHeight);
        ctx.fillStyle = textColor;
        ctx.font = "bold 28px sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(title, config.width / 2, 70);

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
