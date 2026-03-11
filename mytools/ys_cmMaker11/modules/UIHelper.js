<!DOCTYPE html>
<html lang="ja">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>TileCraft - High-Spec MP4</title>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js"></script>
    <style>
        body { font-family: -apple-system, sans-serif; background: #f0f2f5; padding: 15px; margin: 0; }
        .card { background: white; border-radius: 12px; padding: 15px; box-shadow: 0 2px 8px rgba(0,0,0,0.1); margin-bottom: 15px; }
        .settings { display: flex; align-items: center; gap: 10px; margin: 10px 0; padding: 10px; background: #f8f9fa; border-radius: 8px; font-size: 14px; }
        .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(80px, 1fr)); gap: 10px; margin: 15px 0; max-height: 300px; overflow-y: auto; border: 1px solid #eee; padding: 10px; border-radius: 8px; }
        .item { cursor: pointer; text-align: center; font-size: 10px; }
        .item img { width: 100%; aspect-ratio: 1/1; object-fit: contain; border-radius: 6px; background: #eee; border: 2px solid transparent; }
        .item.selected img { border-color: #007aff; background: #eef6ff; }
        .btn { display: block; width: 100%; padding: 16px; background: #007aff; color: white; border: none; border-radius: 12px; font-weight: bold; font-size: 16px; }
        .btn:disabled { background: #cbd5e0; }
        #result-container { margin-top: 20px; display: flex; flex-direction: column; gap: 10px; }
        .result-item { background: white; border-radius: 12px; padding: 12px; display: flex; align-items: center; gap: 15px; box-shadow: 0 2px 5px rgba(0,0,0,0.05); }
        video { width: 80px; height: 80px; border-radius: 6px; }
        .dl-btn { background: #34c759; color: white; text-decoration: none; padding: 8px 15px; border-radius: 8px; font-size: 14px; font-weight: bold; }
    </style>
</head>
<body>

<div class="card">
    <h3 style="margin:0 0 10px 0">1. ZIPをアップロード</h3>
    <input type="file" id="zipInput" accept=".zip">
</div>

<div id="selector-card" class="card" style="display:none">
    <h3 style="margin:0">2. 動画設定と画像選択</h3>
    <div class="settings">
        背景色: <input type="color" id="bgColor" value="#00FF00">
    </div>
    <div class="grid" id="imageGrid"></div>
    <button id="generateBtn" class="btn" disabled>MP4を生成開始</button>
</div>

<div id="result-container"></div>

<script type="module">
// ライブラリのインポート
import parseAPNG from 'https://cdn.skypack.dev/apng-js';
import { Muxer, ArrayBufferTarget } from 'https://unpkg.com/mp4-muxer@latest/build/mp4-muxer.mjs';

let allImageData = []; 
let selectedIndices = new Set();

// ZIP読み込み処理
document.getElementById('zipInput').onchange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const zip = await JSZip.loadAsync(file);
    const files = Object.keys(zip.files)
        .filter(name => name.match(/\.(png|apng)$/i))
        .sort((a, b) => a.localeCompare(b, undefined, {numeric: true}));

    const grid = document.getElementById('imageGrid');
    grid.innerHTML = '';
    allImageData = [];
    selectedIndices.clear();

    for (let i = 0; i < files.length; i++) {
        const buffer = await zip.files[files[i]].async("arraybuffer");
        const blob = new Blob([buffer], { type: "image/png" });
        const url = URL.createObjectURL(blob);
        
        allImageData.push({ name: files[i], buffer, url });

        const div = document.createElement('div');
        div.className = 'item';
        div.innerHTML = `<img src="${url}"><div>${files[i]}</div>`;
        div.onclick = () => {
            if (selectedIndices.has(i)) {
                selectedIndices.delete(i);
                div.classList.remove('selected');
            } else {
                selectedIndices.add(i);
                div.classList.add('selected');
            }
            document.getElementById('generateBtn').disabled = selectedIndices.size === 0;
            document.getElementById('generateBtn').innerText = `${selectedIndices.size}個のMP4を生成`;
        };
        grid.appendChild(div);
    }
    document.getElementById('selector-card').style.display = 'block';
};

// 動画生成メインロジック
async function generateMp4(idx) {
    const item = allImageData[idx];
    const bgColor = document.getElementById('bgColor').value;
    
    // 1. APNG解析 (dispose/blend処理対応)
    const apng = parseAPNG(item.buffer);
    if (apng instanceof Error) return;
    await apng.createImages();

    // 2. 余白計算
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = apng.width; tempCanvas.height = apng.height;
    const tempCtx = tempCanvas.getContext('2d', {willReadFrequently: true});
    let minX = apng.width, minY = apng.height, maxX = 0, maxY = 0;

    for (const frame of apng.frames) {
        tempCtx.drawImage(frame.imageElement, frame.left, frame.top);
        const data = tempCtx.getImageData(0,0,apng.width,apng.height).data;
        for(let i=3; i<data.length; i+=4) {
            if(data[i] > 0) {
                const x = (i/4)%apng.width; const y = Math.floor((i/4)/apng.width);
                minX = Math.min(minX, x); maxX = Math.max(maxX, x);
                minY = Math.min(minY, y); maxY = Math.max(maxY, y);
            }
        }
    }
    const width = (maxX - minX + 1); const height = (maxY - minY + 1);

    // 3. エンコーダーとMuxerの準備
    const muxer = new Muxer({
        target: new ArrayBufferTarget(),
        video: { codec: 'avc', width, height },
        fastStart: 'in-memory'
    });

    const encoder = new VideoEncoder({
        output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
        error: (e) => console.error(e)
    });

    encoder.configure({
        codec: 'avc1.42E01E', // iPhone互換性の高いH.264 Baseline
        width, height,
        bitrate: 2_000_000,
        framerate: 10
    });

    // 4. フレームの描画と投入
    const canvas = document.createElement('canvas');
    canvas.width = width; canvas.height = height;
    const ctx = canvas.getContext('2d');
    
    let timestamp = 0;
    for (const frame of apng.frames) {
        ctx.fillStyle = bgColor;
        ctx.fillRect(0, 0, width, height);
        ctx.drawImage(frame.imageElement, frame.left - minX, frame.top - minY);

        const videoFrame = new VideoFrame(canvas, { timestamp });
        encoder.encode(videoFrame);
        videoFrame.close();
        timestamp += (frame.delay / 1000) * 1_000_000; // マイクロ秒単位
    }

    await encoder.flush();
    muxer.finalize();
    const { buffer } = muxer.target;
    return new Blob([buffer], { type: 'video/mp4' });
}

document.getElementById('generateBtn').onclick = async () => {
    const btn = document.getElementById('generateBtn');
    const container = document.getElementById('result-container');
    btn.disabled = true;

    const indices = Array.from(selectedIndices);
    for (let i = 0; i < indices.length; i++) {
        btn.innerText = `生成中 (${i+1}/${indices.length})...`;
        const blob = await generateMp4(indices[i]);
        if (!blob) continue;

        const url = URL.createObjectURL(blob);
        const div = document.createElement('div');
        div.className = 'result-item';
        div.innerHTML = `
            <video src="${url}" autoplay loop muted playsinline></video>
            <div style="flex:1; font-size:12px;"><strong>${allImageData[indices[i]].name}</strong></div>
            <a href="${url}" download="${allImageData[indices[i]].name}.mp4" class="dl-btn">保存</a>
        `;
        container.appendChild(div);
    }
    btn.innerText = "完了！";
    btn.disabled = false;
};
</script>
</body>
</html>
