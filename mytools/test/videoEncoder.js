// videoEncoder.js
import { VideoCore } from './modules/VideoCore.js';

export async function generateStampVideo(params) {
    const { file, bgColor, canvas, ctx } = params;

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
    // iOSでの安定のため最低1秒を確保
    const totalFrames = Math.max(30, Math.ceil((totalDuration / 1000) * fps));
    
    const isIOS = /iPhone|iPad|iPod/i.test(navigator.userAgent);
    
    // 2. iOS向けのエンコード設定
    const config = {
        width,
        height,
        fps,
        bitrate: 1_500_000,
        // iOSでは Baseline Profile (42E01E) が最もエラーが少ない
        codec: isIOS ? 'avc1.42E01E' : 'avc1.4D401F' 
    };

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

        // 3. 背景色の適用
        // 透過部分を指定された色（デフォルト #8DACD6）で塗りつぶします
        ctx.fillStyle = bgColor || "#8DACD6";
        ctx.fillRect(0, 0, width, height);
        
        // スタンプを中心に描画（偶数補正によるズレを防止）
        ctx.drawImage(activeFrame, 0, 0, frames[0].img.width, frames[0].img.height);

        // 4. VideoFrameの作成（timestampを整数に丸める）
        const timestamp = Math.round((f * 1000000) / fps);
        const duration = Math.round(1000000 / fps);
        
        const vFrame = new VideoFrame(canvas, { 
            timestamp: timestamp, 
            duration: duration 
        });

        try {
            encoder.encode(vFrame);
        } catch (e) {
            vFrame.close();
            throw e;
        }
        vFrame.close();
    }

    await encoder.flush();
    muxer.finalize();
    return new Blob([muxer.target.buffer], { type: 'video/mp4' });
}
