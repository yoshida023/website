/**
 * editor-logic.js
 */
let isPlaying = false;
let playTimer = null;
let currentFrame = 0;
const offCanvas = document.createElement('canvas');
const offCtx = offCanvas.getContext('2d');

async function loadApngToLane(laneIdx, input) {
    const file = input.files[0];
    if (!file) return;
    try {
        const buffer = await file.arrayBuffer();
        const img = UPNG.decode(buffer);
        const rgbaFrames = UPNG.toRGBA8(img);
        const conf = CONFIG_MODES[project.profile];

        for (let i = 0; i < 20; i++) {
            const f = i % rgbaFrames.length;
            project.lanes[laneIdx].buffers[i] = await resizeBuffer(new Uint8ClampedArray(rgbaFrames[f]), img.width, img.height, conf.w, conf.h);
        }
        renderFrameList();
        updatePreview(0);
    } catch (e) { alert("失敗: " + e.message); }
    input.value = "";
}

function renderFrameList() {
    const container = document.getElementById('frame-list-container');
    container.innerHTML = '';
    const conf = CONFIG_MODES[project.profile];

    for (let i = 0; i < 20; i++) {
        const card = document.createElement('div');
        card.className = 'frame-card';
        let html = `<div style="font-size:11px; margin-bottom:5px; font-weight:bold;">FRAME #${i+1}</div><div class="lane-grid">`;
        
        [0, 1, 2].forEach(laneId => {
            const buf = project.lanes[laneId].buffers[i];
            const src = buf ? bufferToDataURL(buf, conf.w, conf.h) : '';
            html += `
                <div class="thumb-unit">
                    <div class="thumb-container transparent-bg">${src ? `<img src="${src}" class="thumb-img">` : ''}</div>
                    <div class="btn-group">
                        <button class="btn-move" onclick="moveFrameInLane(${laneId}, ${i}, -1)">▲</button>
                        <button class="btn-move" onclick="moveFrameInLane(${laneId}, ${i}, 1)">▼</button>
                    </div>
                </div>`;
        });

        html += `<div class="thumb-unit"><div class="result-preview transparent-bg"><img src="${getCompositeDataURL(i)}" class="thumb-img"></div></div></div>`;
        card.innerHTML = html;
        container.appendChild(card);
    }
}

function getCompositeDataURL(idx) {
    const conf = CONFIG_MODES[project.profile];
    offCanvas.width = conf.w; offCanvas.height = conf.h;
    offCtx.clearRect(0, 0, conf.w, conf.h);
    project.renderOrders[idx].forEach(laneId => {
        const buf = project.lanes[laneId].buffers[idx];
        if (buf) {
            const tmp = document.createElement('canvas'); tmp.width = conf.w; tmp.height = conf.h;
            tmp.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(buf), conf.w, conf.h), 0, 0);
            offCtx.drawImage(tmp, 0, 0);
        }
    });
    return offCanvas.toDataURL();
}

function updatePreview(idx) {
    const ctx = document.getElementById('main-canvas').getContext('2d');
    const img = new Image();
    img.onload = () => {
        ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
        ctx.drawImage(img, 0, 0);
        document.getElementById('frame-counter').innerText = `FRAME: ${idx + 1} / 20`;
    };
    img.src = getCompositeDataURL(idx);
}

function togglePlayback() {
    isPlaying = !isPlaying;
    if (isPlaying) {
        playTimer = setInterval(() => { currentFrame = (currentFrame + 1) % 20; updatePreview(currentFrame); }, project.delay);
    } else { clearInterval(playTimer); }
}

async function exportFinalAPNG() {
    const conf = CONFIG_MODES[project.profile];
    const frames = [];
    for (let i = 0; i < 20; i++) {
        const c = document.createElement('canvas'); c.width = conf.w; c.height = conf.h;
        const img = new Image();
        await new Promise(r => { img.onload = () => { c.getContext('2d').drawImage(img, 0, 0); r(); }; img.src = getCompositeDataURL(i); });
        frames.push(c.getContext('2d').getImageData(0,0,conf.w,conf.h).data.buffer);
    }
    const apng = UPNG.encode(frames, conf.w, conf.h, 256, new Array(20).fill(project.delay));
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([apng])); a.download = "composite.png"; a.click();
}

async function resizeBuffer(rgba, sw, sh, dw, dh) {
    const c1 = document.createElement('canvas'); c1.width = sw; c1.height = sh;
    c1.getContext('2d').putImageData(new ImageData(rgba, sw, sh), 0, 0);
    const c2 = document.createElement('canvas'); c2.width = dw; c2.height = dh;
    c2.getContext('2d').drawImage(c1, 0, 0, sw, sh, 0, 0, dw, dh);
    return c2.getContext('2d').getImageData(0, 0, dw, dh).data.buffer;
}

function bufferToDataURL(buf, w, h) {
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    c.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(buf), w, h), 0, 0);
    return c.toDataURL();
}