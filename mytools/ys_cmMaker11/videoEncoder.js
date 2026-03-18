// videoEncoder.js - preBuild for hp2025
import { VideoCore } from './modules/VideoCore.js';

export const CONFIG_MOBILE = { width: 544, height: 960, fps: 30, bitrate: 1_200_000, codec: 'avc1.42E01E' };
export const CONFIG_PC = { width: 540, height: 960, fps: 30, bitrate: 2_500_000, codec: 'avc1.4D401F' };

export async function generateStampVideo(params, onProgress) {
    const isMobile = /iPhone|iPad|Android/i.test(navigator.userAgent);
    const config = isMobile ? CONFIG_MOBILE : CONFIG_PC;
    const { stampFiles, title, bgColor, stampBgColor, textColor, canvas, ctx } = params;

    const edgeMargin = 30;
    const innerWidth = config.width - (edgeMargin * 2);
    const innerHeight = config.height - (edgeMargin * 2);

    const sortedFiles = [...stampFiles].sort((a, b) => {
        const numA = parseInt(a.name.match(/\d+/)?.[0] || 0);
        const numB = parseInt(b.name.match(/\d+/)?.[0] || 0);
        return numA - numB;
    });

    // --- 画像解析処理（エラー対策強化版） ---
    const stampData = [];
    for (const file of sortedFiles) {
        try {
            const buffer = await file.async("arraybuffer");
            let frames = await VideoCore.getRenderedFrames(buffer);
            
            // APNGでない、またはフレーム取得失敗時のフォールバック
            if (!frames || frames.length === 0) {
                const blob = new Blob([buffer], { type: 'image/png' });
                const img = await new Promise((resolve, reject) => {
                    const i = new Image();
                    i.onload = () => resolve(i);
                    i.onerror = () => reject(new Error("Image Load Failed"));
                    i.src = URL.createObjectURL(blob);
                });
                frames = [{ img: img, delay: 1000 }];
            }

            if (frames && frames.length > 0 && frames[0].img) {
                const totalDuration = frames.reduce((acc, f) => acc + (f.delay || 100), 0);
                stampData.push({ 
                    frames, 
                    totalDuration, 
                    img: frames[0].img,
                    width: frames[0].img.width,
                    height: frames[0].img.height
                });
            }
        } catch (e) {
            console.warn(`Skip file ${file.name} due to error:`, e);
            continue; // エラーが起きたファイルはスキップして継続
        }
    }

    if (stampData.length === 0) throw new Error("有効な画像ファイルが見つかりませんでした。");

    // 最初の有効な画像の幅で絵文字判定
    const isEmoji = stampData[0].width === 180;
    const cols = isEmoji ? 7 : 4;
    
    const headerHeight = 100;
    const availableHeightForStamps = innerHeight - headerHeight;
    const cellWidth = innerWidth / cols;
    const cellHeight = availableHeightForStamps / 6;
    const padding = 6;

    const totalRows = Math.ceil(stampData.length / cols);
    const shouldScroll = totalRows > 6;
    const scrollDuration = 5; 
    const totalFrames = shouldScroll ? (scrollDuration * config.fps) : 90;
    const scrollLimit = Math.max(0, (totalRows * cellHeight) - availableHeightForStamps);

    const { muxer, encoder } = await VideoCore.createEncoder(config, isMobile);

    for (let f = 0; f < totalFrames; f++) {
        if (f % 30 === 0 && onProgress) onProgress(f, totalFrames);

        const progress = shouldScroll ? (f / totalFrames) : 0;
        const offsetY = progress * scrollLimit;

        ctx.fillStyle = bgColor;
        ctx.fillRect(0, 0, config.width, config.height);

        ctx.save();
        ctx.beginPath();
        ctx.rect(edgeMargin, edgeMargin + headerHeight, innerWidth, availableHeightForStamps);
        ctx.clip();

        for (let i = 0; i < stampData.length; i++) {
            const item = stampData[i];
            const row = Math.floor(i / cols);
            const col = i % cols;
            
            const cellX = edgeMargin + (col * cellWidth);
            const cellY = edgeMargin + headerHeight + (row * cellHeight) - offsetY;

            // 描画範囲外なら計算をスキップ
            if (cellY < edgeMargin + headerHeight - cellHeight || cellY > config.height) continue;

            const ratio = Math.min((cellWidth - padding * 2) / item.width, (cellHeight - padding * 2) / item.height);
            const drawW = item.width * ratio;
            const drawH = item.height * ratio;
            const drawX = cellX + (cellWidth - drawW) / 2;
            const drawY = cellY + (cellHeight - drawH) / 2;

            const loopTime = ((f / config.fps) * 1000) % item.totalDuration;
            let acc = 0;
            let activeFrame = item.frames[0].img;
            for (const frame of item.frames) {
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
            if (activeFrame) {
                ctx.drawImage(activeFrame, drawX, drawY, drawW, drawH);
            }
            ctx.restore();
        }
        ctx.restore();

        // ヘッダー（タイトル）
        ctx.fillStyle = bgColor;
        ctx.fillRect(0, 0, config.width, edgeMargin + headerHeight);
        ctx.fillStyle = textColor;
        ctx.font = "bold 28px sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(title, config.width / 2, edgeMargin + (headerHeight / 2) + 10);

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
