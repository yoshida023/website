// videoEncoder.js
import parseAPNG from 'https://cdn.skypack.dev/apng-js';
import { Muxer, ArrayBufferTarget } from 'https://unpkg.com/mp4-muxer@latest/build/mp4-muxer.mjs';

// モバイル向け：低プロファイル・低ビットレートで互換性重視
export const CONFIG_MOBILE = {
    width: 544, height: 960, fps: 30, bitrate: 1_200_000, 
    codec: 'avc1.42E01E' 
};

// PC向け：高プロファイル・高ビットレートで安定重視
export const CONFIG_PC = {
    width: 540, height: 960, fps: 30, bitrate: 2_500_000, 
    codec: 'avc1.4D401F' 
};

function fillSingleLineTextAutoFit(ctx, text, x, y, maxWidth, fontSize) {
    ctx.save();
    let currentSize = fontSize;
    ctx.textAlign = "center"; ctx.textBaseline = "top";
    do {
        ctx.font = `bold ${currentSize}px sans-serif`;
        if (ctx.measureText(text).width <= maxWidth || currentSize <= 10) break;
        currentSize -= 1;
    } while (currentSize > 10);
    ctx.fillText(text, x, y); ctx.restore();
    return currentSize * 1.3;
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
        error: (e) => { console.error("Encoder Error:", e); }
    });

    encoder.configure({ 
        codec: config.codec, width: config.width, height: config.height, 
        bitrate: config.bitrate, framerate: config.fps
    });

    let frameCount = 0;
    for (let i = 0; i < stampFiles.length; i++) {
        if (onProgress) onProgress(i + 1, stampFiles.length);
        const buffer = await stampFiles[i].async("arraybuffer");
        let frames = await getRenderedFrames(buffer);
        
        if (!frames) {
            const blob = await stampFiles[i].async("blob");
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

async function getRenderedFrames(buffer) {
    try {
        const apng = parseAPNG(buffer);
        if (apng instanceof Error) return null;
        await apng.createImages();
        const renderedFrames = [];
        const workCanvas = document.createElement('canvas');
        workCanvas.width = apng.width; workCanvas.height = apng.height;
        const workCtx = workCanvas.getContext('2d');
        const prevCanvas = document.createElement('canvas');
        prevCanvas.width = apng.width; prevCanvas.height = apng.height;
        const prevCtx = prevCanvas.getContext('2d');
        for (const frame of apng.frames) {
            if (frame.disposeOp === 2) {
                prevCtx.clearRect(0, 0, apng.width, apng.height);
                prevCtx.drawImage(workCanvas, 0, 0);
            }
            if (frame.blendOp === 0) workCtx.clearRect(frame.left, frame.top, frame.width, frame.height);
            workCtx.drawImage(frame.imageElement, frame.left, frame.top);
            const snapshot = document.createElement('canvas');
            snapshot.width = apng.width; snapshot.height = apng.height;
            snapshot.getContext('2d').drawImage(workCanvas, 0, 0);
            renderedFrames.push({ img: snapshot, delay: frame.delay });
            if (frame.disposeOp === 1) workCtx.clearRect(frame.left, frame.top, frame.width, frame.height);
            else if (frame.disposeOp === 2) {
                workCtx.clearRect(0, 0, apng.width, apng.height);
                workCtx.drawImage(prevCanvas, 0, 0);
            }
        }
        return renderedFrames;
    } catch (e) { return null; }
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
    const W = config.width; const H = config.height;
    ctx.fillStyle = p.bgColor; ctx.fillRect(0, 0, W, H);
    let currentY = 80; 
    if (p.mainImg) {
        const size = 110; const imgX = (W - size) / 2;
        ctx.save(); ctx.beginPath(); ctx.roundRect(imgX, currentY, size, size, 20);
        ctx.fillStyle = p.stampBgColor; ctx.fill(); ctx.clip();
        const r = Math.min((size - 10) / p.mainImg.width, (size - 10) / p.mainImg.height);
        ctx.drawImage(p.mainImg, imgX + (size - p.mainImg.width * r) / 2, currentY + (size - p.mainImg.height * r) / 2, p.mainImg.width * r, p.mainImg.height * r);
        ctx.restore(); currentY += size + 25; 
    }
    ctx.fillStyle = p.textColor;
    const titleLineHeight = fillSingleLineTextAutoFit(ctx, p.title, W / 2, currentY, 480, 34);
    currentY += titleLineHeight + 5; 
    ctx.save(); ctx.font = "20px sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "top";
    ctx.fillStyle = p.textColor; ctx.fillText(p.author, W / 2, currentY); ctx.restore();
    ctx.save(); ctx.textAlign = "center"; ctx.textBaseline = "alphabetic"; ctx.font = "bold 32px sans-serif";
    ctx.fillStyle = p.textColor; ctx.fillText(p.footer, W / 2, H - 80); ctx.restore();
    const cardSize = 420; const cardX = (W - cardSize) / 2; const cardY = 320; 
    ctx.save(); ctx.beginPath(); ctx.roundRect(cardX, cardY, cardSize, cardSize, 30);
    ctx.fillStyle = p.stampBgColor; ctx.fill(); ctx.clip();
    if (p.targetFrame && p.targetFrame.img) {
        const img = p.targetFrame.img;
        const r = Math.min((cardSize - 40) / img.width, (cardSize - 40) / img.height);
        ctx.drawImage(img, cardX + (cardSize - img.width * r) / 2, cardY + (cardSize - img.height * r) / 2, img.width * r, img.height * r);
    }
    ctx.restore();
    ctx.save(); ctx.textAlign = "center"; ctx.fillStyle = p.textColor; ctx.font = "bold 40px sans-serif";
    ctx.fillText(`No. ${p.index}`, W / 2, cardY + cardSize + 70); ctx.restore();
}

async function loadImage(url) {
    return new Promise(res => {
        const img = new Image();
        img.onload = () => res(img);
        img.onerror = () => res(null);
        img.src = url;
    });
}
