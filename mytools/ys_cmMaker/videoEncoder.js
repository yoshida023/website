// videoEncoder.js
import parseAPNG from 'https://cdn.skypack.dev/apng-js';
import { Muxer, ArrayBufferTarget } from 'https://unpkg.com/mp4-muxer@latest/build/mp4-muxer.mjs';

export const VIDEO_CONFIG = {
    width: 544, // 16の倍数
    height: 960,
    fps: 30,
    bitrate: 1_000_000,
    codec: 'avc1.42E01E' // Baseline Profile
};

export async function generateStampVideo(params, onProgress) {
    const { stampFiles, mainImg, title, author, footer, bgColor, stampBgColor, textColor, canvas, ctx } = params;
    
    let muxer = new Muxer({
        target: new ArrayBufferTarget(),
        video: { codec: 'avc', width: VIDEO_CONFIG.width, height: VIDEO_CONFIG.height },
        fastStart: 'in-memory'
    });

    let encoder = new VideoEncoder({
        output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
        error: (e) => { throw new Error("Encoding task failed: " + e.message); }
    });

    encoder.configure({ 
        codec: VIDEO_CONFIG.codec, 
        width: VIDEO_CONFIG.width, 
        height: VIDEO_CONFIG.height, 
        bitrate: VIDEO_CONFIG.bitrate, 
        framerate: VIDEO_CONFIG.fps,
        latencyMode: 'realtime'
    });

    // 初期化待ち
    while (encoder.state !== "configured") await new Promise(r => setTimeout(r, 100));

    let frameCount = 0;

    for (let i = 0; i < stampFiles.length; i++) {
        if (onProgress) onProgress(i + 1, stampFiles.length);

        const buffer = await stampFiles[i].async("arraybuffer");
        let frames = await getRenderedFrames(buffer);
        if (!frames) {
            const blob = await stampFiles[i].async("blob");
            const img = await loadImage(URL.createObjectURL(blob));
            if (!img) continue;
            frames = [{ img, delay: 1000 }];
        }

        let stampTime = 0;
        const totalApngMs = frames.reduce((a, b) => a + b.delay, 0) || 1000;

        while (stampTime < 1.0) {
            // iOS負荷対策: キューが空になるまで待機
            while (encoder.encodeQueueSize > 0) {
                await new Promise(r => setTimeout(r, 10));
            }

            drawUI(ctx, { title, author, footer, mainImg, bgColor, stampBgColor, textColor, targetFrame: getFrameAtTime(frames, stampTime, totalApngMs), index: i + 1 });

            const vFrame = new VideoFrame(canvas, { 
                timestamp: (frameCount++ * 1000000) / VIDEO_CONFIG.fps, 
                duration: 1000000 / VIDEO_CONFIG.fps 
            });
            encoder.encode(vFrame);
            vFrame.close();
            
            stampTime += 1 / VIDEO_CONFIG.fps;
            await new Promise(r => setTimeout(r, 1)); // 物理的な隙間
        }
        
        if (i % 5 === 0) await encoder.flush();
    }

    await encoder.flush();
    muxer.finalize();
    return new Blob([muxer.target.buffer], { type: 'video/mp4' });
}

// --- Helper Functions ---
async function getRenderedFrames(buffer) {
    try {
        const apng = parseAPNG(buffer);
        if (apng instanceof Error) return null;
        await apng.createImages();
        const renderedFrames = [];
        const workCanvas = document.createElement('canvas');
        workCanvas.width = apng.width; workCanvas.height = apng.height;
        const workCtx = workCanvas.getContext('2d');
        apng.frames.forEach((frame) => {
            if (frame.disposeOp === 1 || frame.blendOp === 0) workCtx.clearRect(frame.left, frame.top, frame.width, frame.height);
            workCtx.drawImage(frame.imageElement, frame.left, frame.top);
            const snapshot = document.createElement('canvas');
            snapshot.width = apng.width; snapshot.height = apng.height;
            snapshot.getContext('2d').drawImage(workCanvas, 0, 0);
            renderedFrames.push({ img: snapshot, delay: frame.delay });
        });
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
    return frames[0];
}

function drawUI(ctx, p) {
    const { width: W, height: H } = VIDEO_CONFIG;
    ctx.fillStyle = p.bgColor; ctx.fillRect(0, 0, W, H);

    // Header Main Image
    if (p.mainImg) {
        const size = 90;
        ctx.save();
        ctx.beginPath(); ctx.roundRect(50, 70, size, size, 15);
        ctx.fillStyle = p.stampBgColor; ctx.fill(); ctx.clip();
        const r = Math.min((size - 10) / p.mainImg.width, (size - 10) / p.mainImg.height);
        ctx.drawImage(p.mainImg, 50 + (size - p.mainImg.width * r) / 2, 70 + (size - p.mainImg.height * r) / 2, p.mainImg.width * r, p.mainImg.height * r);
        ctx.restore();
    }

    // Text
    ctx.fillStyle = p.textColor; ctx.textAlign = "left";
    ctx.font = "bold 26px sans-serif"; ctx.fillText(p.title, 160, 105);
    ctx.font = "20px sans-serif"; ctx.fillText(p.author, 160, 140);
    ctx.textAlign = "center"; ctx.font = "bold 32px sans-serif";
    ctx.fillText(p.footer, W / 2, H - 100);

    // Stamp Card
    const cardSize = 420;
    const cardX = (W - cardSize) / 2;
    const cardY = (H - cardSize) / 2;
    ctx.save();
    ctx.beginPath(); ctx.roundRect(cardX, cardY, cardSize, cardSize, 30);
    ctx.fillStyle = p.stampBgColor; ctx.fill(); ctx.clip();
    const r = Math.min((cardSize - 40) / p.targetFrame.img.width, (cardSize - 40) / p.targetFrame.img.height);
    ctx.drawImage(p.targetFrame.img, (W - p.targetFrame.img.width * r) / 2, (H - p.targetFrame.img.height * r) / 2, p.targetFrame.img.width * r, p.targetFrame.img.height * r);
    ctx.restore();

    ctx.textAlign = "center"; ctx.fillStyle = p.textColor; ctx.font = "bold 40px sans-serif";
    ctx.fillText(`No. ${p.index}`, W / 2, cardY + cardSize + 70);
}

async function loadImage(url) {
    return new Promise(res => {
        const img = new Image();
        img.onload = () => res(img);
        img.onerror = () => res(null);
        img.src = url;
    });
}
