// videoEncoder.js - preBuild for hp2025
import { VideoCore } from './modules/VideoCore.js';
import { UIHelper } from './modules/UIHelper.js';

export const CONFIG_MOBILE = { width: 544, height: 960, fps: 30, bitrate: 1_200_000, codec: 'avc1.42E01E' };
export const CONFIG_PC = { width: 540, height: 960, fps: 30, bitrate: 2_500_000, codec: 'avc1.4D401F' };

export async function generateStampVideo(params, onProgress) {
    const isMobile = /iPhone|iPad|Android/i.test(navigator.userAgent);
    const config = isMobile ? CONFIG_MOBILE : CONFIG_PC;
    const { stampFiles, title, author, bgColor, stampBgColor, textColor, canvas, ctx } = params;

    const sortedFiles = [...stampFiles].sort((a, b) => {
        const numA = parseInt(a.name.match(/\d+/)?.[0] || 0);
        const numB = parseInt(b.name.match(/\d+/)?.[0] || 0);
        return numA - numB;
    });

    const stampData = await Promise.all(sortedFiles.map(async (file) => {
        const buffer = await file.async("arraybuffer");
        const frames = await VideoCore.getRenderedFrames(buffer);
        const totalDuration = frames ? frames.reduce((acc, f) => acc + f.delay, 0) : 1000;
        const width = frames ? frames[0].img.width : 0;
        return { frames, totalDuration, width };
    }));

    // 判定と配置設定
    const isEmoji = stampData.length > 0 && stampData[0].width === 180;
    const cols = isEmoji ? 7 : 4;
    
    // アイテムの描画サイズと余白の計算
    const itemSize = isEmoji ? 60 : 100; // 描画時のサイズ
    const padding = (config.width - (itemSize * cols)) / (cols + 1); // 左右の余白を均等に

    const { muxer, encoder } = await VideoCore.createEncoder(config, isMobile);

    const totalRows = Math.ceil(stampData.length / cols);
    const scrollDuration = 10;
    const totalFrames = scrollDuration * config.fps;
    const scrollLimit = Math.max(0, (totalRows * (itemSize + padding)) - config.height + 250);

    for (let f = 0; f < totalFrames; f++) {
        if (f % 30 === 0 && onProgress) onProgress(f, totalFrames);

        const progress = f / totalFrames;
        const offsetY = progress * scrollLimit;
        const currentTimeMs = (f / config.fps) * 1000;

        ctx.fillStyle = bgColor;
        ctx.fillRect(0, 0, config.width, config.height);

        for (let i = 0; i < stampData.length; i++) {
            const { frames, totalDuration } = stampData[i];
            const row = Math.floor(i / cols);
            const col = i % cols;
            
            // 均等配置の座標計算
            const x = padding + (col * (itemSize + padding));
            const y = (row * (itemSize + padding)) - offsetY + 200;

            if (y > -itemSize && y < config.height) {
                const loopTime = currentTimeMs % totalDuration;
                let acc = 0;
                let activeFrame = frames[frames.length - 1].img;
                for (const frame of frames) {
                    acc += frame.delay;
                    if (loopTime < acc) {
                        activeFrame = frame.img;
                        break;
                    }
                }
                UIHelper.drawRoundedImage(ctx, activeFrame, x, y, itemSize, 10, stampBgColor);
            }
        }

        // タイトルエリア
        ctx.fillStyle = bgColor;
        ctx.fillRect(0, 0, config.width, 180);
        ctx.fillStyle = textColor;
        ctx.font = "bold 32px sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(title, config.width / 2, 80);
        ctx.font = "20px sans-serif";
        ctx.fillText(author, config.width / 2, 120);

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
