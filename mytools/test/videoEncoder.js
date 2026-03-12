// videoEncoder.js
import { VideoCore } from './modules/VideoCore.js';

export async function generateStampVideo(params) {
    const { file, canvas, ctx } = params;

    const buffer = await file.async("arraybuffer");
    const frames = await VideoCore.getRenderedFrames(buffer);
    if (!frames || frames.length === 0) throw new Error("APNGの解析に失敗しました。");

    const totalDuration = frames.reduce((acc, f) => acc + f.delay, 0);
    
    // 1. サイズの偶数補正 (iOS/H.264では必須)
    let width = frames[0].img.width;
    let height = frames[0].img.height;
    if (width % 2 !== 0) width += 1;
    if (height % 2 !== 0) height += 1;

    canvas.width = width;
    canvas.height = height;

    const fps = 30;
    // 短すぎるとエラーになる場合があるため、最低1秒(30フレーム)を確保
    const totalFrames = Math.max(30, Math.ceil((totalDuration / 1000) * fps));
    
    const isIOS = /iPhone|iPad|iPod/i.test(navigator.userAgent);
    
    // 2. iOS向けのエンコード設定
    const config = {
        width,
        height,
        fps,
        bitrate: 1_500_000,
        // iOSでは avc1.42E01E (Baseline Profile) が最も安定します
        codec: isIOS ? 'avc1.42E01E' : 'avc1.4D401F' 
    };

    // VideoCore.js 内で encoder.configure(config) が呼ばれます
    const { muxer, encoder } = await VideoCore.createEncoder(config, isIOS);

    for (let f = 0; f < totalFrames; f++) {
        const loopTime = ((f / fps) * 1000) % totalDuration;
        
        let acc = 0;
        let activeFrame = frames[frames.length - 1].img;
        for (const frame of frames) {
            acc += frame.delay;
            if (loopTime < acc) {
                activeFrame = frame.img;
                break;
            }
        }

        // 3. 背景の塗りつぶし (透過のままではiOSでエラーになる場合があるため白で塗りつぶし)
        ctx.fillStyle = "#FFFFFF"; 
        ctx.fillRect(0, 0, width, height);
        ctx.drawImage(activeFrame, 0, 0, frames[0].img.width, frames[0].img.height);

        // VideoFrameの作成
        const vFrame = new VideoFrame(canvas, { 
            timestamp: Math.floor((f * 1000000) / fps), 
            duration: Math.floor(1000000 / fps) 
        });

        try {
            encoder.encode(vFrame);
        } catch (e) {
            console.error("Encode error:", e);
            vFrame.close();
            throw e;
        }
        vFrame.close();
    }

    await encoder.flush();
    muxer.finalize();
    return new Blob([muxer.target.buffer], { type: 'video/mp4' });
}
