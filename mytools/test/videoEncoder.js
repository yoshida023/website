// videoEncoder.js
import { VideoCore } from './modules/VideoCore.js';

export const CONFIG_MOBILE = { width: 544, height: 960, fps: 30, bitrate: 1_200_000, codec: 'avc1.42E01E' };
export const CONFIG_PC = { width: 540, height: 960, fps: 30, bitrate: 2_500_000, codec: 'avc1.4D401F' };

export async function generateStampVideo(params, onProgress) {
    const isMobile = /iPhone|iPad|Android/i.test(navigator.userAgent);
    const config = isMobile ? CONFIG_MOBILE : CONFIG_PC;
    const { stampFiles, title, bgColor, stampBgColor, textColor, canvas, ctx } = params;

    const edgeMargin = 40;
    const innerWidth = config.width - (edgeMargin * 2);
    const innerHeight = config.height - (edgeMargin * 2);

    // スタンプデータのデコード (VideoCoreを使用)
    const stampData = await Promise.all(stampFiles.map(async (file) => {
        const buffer = await file.async("arraybuffer");
        const frames = await VideoCore.getRenderedFrames(buffer);
        const totalDuration = frames ? frames.reduce((acc, f) => acc + f.delay, 0) : 1000;
        return { frames, totalDuration, img: frames[0].img };
    }));

    // レイアウト設定: 選択数に応じて列数を変える（少なければ大きく表示）
    let cols = 4;
    if (stampData.length <= 4) cols = 2;
    else if (stampData.length <= 9) cols = 3;

    const headerHeight = 120;
    const availableHeightForStamps = innerHeight - headerHeight;
    const cellWidth = innerWidth / cols;
    const cellHeight = cellWidth; // 正方形
    const padding = 8;

    const totalRows = Math.ceil(stampData.length / cols);
    const scrollLimit = Math.max(0, (totalRows * cellHeight) - availableHeightForStamps);
    const shouldScroll = scrollLimit > 0;
    
    const durationSec = shouldScroll ? 6 : 3;
    const totalFrames = durationSec * config.fps;

    const { muxer, encoder } = await VideoCore.createEncoder(config, isMobile);

    for (let f = 0; f < totalFrames; f++) {
        if (f % 10 === 0 && onProgress) onProgress(f, totalFrames);

        const progress = f / totalFrames;
        const offsetY = shouldScroll ? (progress * scrollLimit) : 0;

        // 背景
        ctx.fillStyle = bgColor;
        ctx.fillRect(0, 0, config.width, config.height);

        // クリップ領域（ヘッダー下）
        ctx.save();
        ctx.beginPath();
        ctx.rect(edgeMargin, edgeMargin + headerHeight, innerWidth, availableHeightForStamps);
        ctx.clip();

        for (let i = 0; i < stampData.length; i++) {
            const { frames, totalDuration, img } = stampData[i];
            const row = Math.floor(i / cols);
            const col = i % cols;
            
            const cellX = edgeMargin + (col * cellWidth);
            const cellY = edgeMargin + headerHeight + (row * cellHeight) - offsetY;

            // 画面外描画スキップ
            if (cellY + cellHeight < 0 || cellY > config.height) continue;

            // アニメーションフレームの計算
            const loopTime = ((f / config.fps) * 1000) % totalDuration;
            let acc = 0;
            let activeFrame = frames[0].img;
            for (const frame of frames) {
                acc += frame.delay;
                if (loopTime < acc) { activeFrame = frame.img; break; }
            }

            // スタンプ描画
            ctx.save();
            ctx.fillStyle = stampBgColor;
            ctx.beginPath();
            ctx.roundRect(cellX + padding, cellY + padding, cellWidth - (padding*2), cellHeight - (padding*2), 12);
            ctx.fill();
            ctx.clip();

            const drawSize = cellWidth - (padding * 4);
            const ratio = Math.min(drawSize / img.width, drawSize / img.height);
            const dw = img.width * ratio;
            const dh = img.height * ratio;
            ctx.drawImage(activeFrame, cellX + (cellWidth - dw) / 2, cellY + (cellHeight - dh) / 2, dw, dh);
            ctx.restore();
        }
        ctx.restore();

        // ヘッダー描画（常に最前面）
        ctx.fillStyle = bgColor;
        ctx.fillRect(0, 0, config.width, edgeMargin + headerHeight);
        ctx.fillStyle = textColor;
        ctx.font = "bold 32px sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(title, config.width / 2, edgeMargin + 60);

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
