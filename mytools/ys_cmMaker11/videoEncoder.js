// videoEncoder.js - preBuild for hp2025
import { VideoCore } from './modules/VideoCore.js';
import { UIHelper } from './modules/UIHelper.js';

export const CONFIG_MOBILE = { width: 544, height: 960, fps: 30, bitrate: 1_200_000, codec: 'avc1.42E01E' };
export const CONFIG_PC = { width: 540, height: 960, fps: 30, bitrate: 2_500_000, codec: 'avc1.4D401F' };

/**
 * preBuild for hp2025: 一覧スクロール動画生成関数
 */
export async function generateStampVideo(params, onProgress) {
    const isMobile = /iPhone|iPad|Android/i.test(navigator.userAgent);
    const config = isMobile ? CONFIG_MOBILE : CONFIG_PC;
    const { 
        stampFiles, mainImg, title, author, footer, 
        bgColor, stampBgColor, textColor, canvas, ctx 
    } = params;

    // 設定: スタンプ(4x10)か絵文字(7x6)かの判定
    const isEmoji = stampFiles.length > 40;
    const cols = isEmoji ? 7 : 4;
    const cellWidth = config.width / cols;
    const cellHeight = cellWidth; // 正方形として配置

    const { muxer, encoder } = await VideoCore.createEncoder(config, isMobile);

    // 1. 全スタンプを画像として読み込み
    const loadedImages = await Promise.all(stampFiles.map(async (file) => {
        const buffer = await file.async("arraybuffer");
        const frames = await VideoCore.getRenderedFrames(buffer);
        return frames ? frames[0].img : null;
    }));

    // 2. スクロール設定（全行をスクロールする時間）
    const totalRows = Math.ceil(loadedImages.length / cols);
    const scrollDuration = 10; // 秒数
    const totalFrames = scrollDuration * config.fps;
    
    // スクロール範囲: 全体の高さ - 画面の高さ
    const scrollLimit = Math.max(0, (totalRows * cellHeight) - config.height + 200);

    for (let f = 0; f < totalFrames; f++) {
        if (f % 30 === 0 && onProgress) onProgress(f, totalFrames);

        const progress = f / totalFrames;
        const offsetY = progress * scrollLimit;

        // --- 描画処理 ---
        ctx.fillStyle = bgColor;
        ctx.fillRect(0, 0, config.width, config.height);

        // スタンプ描画
        for (let i = 0; i < loadedImages.length; i++) {
            const row = Math.floor(i / cols);
            const col = i % cols;
            const x = col * cellWidth + (cellWidth * 0.1);
            const y = (row * cellHeight) - offsetY + 150; // タイトル分下に配置

            if (y > -cellHeight && y < config.height) {
                UIHelper.drawRoundedImage(ctx, loadedImages[i], x, y, cellWidth * 0.8, 10, stampBgColor);
            }
        }

        // 固定ヘッダー/フッター描画
        ctx.fillStyle = bgColor;
        ctx.fillRect(0, 0, config.width, 150);
        ctx.fillStyle = textColor;
        ctx.font = "bold 30px sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(title, config.width / 2, 50);

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