// videoEncoder.js
import parseAPNG from 'https://cdn.skypack.dev/apng-js';
import { Muxer, ArrayBufferTarget } from 'https://unpkg.com/mp4-muxer@latest/build/mp4-muxer.mjs';

export const CONFIG_MOBILE = {
    width: 544, height: 960, fps: 30, bitrate: 1_200_000, 
    codec: 'avc1.42E01E' 
};

export const CONFIG_PC = {
    width: 540, height: 960, fps: 30, bitrate: 2_500_000, 
    codec: 'avc1.4D401F' 
};

function drawSingleLineTextFit(ctx, text, x, y, maxWidth, initialFontSize) {
    ctx.save();
    let fontSize = initialFontSize;
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
}

export async function generateStampVideo(params, onProgress) {
    const isMobile = /iPhone|iPad|Android/i.test(navigator.userAgent);
    const config = isMobile ? CONFIG_MOBILE : CONFIG_PC;
    const { stampFiles, mainImg, title, author, footer, bgColor, stampBgColor, textColor, fullAnim, canvas, ctx } = params;
    
    let muxer = new Muxer({
        target: new ArrayBufferTarget(),
        video: { codec: 'avc', width: config.width, height: config.height },
        fastStart: 'in-memory'
    });

    let encoder = new VideoEncoder({
        output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
        error: (e) => { throw new Error("Encoding failed: " + e.message); }
    });

    encoder.configure({ 
        codec: config.codec, width: config.width, height: config.height, 
        bitrate: config.bitrate, framerate: config.fps,
        latencyMode: isMobile ? 'realtime' : 'quality'
    });

    let waitCount = 0;
    while (encoder.state !== "configured" && waitCount < 20) {
        await new Promise(r => setTimeout(r, 100));
        waitCount++;
    }

    let frameCount = 0;
    for (let i = 0; i < stampFiles.length; i++) {
        if (onProgress) onProgress(i + 1, stampFiles.length);

        const buffer = await stampFiles[i].async("arraybuffer");
        let frames = await getRenderedFrames(buffer);
        
        if (!frames) {
            const blob = new Blob([buffer]);
            const img = await loadImage(URL.createObjectURL(blob));
            if (img) frames = [{ img, delay: 1000 }];
        }
        if (!frames) continue;

        let stampTime = 0;
        const totalApngMs = frames.reduce((a, b) => a + b.delay, 0) || 1000;
        const durationLimit = fullAnim ? (totalApngMs / 1000) : 1.0;

        while (stampTime < durationLimit) {
            while (encoder.encodeQueueSize > 2) await new Promise(r => setTimeout(r, 10));

            drawUI(ctx, config, { 
                title, author, footer, mainImg, bgColor, stampBgColor, textColor, 
                targetFrame: getFrameAtTime(frames, stampTime, totalApngMs), 
                index: i + 1 
            });

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

/**
 * APNGレンダリングロジック（修正版）
 * 前の状態の保存・復元をより厳密に行います
 */
async function getRenderedFrames(buffer) {
    try {
        const apng = parseAPNG(buffer);
        if (apng instanceof Error) return null;
        await apng.createImages();

        const renderedFrames = [];
        const { width, height } = apng;

        // 実際に描画を進めるキャンバス
        const canvas = document.createElement('canvas');
        canvas.width = width; canvas.height = height;
        const ctx = canvas.getContext('2d');

        // disposeOp: 2 (Restore to previous) 用のバックアップ
        const prevCanvas = document.createElement('canvas');
        prevCanvas.width = width; prevCanvas.height = height;
        const prevCtx = prevCanvas.getContext('2d');

        for (let i = 0; i < apng.frames.length; i++) {
            const frame = apng.frames[i];

            // 1. 描画前の処理 (disposeOp: 2 の準備)
            if (frame.disposeOp === 2) {
                prevCtx.clearRect(0, 0, width, height);
                prevCtx.drawImage(canvas, 0, 0);
            }

            // 2. 合成 (blendOp)
            // blendOp: 0 (Source) なら領域をクリア、1 (Over) ならそのまま描画
            if (frame.blendOp === 0) {
                ctx.clearRect(frame.left, frame.top, frame.width, frame.height);
            }
            ctx.drawImage(frame.imageElement, frame.left, frame.top);

            // 3. 現在のフレームを記録
            const snapshot = document.createElement('canvas');
            snapshot.width = width; snapshot.height = height;
            snapshot.getContext('2d').drawImage(canvas, 0, 0);
            renderedFrames.push({ img: snapshot, delay: frame.delay });

            // 4. 描画後の処理 (disposeOp)
            if (frame.disposeOp === 1) {
                // 領域を透明にクリア
                ctx.clearRect(frame.left, frame.top, frame.width, frame.height);
            } else if (frame.disposeOp === 2) {
                // 前の状態（prevCanvas）に戻す
                ctx.clearRect(0, 0, width, height);
                ctx.drawImage(prevCanvas, 0, 0);
            }
        }
        return renderedFrames;
    } catch (e) { 
        console.error("APNG Render Error:", e);
        return null; 
    }
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

function drawUI(ctx, config, p) {
    const { width: W, height: H } = config;
    ctx.fillStyle = p.bgColor; ctx.fillRect(0, 0, W, H);

    let currentY = 80; 
    if (p.mainImg) {
        const size = 110; 
        const imgX = (W - size) / 2;
        ctx.save();
        ctx.beginPath(); ctx.roundRect(imgX, currentY, size, size, 20);
        ctx.fillStyle = p.stampBgColor; ctx.fill(); ctx.clip();
        const r = Math.min((size - 10) / p.mainImg.width, (size - 10) / p.mainImg.height);
        ctx.drawImage(p.mainImg, imgX + (size - p.mainImg.width * r) / 2, currentY + (size - p.mainImg.height * r) / 2, p.mainImg.width * r, p.mainImg.height * r);
        ctx.restore();
        currentY += size + 25; 
    }

    ctx.fillStyle = p.textColor;
    const titleHeight = drawSingleLineTextFit(ctx, p.title, W / 2, currentY, 480, 34);
    currentY += titleHeight + 5; 

    ctx.save();
    ctx.font = "20px sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "top";
    ctx.fillStyle = p.textColor; ctx.fillText(p.author, W / 2, currentY);
    ctx.restore();

    ctx.save();
    ctx.textAlign = "center"; ctx.textBaseline = "alphabetic"; ctx.font = "bold 32px sans-serif";
    ctx.fillStyle = p.textColor; ctx.fillText(p.footer, W / 2, H - 80);
    ctx.restore();

    const cardSize = 420;
    const cardX = (W - cardSize) / 2;
    const cardY = 320; 
    
    ctx.save();
    ctx.beginPath(); ctx.roundRect(cardX, cardY, cardSize, cardSize, 30);
    ctx.fillStyle = p.stampBgColor; ctx.fill(); ctx.clip();
    if (p.targetFrame && p.targetFrame.img) {
        const img = p.targetFrame.img;
        const r = Math.min((cardSize - 40) / img.width, (cardSize - 40) / img.height);
        ctx.drawImage(img, cardX + (cardSize - img.width * r) / 2, cardY + (cardSize - img.height * r) / 2, img.width * r, img.height * r);
    }
    ctx.restore();

    ctx.save();
    ctx.textAlign = "center"; ctx.fillStyle = p.textColor; ctx.font = "bold 40px sans-serif";
    ctx.fillText(`No. ${p.index}`, W / 2, cardY + cardSize + 70);
    ctx.restore();
}

async function loadImage(url) {
    return new Promise(res => {
        const img = new Image();
        img.onload = () => res(img);
        img.src = url;
    });
}
