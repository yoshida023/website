// videoEncoder.js
import parseAPNG from 'https://cdn.skypack.dev/apng-js';
import { Muxer, ArrayBufferTarget } from 'https://unpkg.com/mp4-muxer@latest/build/mp4-muxer.mjs';

// モバイル：iOSの制限に合わせて 544 (16の倍数) に設定
export const CONFIG_MOBILE = {
    width: 544, height: 960, fps: 30, bitrate: 1_200_000, 
    codec: 'avc1.42E01E' 
};

// PC：これまでの安定設定を維持
export const CONFIG_PC = {
    width: 540, height: 960, fps: 30, bitrate: 2_500_000, 
    codec: 'avc1.4D401F' 
};

function fillSingleLineTextAutoFit(ctx, text, x, y, maxWidth, fontSize) {
    ctx.save();
    let currentSize = fontSize;
    ctx.textAlign = \"center\"; ctx.textBaseline = \"top\";
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
        error: (e) => { 
            console.error(\"Encoder Error:\", e);
            throw new Error(\"Encoder Error: \" + e.message);
        }
    });

    // 構成の適用
    encoder.configure({ 
        codec: config.codec, 
        width: config.width, 
        height: config.height, 
        bitrate: config.bitrate, 
        framerate: config.fps
    });

    // 【重要】設定が反映されるまで極小時間待機（スマホでの安定化）
    await new Promise(r => setTimeout(r, 100));

    let frameCount = 0;
    for (let i = 0; i < stampFiles.length; i++) {
        if (onProgress) onProgress(i + 1, stampFiles.length);
        const buffer = await stampFiles[i].async(\"arraybuffer\");
        let frames = await getRenderedFrames(buffer);
        
        if (!frames) {
            const blob = await stampFiles[i].async(\"blob\");
            const img = await loadImage(URL.createObjectURL(blob));
            if (img) frames = [{ img, delay: 1000 }];
        }
        if (!frames) continue;

        let stampTime = 0;
        const totalApngMs = frames.reduce((a, b) => a + b.delay, 0) || 1000;
        const durationLimit = fullAnim ? (totalApngMs / 1000) : 1.0;

        while (stampTime < durationLimit) {
            // エラー回避のため、設定状態を確認してからエンコード
            if (encoder.state !== \"configured\") {
                 throw new Error(\"VideoEncoder is not configured state.\");
            }

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

// --- (getRenderedFrames, getFrameAtTime, drawUI, loadImage は前回と同じため省略) ---
