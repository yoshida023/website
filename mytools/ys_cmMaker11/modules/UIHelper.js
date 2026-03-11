<!DOCTYPE html>
<html lang="ja">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>preBuild for hp2025 - DebugMode</title>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js"></script>
    <style>
        body { font-family: monospace; padding: 20px; background: #222; color: #0f0; }
        #log { white-space: pre-wrap; font-size: 12px; border: 1px solid #444; padding: 10px; height: 300px; overflow-y: scroll; }
        .btn { width: 100%; padding: 20px; background: #007aff; color: white; border: none; }
    </style>
</head>
<body>
    <h3>Debug Console</h3>
    <div id="log"></div>
    <input type="file" id="zipInput" accept=".zip">
    <button id="generateBtn" class="btn">デバッグ生成開始</button>

<script type="module">
import parseAPNG from 'https://cdn.skypack.dev/apng-js';
import { Muxer, ArrayBufferTarget } from 'https://unpkg.com/mp4-muxer@latest/build/mp4-muxer.mjs';

const logEl = document.getElementById('log');
function log(msg) { logEl.innerText += msg + "\n"; console.log(msg); }

async function testEncode() {
    try {
        log("1. エンコーダー確認...");
        if (!window.VideoEncoder) throw new Error("VideoEncoder未対応");
        
        const config = { codec: 'avc1.42E01E', width: 100, height: 100, bitrate: 1e6, framerate: 10 };
        const muxer = new Muxer({ target: new ArrayBufferTarget(), video: { codec: 'avc', width: 100, height: 100 } });
        
        log("2. 初期化...");
        const encoder = new VideoEncoder({
            output: (c, m) => log("Chunk received"),
            error: (e) => log("Encoder Error: " + e.message)
        });
        
        encoder.configure(config);
        log("3. 設定完了. 待機中...");
        
        // 以下の「flush」が呼ばれない場合、iPhoneはエンコーダーを起動しません
        await encoder.flush();
        log("4. 成功！Flush完了");
    } catch(e) {
        log("失敗: " + e.message);
    }
}

document.getElementById('generateBtn').onclick = testEncode;
</script>
</body>
</html>
