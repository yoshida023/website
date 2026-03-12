// videoEncoder.js
import { VideoCore } from './modules/VideoCore.js';

export async function generateStampVideo(params) {
    const { file, canvas, ctx } = params;

    const buffer = await file.async("arraybuffer");
    const frames = await VideoCore.getRenderedFrames(buffer);
    if (!frames || frames.length === 0) throw new Error("APNGの解析に失敗しました。");

    const totalDuration = frames.reduce((acc, f) => acc + f.delay, 0);
    
    // --- 重要：サイズの偶数補正 ---
    // H.264エンコードは幅・高さが偶数である必要があります
    let width = frames[0].img.width;
    let height = frames[0].img.height;
    if (width % 2 !== 0) width += 1;
    if (height % 2 !== 0) height += 1;

    canvas.width = width;
    canvas.height = height;

    const fps = 30;
    const totalFrames = Math.max(30, Math.ceil((totalDuration / 1000) * fps));
    
    const isMobile = /iPhone|iPad|Android/i.test(navigator.userAgent);
    
    // コーデック設定（互換性の高い設定を選択）
    const config = {
        width,
        height,
        fps,
        bitrate: 2_000_000,
        // 解像度が特殊な場合を考慮し、PC/モバイル共に柔軟なプロファイルを使用
        codec: 'avc1.4D401F' 
    };

    const { muxer, encoder } = await VideoCore.createEncoder(config, isMobile);

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

        // 描画処理
        ctx.fillStyle = "#FFFFFF"; // 透過部分を白背景にする（必要に応じて変更）
        ctx.fillRect(0, 0, width, height);
        ctx.drawImage(activeFrame, 0, 0, frames[0].img.width, frames[0].img.height);

        const vFrame = new VideoFrame(canvas, { 
            timestamp: (f * 1000000) / fps, 
            duration: 1000000 / fps 
        });

        try {
            encoder.encode(vFrame);
        } catch (e) {
            console.error("Encode error at frame", f, e);
        }
        vFrame.close();
    }

    await encoder.flush();
    muxer.finalize();
    return new Blob([muxer.target.buffer], { type: 'video/mp4' });
}
