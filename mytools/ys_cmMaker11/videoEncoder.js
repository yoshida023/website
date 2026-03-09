// videoEncoder.js - preBuild for hp2025
import { VideoCore } from './modules/VideoCore.js';
import { UIHelper } from './modules/UIHelper.js';

export const CONFIG_MOBILE = { width: 544, height: 960, fps: 30, bitrate: 1_200_000, codec: 'avc1.42E01E' };
export const CONFIG_PC = { width: 540, height: 960, fps: 30, bitrate: 2_500_000, codec: 'avc1.4D401F' };

/**
 * preBuild for hp2025: グリッドスクロール動画生成関数
 */
export async function generateStampVideo(params, onProgress) {
    const isMobile = /iPhone|iPad|Android/i.test(navigator.userAgent);
    const config = isMobile ? CONFIG_MOBILE : CONFIG_PC;
    const { 
        stampFiles, mainImg, title, author, footer, 
        bgColor, stampBgColor, textColor, canvas, ctx 
    } = params;

    // 1. ZIPからファイルを取得し、番号順にソートする
    const sortedFiles = [...stampFiles].sort((a, b) => {
        const numA = parseInt(a.name.match(/\d+/)?.[0] || 0);
        const numB = parseInt(b.name.match(/\d+/)?.[0] || 0);
        return numA - numB;
    });

    // 2. レイアウト判定
    const isEmoji = sortedFiles.length > 40;
    const cols = isEmoji ? 7 : 4;
    const cellWidth = config.width / cols;
    const cellHeight = cellWidth;

    const { muxer, encoder } = await VideoCore.createEncoder(config, isMobile);

    // 3. 画像の事前読み込み
    const loadedImages = await Promise.all(sortedFiles.map(async (file) => {
        const buffer = await file.async("arraybuffer");
        const frames = await VideoCore.getRenderedFrames(buffer);
        return frames ? frames[0].img : null;
    }));

    // 4. スクロールアニメーション設定
    const totalRows = Math.ceil(loadedImages.length / cols);
    const scrollDuration = 8; // 全スクロールにかける秒数
    const totalFrames = scrollDuration * config.fps;
    const scrollLimit = Math.max(0, (totalRows * cellHeight) - config.height + 200);

    for (let f = 0; f < totalFrames; f++) {
        if (f % 30 === 0 && onProgress) onProgress(f, totalFrames);

        const progress = f / totalFrames;
        const offsetY = progress * scrollLimit;

        // 背景描画
        ctx.fillStyle = bgColor;
        ctx.fillRect(0, 0, config.width, config.height);

        // 各スタンプのグリッド描画
        for (let i = 0; i < loadedImages.length; i++) {
            const row = Math.floor(i / cols);
            const col = i % cols;
            const x = col * cellWidth + (cellWidth * 0.05);
            const y = (row * cellHeight) - offsetY + 180; // タイトル分を下げる

            // 画面内にあるスタンプのみ描画
            if (y > -cellHeight && y < config.height) {
                UIHelper.drawRoundedImage(ctx, loadedImages[i], x, y, cellWidth * 0.9, 10, stampBgColor);
            }
        }

        // 上部タイトル領域（隠すために重ね塗り）
        ctx.fillStyle = bgColor;
        ctx.fillRect(0, 0, config.width, 160);
        
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
