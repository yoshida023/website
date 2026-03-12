// videoEncoder.js
import { VideoCore } from './modules/VideoCore.js';

export async function generateStampVideo(params) {
    const { file, canvas, ctx } = params;

    // APNGのデコード
    const buffer = await file.async("arraybuffer");
    const frames = await VideoCore.getRenderedFrames(buffer);
    if (!frames || frames.length === 0) throw new Error("解析失敗");

    const totalDuration = frames.reduce((acc, f) => acc + f.delay, 0);
    const width = frames[0].img.width;
    const height = frames[0].img.height;

    // 動画サイズをスタンプに合わせる
    canvas.width = width;
    canvas.height = height;

    // エンコード設定
    const fps = 30;
    const totalFrames = Math.max(30, Math.ceil((totalDuration / 1000) * fps));
    
    // デバイスに応じたコーデック選択（互換性重視）
    const isMobile = /iPhone|iPad|Android/i.test(navigator.userAgent);
    const config = {
        width,
        height,
        fps,
        bitrate: 2_000_000,
        codec: isMobile ? 'avc1.42E01E' : 'avc1.4D401F'
    };

    const { muxer, encoder } = await VideoCore.createEncoder(config, isMobile);

    for (let f = 0; f < totalFrames; f++) {
        const loopTime = ((f / fps) * 1000) % totalDuration;
        
        // 現在の時刻に最適なフレームを選択
        let acc = 0;
        let activeFrame = frames[frames.length - 1].img;
        for (const frame of frames) {
            acc += frame.delay;
            if (loopTime < acc) {
                activeFrame = frame.img;
                break;
            }
        }

        // 描画（余計な背景やテキストは一切なし）
        ctx.clearRect(0, 0, width, height);
        ctx.drawImage(activeFrame, 0, 0, width, height);

        const vFrame = new VideoFrame(canvas, { 
            timestamp: (f * 1000000) / fps, 
            duration: 1000000 / fps 
        });
        encoder.encode(vFrame);
        vFrame.close();
    }

    await encoder.flush();
    muxer.finalize();
    return new Blob([muxer.target.buffer], { type: 'video/mp4' });
}
