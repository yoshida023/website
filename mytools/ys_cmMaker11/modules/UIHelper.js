<!DOCTYPE html>
<html lang="ja">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>preBuild for hp2025</title>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js"></script>
    <style>
        body { font-family: sans-serif; padding: 20px; background: #f4f4f9; }
        .card { background: white; border-radius: 10px; padding: 20px; box-shadow: 0 2px 5px rgba(0,0,0,0.1); margin-bottom: 20px; }
        .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(80px, 1fr)); gap: 10px; margin-top: 10px; }
        .item img { width: 100%; aspect-ratio: 1; border: 2px solid transparent; cursor: pointer; border-radius: 5px; }
        .item.selected img { border-color: #007aff; }
        .btn { width: 100%; padding: 15px; background: #007aff; color: white; border: none; border-radius: 8px; font-weight: bold; }
    </style>
</head>
<body>

<div class="card">
    <h3>1. ZIPを選択</h3>
    <input type="file" id="zipInput" accept=".zip">
</div>

<div id="ui" class="card" style="display:none">
    <h3>2. 画像を選択</h3>
    <div style="margin: 10px 0;">背景色: <input type="color" id="bgColor" value="#00FF00"></div>
    <div class="grid" id="imageGrid"></div>
    <button id="generateBtn" class="btn" style="margin-top:20px;">MP4を生成</button>
</div>

<div id="results"></div>

<script type="module">
import parseAPNG from 'https://cdn.skypack.dev/apng-js';
import { Muxer, ArrayBufferTarget } from 'https://unpkg.com/mp4-muxer@latest/build/mp4-muxer.mjs';

let allFiles = [];
let selected = new Set();

document.getElementById('zipInput').onchange = async (e) => {
    const zip = await JSZip.loadAsync(e.target.files[0]);
    const files = Object.keys(zip.files).filter(n => n.match(/\.(png|apng)$/i)).sort();
    
    const grid = document.getElementById('imageGrid');
    for (let i = 0; i < files.length; i++) {
        const buffer = await zip.files[files[i]].async("arraybuffer");
        allFiles.push({ name: files[i], buffer });
        
        const div = document.createElement('div');
        div.className = 'item';
        div.innerHTML = `<img src="${URL.createObjectURL(new Blob([buffer]))}">`;
        div.onclick = () => {
            selected.has(i) ? selected.delete(i) : selected.add(i);
            div.classList.toggle('selected');
        };
        grid.appendChild(div);
    }
    document.getElementById('ui').style.display = 'block';
};

async function encode(idx) {
    const { name, buffer } = allFiles[idx];
    const apng = parseAPNG(buffer);
    await apng.createImages();
    
    const w = apng.width, h = apng.height;
    const muxer = new Muxer({ target: new ArrayBufferTarget(), video: { codec: 'avc', width: w, height: h } });
    const encoder = new VideoEncoder({
        output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
        error: console.error
    });
    encoder.configure({ codec: 'avc1.42E01E', width: w, height: h, bitrate: 1e6, framerate: 10 });

    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext('2d');
    
    let time = 0;
    for (const frame of apng.frames) {
        ctx.fillStyle = document.getElementById('bgColor').value;
        ctx.fillRect(0, 0, w, h);
        ctx.drawImage(frame.imageElement, frame.left, frame.top);
        const vf = new VideoFrame(canvas, { timestamp: time });
        encoder.encode(vf);
        vf.close();
        time += (frame.delay || 100) * 1000;
    }
    await encoder.flush();
    muxer.finalize();
    return new Blob([muxer.target.buffer], { type: 'video/mp4' });
}

document.getElementById('generateBtn').onclick = async () => {
    for (const idx of selected) {
        const blob = await encode(idx);
        const url = URL.createObjectURL(blob);
        const res = document.getElementById('results');
        res.innerHTML += `<div>${allFiles[idx].name} <a href="${url}" download="${allFiles[idx].name}.mp4">保存</a></div>`;
    }
};
</script>
</body>
</html>
