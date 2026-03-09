// videoEncoder.js
import { VideoCore } from './modules/VideoCore.js';
import { UIHelper } from './modules/UIHelper.js';

// デバイス別の最適化設定
export const CONFIG_MOBILE = { 
    width: 544, height: 960, fps: 30, bitrate: 1_200_000, codec: 'avc1.42E01E' 
};
export const CONFIG_PC = { 
    width: 540, height: 960, fps: 30, bitrate: 2_500_000, codec: 'avc1.4D401F' 
};

/**
 * スタンプ紹介動画を生成するメイン関数
 */
export async function generateStampVideo(params, onProgress) {
    const isMobile = /iPhone|iPad|Android/i.test(navigator.userAgent);
    const config = isMobile ? CONFIG_MOBILE : CONFIG_PC;
    const { 
        stampFiles, mainImg, title, author, footer, 
        bgColor, stampBgColor, textColor, fullAnim, canvas, ctx 
    } = params;

    // 1. エンコーダーの初期化（VideoCoreモジュールを使用）
    const { muxer, encoder } = await VideoCore.createEncoder(config, isMobile);

    let frameCount = 0;
    
    // 2. 各スタンプファイルの処理
    for (let i = 0; i < stampFiles.length; i++) {
        if (onProgress) onProgress(i + 1, stampFiles.length);

        const buffer = await stampFiles[i].async("arraybuffer");
        // APNGの正確なレンダリング（VideoCoreモジュールを使用）
        let frames = await VideoCore.getRenderedFrames(buffer);
        
        if (!frames) {
            // 静止画の場合のフォールバック
            const blob = new Blob([buffer]);
            const img = await loadImage(URL.createObjectURL(blob));
            if (img) frames = [{ img, delay: 1000 }];
        }
        if (!frames) continue;

        const totalApngMs = frames.reduce((a, b) => a + b.delay, 0) || 1000;
        const durationLimit = fullAnim ? (totalApngMs / 1000) : 1.0;
        let stampTime = 0;

        // 3. 動画フレームの生成ループ
        while (stampTime < durationLimit) {
            // エンコードキューの空き待ち
            while (encoder.encodeQueueSize > 2) await new Promise(r => setTimeout(r, 10));

            // --- 描画処理 (UIHelperを使用) ---
            // 背景
            ctx.fillStyle = bgColor;
            ctx.fillRect(0, 0, config.width, config.height);

            // ヘッダーアイコン
            UIHelper.drawRoundedImage(ctx, mainImg, (config.width - 110) / 2, 80, 110, 20, stampBgColor);
            
            // タイトル（自動縮小ロジックを適用）
            let currentY = 215;
            ctx.fillStyle = textColor;
            const titleHeight = UIHelper.drawTextFit(ctx, title, config.width / 2, currentY, 480, 34);
            currentY += titleHeight + 8;

            // 作者名
            ctx.save();
            ctx.font = "20px sans-serif";
            ctx.textAlign = "center";
            ctx.textBaseline = "top";
            ctx.fillText(author, config.width / 2, currentY);
            ctx.restore();

            // メインスタンプ
            const currentFrame = getFrameAtTime(frames, stampTime, totalApngMs);
            UIHelper.drawRoundedImage(ctx, currentFrame.img, (config.width - 420) / 2, 330, 420, 30, stampBgColor);

            // スタンプ番号
            ctx.save();
            ctx.font = "bold 40px sans-serif";
            ctx.fillStyle = textColor;
            ctx.textAlign = "center";
            ctx.fillText(`No. ${i + 1}`, config.width / 2, 330 + 420 + 70);
            ctx.restore();

            // フッター/紹介文（長い場合に折り返すロジックを適用）
            // 下から130pxの位置から、幅480pxの範囲で折り返し描画
            UIHelper.drawTextWrap(ctx, footer, config.width / 2, config.height - 130, 480, 28);
            // --- 描画終了 ---

            // ビデオフレームをエンコーダーに送る
            const vFrame = new VideoFrame(canvas, { 
                timestamp: (frameCount++ * 1000000) / config.fps, 
                duration: 1000000 / config.fps 
            });
            encoder.encode(vFrame);
            vFrame.close();
            
            stampTime += 1 / config.fps;
        }
        // スタンプごとにフラッシュしてメモリを解放
        await encoder.flush();
    }

    // 4. 仕上げ
    await encoder.flush();
    muxer.finalize();
    return new Blob([muxer.target.buffer], { type: 'video/mp4' });
}

/**
 * 指定時間における最適なフレームを取得
 */
function getFrameAtTime(frames, stampTime, totalApngMs) {
    const currentMs = (stampTime * 1000) % totalApngMs;
    let acc = 0;
    for (const f of frames) {
        acc += f.delay;
        if (currentMs < acc) return f;
    }
    return frames[frames.length - 1];
}

/**
 * 画像読み込みユーティリティ
 */
async function loadImage(url) {
    return new Promise(res => {
        const img = new Image();
        img.onload = () => res(img);
        img.onerror = () => res(null);
        img.src = url;
    });
}
