// modules/VideoCore.js
import parseAPNG from 'https://cdn.skypack.dev/apng-js';
import { Muxer, ArrayBufferTarget } from 'https://unpkg.com/mp4-muxer@latest/build/mp4-muxer.mjs';

export class VideoCore {
    /**
     * APNGを解析し、全フレームを正確にレンダリングしたCanvas配列を返す
     */
    static async getRenderedFrames(buffer) {
        try {
            const apng = parseAPNG(buffer);
            if (apng instanceof Error) return null;
            await apng.createImages();

            const renderedFrames = [];
            const { width, height } = apng;
            const canvas = document.createElement('canvas');
            canvas.width = width; canvas.height = height;
            const ctx = canvas.getContext('2d');
            const prevCanvas = document.createElement('canvas');
            prevCanvas.width = width; prevCanvas.height = height;
            const prevCtx = prevCanvas.getContext('2d');

            for (const frame of apng.frames) {
                if (frame.disposeOp === 2) {
                    prevCtx.clearRect(0, 0, width, height);
                    prevCtx.drawImage(canvas, 0, 0);
                }
                if (frame.blendOp === 0) {
                    ctx.clearRect(frame.left, frame.top, frame.width, frame.height);
                }
                ctx.drawImage(frame.imageElement, frame.left, frame.top);

                const snapshot = document.createElement('canvas');
                snapshot.width = width; snapshot.height = height;
                snapshot.getContext('2d').drawImage(canvas, 0, 0);
                renderedFrames.push({ img: snapshot, delay: frame.delay });

                if (frame.disposeOp === 1) {
                    ctx.clearRect(frame.left, frame.top, frame.width, frame.height);
                } else if (frame.disposeOp === 2) {
                    ctx.clearRect(0, 0, width, height);
                    ctx.drawImage(prevCanvas, 0, 0);
                }
            }
            return renderedFrames;
        } catch (e) {
            console.error("APNG Parse Error:", e);
            return null;
        }
    }

    /**
     * MuxerとVideoEncoderを初期化する
     */
    static async createEncoder(config, isMobile) {
        const muxer = new Muxer({
            target: new ArrayBufferTarget(),
            video: { codec: 'avc', width: config.width, height: config.height },
            fastStart: 'in-memory'
        });

        const encoder = new VideoEncoder({
            output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
            error: (e) => console.error("VideoEncoder Error:", e)
        });

        encoder.configure({
            codec: config.codec,
            width: config.width,
            height: config.height,
            bitrate: config.bitrate,
            framerate: config.fps,
            latencyMode: isMobile ? 'realtime' : 'quality'
        });

        // 設定完了まで待機
        let wait = 0;
        while (encoder.state !== "configured" && wait < 20) {
            await new Promise(r => setTimeout(r, 100));
            wait++;
        }

        return { muxer, encoder };
    }
}
