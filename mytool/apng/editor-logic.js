/**
 * editor-logic.js
 * エディタコアロジック (個別フレーム遅延・合計時間計算・LINE準拠ループ数・APNG分解読込対応・安全パッチ・個別＆一括APNG出力対応版)
 */

let isPlaying = false;
let playTimer = null;
let currentFrameIdx = 0;
let staticPreviewIdx = null;

// =========================================================================
// CRC32 計算テーブル (LINE等の厳格なチェッカーでエラーにならないためのCRC再計算用)
// =========================================================================
const CRC_TABLE = [];
for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
        c = ((c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1));
    }
    CRC_TABLE[n] = c;
}

function calculateCrc32(uint8Array) {
    let crc = 0 ^ -1;
    for (let i = 0; i < uint8Array.length; i++) {
        crc = (crc >>> 8) ^ CRC_TABLE[(crc ^ uint8Array[i]) & 0xFF];
    }
    return (crc ^ -1) >>> 0;
}

// ==========================================
// 1. 初期化・表示更新
// ==========================================

/**
 * デバイス画面やダッシュボードから呼び出されるエディタ起動のエントリーポイント
 */
function openEditor(id) {
    currentId = id;
    currentType = (id === 'main' || id === 'tab') ? id : 'stamp';

    // 1. 画面表示の切り替え
    const projectScreen = document.getElementById('project-screen');
    const editorScreen = document.getElementById('editor-screen');
    if (projectScreen && editorScreen) {
        projectScreen.classList.remove('active');
        editorScreen.classList.add('active');
    }

    // 2. エディタ用変数の初期化
    isPlaying = false;
    if (playTimer) clearTimeout(playTimer);
    playTimer = null;
    currentFrameIdx = 0;
    staticPreviewIdx = null;

    // 3. データ構造の安全な初期化・補完
    const sData = project.stamps[currentId];
    if (sData) {
        const maxFrames = CONFIG[currentType].maxF;
        
        // 必須プロパティの補完
        if (!sData.delays) {
            sData.delays = new Array(maxFrames).fill(100);
        }
        if (sData.loopCount === undefined) {
            sData.loopCount = 4;
        }
        if (!sData.enabled) {
            sData.enabled = new Array(maxFrames).fill(true);
        }
        if (!sData.debugBgs) {
            sData.debugBgs = new Array(maxFrames).fill('#ffffff');
        }

        // ループUIの同期
        const loopSelect = document.getElementById('loop-count-select');
        if (loopSelect) {
            loopSelect.value = sData.loopCount;
        }
    }

    // 4. 表示コンポーネントの初期描画
    const animControls = document.getElementById('anim-controls');
    if (animControls) {
        animControls.style.display = (currentType === 'tab') ? 'none' : 'block';
    }
    
    const tabControls = document.getElementById('tab-controls');
    if (tabControls) {
        tabControls.style.display = (currentType === 'tab') ? 'block' : 'none';
    }

    renderEditorLists();
    updateStaticPreview(null);
}

/**
 * 互換性のためのエイリアス
 */
function initEditor() {
    openEditor(currentId);
}

function renderEditorLists() {
    const maxF = CONFIG[currentType].maxF;
    const sData = project.stamps[currentId];
    const listEl = document.getElementById('frame-list') || document.getElementById('frames-list');
    if (!listEl) return;

    listEl.innerHTML = '';

    for (let i = 0; i < maxF; i++) {
        const buf = sData ? sData.buffers[i] : null;
        const enabled = sData ? sData.enabled[i] : true;
        const delay = sData && sData.delays ? sData.delays[i] : 100;

        const li = document.createElement('div');
        li.className = `frame-item ${!enabled ? 'disabled' : ''}`;
        li.id = `f-item-${i}`;
        
        // プレビュー用サムネイル (bufはPNGバイナリなのでそのままBlob化してOK)
        let imgHtml = '<div class="no-img" style="font-size:10px; color:#888;">空</div>';
        if (buf) {
            const blob = new Blob([buf], { type: 'image/png' });
            const url = URL.createObjectURL(blob);
            imgHtml = `<img src="${url}" style="width:100%; height:100%; object-fit:contain;" alt="Frame ${i+1}" onload="URL.revokeObjectURL('${url}')">`;
        }

        li.innerHTML = `
            <div class="frame-header" onclick="selectFramePreview(${i})" style="display:flex; align-items:center; gap:8px; width:100%;">
                <span style="font-weight:bold; font-size:14px;">#${String(i + 1).padStart(2, '0')}</span>
                <div style="width:50px; height:42px; background:#eaeaea; border-radius:4px; display:flex; align-items:center; justify-content:center; overflow:hidden;">
                    ${imgHtml}
                </div>
                <div style="margin-left:auto; display:flex; align-items:center; gap:4px;" onclick="event.stopPropagation();">
                    <input type="number" value="${delay}" min="10" step="10" style="width:65px; height:36px; font-size:14px; text-align:center; border-radius:4px; border:1px solid #ccc;" onchange="changeFrameDelay(${i}, this.value)">
                    <span style="font-size:12px;">ms</span>
                </div>
            </div>
            <div class="frame-controls" style="display:flex; align-items:center; justify-content:between; margin-top:8px; gap:8px; width:100%;">
                <div style="display:flex; align-items:center; gap:6px;">
                    <input type="checkbox" ${enabled ? 'checked' : ''} style="width:20px; height:20px;" onchange="toggleFrame(${i}, this.checked)">
                    <span style="font-size:13px;">有効</span>
                </div>
                <div class="action-group" style="margin-left:auto; display:flex; gap:4px;">
                    <button class="action-btn" onclick="moveFrame(${i}, -1)">↑</button>
                    <button class="action-btn" onclick="moveFrame(${i}, 1)">↓</button>
                    <button class="action-btn action-btn-danger" style="background:#dc3545; color:white; border:none;" onclick="deleteFrame(${i})">✕</button>
                </div>
            </div>
        `;
        listEl.appendChild(li);
    }

    updateDurationDisplay();
}

/**
 * 合計再生時間の計算と表示 (1ループ＆ループ数分の両対応＋LINE規格厳密チェック版)
 */
function updateDurationDisplay() {
    const sData = project.stamps[currentId];
    const displayEl = document.getElementById('total-duration-display') || document.getElementById('duration-value');
    if (!sData || !displayEl) return;

    let oneLoopMs = 0;
    sData.buffers.forEach((buf, i) => {
        if (buf !== null && sData.enabled[i]) {
            const roundedDelay = Math.round((sData.delays[i] || 100) / 10) * 10;
            oneLoopMs += roundedDelay;
        }
    });

    const oneLoopSeconds = oneLoopMs / 1000;
    const loopCount = sData.loopCount || 4; 
    
    const totalMs = oneLoopMs * loopCount;
    const totalSeconds = totalMs / 1000;

    let html = `
        <div style="font-size:14px; line-height:1.6; border-bottom:1px solid #eee; padding-bottom:8px; margin-bottom:8px; text-align: left;">
            <div>・1ループの長さ: <strong>${oneLoopSeconds.toFixed(2)} 秒</strong> (${oneLoopMs} ms)</div>
            <div>・再生ループ数: <strong>${loopCount} 回</strong></div>
            <div style="font-size:15px; color:#111; margin-top:4px;">
                ➔ <strong>総再生時間: <span style="font-size:18px; color:#0056b3;">${totalSeconds.toFixed(2)} 秒</span></strong> (${totalMs} ms)
            </div>
        </div>
    `;

    const validDurations = [1000, 2000, 3000, 4000];
    const isExactMatch = validDurations.includes(totalMs);
    const isUnderMaxLimit = totalMs <= 4000;

    const activeFrameCount = sData.buffers.filter((buf, i) => buf !== null && sData.enabled[i]).length;
    const isFrameCountValid = activeFrameCount >= 5 && activeFrameCount <= 20;

    if (isExactMatch && isFrameCountValid) {
        html += `
            <div style="color:#28a745; font-weight:bold; font-size:12px; margin-top:5px; background:#e8f5e9; padding:6px; border-radius:4px; border:1px solid #c8e6c9; text-align: left;">
                ✓ LINEアニメスタンプ規格に完全準拠しています！
                <div style="font-weight:normal; font-size:11px; margin-top:2px;">(フレーム数: ${activeFrameCount}枚 / 総時間: ${totalSeconds.toFixed(1)}秒)</div>
            </div>
        `;
    } else {
        html += `<div style="background:#fff3cd; padding:8px; border-radius:4px; border:1px solid #ffeeba; margin-top:5px; font-size:11px; color:#856404; text-align: left;">`;
        html += `<div style="font-weight:bold; font-size:12px; margin-bottom:4px;">⚠️ LINE規格の審査基準を満たしていません：</div>`;
        
        if (!isUnderMaxLimit) {
            html += `<div style="margin-left:4px;">・ループを含めた<strong>総再生時間が4.0秒を超えています</strong>（現在 ${totalSeconds.toFixed(2)}秒）。</div>`;
        } else if (!isExactMatch) {
            html += `<div style="margin-left:4px;">・総再生時間が <strong>ちょうど1秒、2秒、3秒、4秒</strong> のいずれかになっていません。</div>`;
        }
        
        if (!isFrameCountValid) {
            html += `<div style="margin-left:4px; margin-top:2px;">・フレーム数が <strong>5〜20枚</strong> の範囲にありません（現在 ${activeFrameCount}枚）。</div>`;
        }
        
        html += `</div>`;
    }

    displayEl.innerHTML = html;
}

// ==========================================
// 2. フレーム操作
// ==========================================

function toggleFrame(i, checked) {
    project.stamps[currentId].enabled[i] = checked;
    renderEditorLists();
    updateStaticPreview(null);
}

function changeFrameDelay(i, val) {
    let parsed = parseInt(val, 10);
    if (isNaN(parsed) || parsed < 10) parsed = 10;
    project.stamps[currentId].delays[i] = parsed;
    updateDurationDisplay();
    if (isPlaying) {
        stopPreview();
        playPreview();
    }
}

function handleLoopCountChange(val) {
    const parsed = parseInt(val, 10);
    if (isNaN(parsed)) return;
    const sData = project.stamps[currentId];
    if (sData) {
        sData.loopCount = parsed;
    }
    updateDurationDisplay();
}

function changeLoopCount(val) {
    handleLoopCountChange(val);
}

function moveFrame(i, direction) {
    const sData = project.stamps[currentId];
    const target = i + direction;
    if (target < 0 || target >= sData.buffers.length) return;

    const swap = (arr) => {
        const temp = arr[i];
        arr[i] = arr[target];
        arr[target] = temp;
    };

    swap(sData.buffers);
    swap(sData.debugBgs);
    swap(sData.enabled);
    swap(sData.delays);

    renderEditorLists();
    updateStaticPreview(target);
}

function deleteFrame(i) {
    const sData = project.stamps[currentId];
    sData.buffers[i] = null;
    sData.enabled[i] = true;
    sData.delays[i] = 100;
    sData.debugBgs[i] = 'debug-none';
    renderEditorLists();
    updateStaticPreview(null);
}

function selectFramePreview(i) {
    staticPreviewIdx = i;
    updateStaticPreview(i);
}

function smartFill() {
    const sData = project.stamps[currentId];
    const validBuffers = sData.buffers.filter(b => b !== null);
    const validDelays = sData.delays.filter((_, idx) => sData.buffers[idx] !== null);
    if (validBuffers.length === 0) return;

    for (let i = 0; i < sData.buffers.length; i++) {
        if (!sData.buffers[i]) {
            sData.buffers[i] = validBuffers[i % validBuffers.length];
            sData.delays[i] = validDelays[i % validDelays.length] || 100;
        }
    }
    renderEditorLists();
    updateStaticPreview(0);
}

// ==========================================
// 3. プレビュー描画ロジック
// ==========================================

function updateStaticPreview(frameIndex) {
    const canvas = document.getElementById('main-canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const width = CONFIG[currentType].w;
    const height = CONFIG[currentType].h;

    canvas.width = width;
    canvas.height = height;

    const sData = project.stamps[currentId];
    if (!sData) return;

    let targetIdx = frameIndex;
    if (targetIdx === null) {
        targetIdx = sData.buffers.findIndex((b, i) => b !== null && sData.enabled[i]);
    }

    if (targetIdx === -1 || targetIdx === null || !sData.buffers[targetIdx]) {
        ctx.clearRect(0, 0, width, height);
        return;
    }

    const previewArea = document.getElementById('preview-area');
    const dbgClass = sData.debugBgs[targetIdx] || 'debug-none';
    if (previewArea) {
        previewArea.className = 'transparent-bg ' + dbgClass;
    }

    ctx.clearRect(0, 0, width, height);
    
    // buffersにはPNGバイナリが入っているので、一度Imageにロードしてから描画する
    const blob = new Blob([sData.buffers[targetIdx]], { type: 'image/png' });
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
        ctx.drawImage(img, 0, 0, width, height);
        URL.revokeObjectURL(url);
    };
    img.src = url;

    const infoBar = document.getElementById('frame-info-bar');
    if (infoBar && currentType !== 'tab') {
        infoBar.innerText = `FRAME: ${targetIdx + 1} / 時間: ${sData.delays[targetIdx]}ms`;
    }

    document.querySelectorAll('.frame-item').forEach(el => el.classList.remove('selected'));
    const activeItem = document.getElementById(`f-item-${targetIdx}`);
    if (activeItem) {
        activeItem.classList.add('selected');
    }
}

// ==========================================
// 4. アニメーション再生・停止
// ==========================================

function playPreview() {
    if (isPlaying) return;
    const sData = project.stamps[currentId];
    if (!sData) return;

    const activeIndices = [];
    for (let i = 0; i < sData.buffers.length; i++) {
        if (sData.buffers[i] !== null && sData.enabled[i]) {
            activeIndices.push(i);
        }
    }

    if (activeIndices.length === 0) return;

    isPlaying = true;
    let pointer = 0;

    const runTimer = () => {
        if (!isPlaying) return;
        const idx = activeIndices[pointer];
        updateStaticPreview(idx);
        const delay = sData.delays[idx] || 100;
        pointer = (pointer + 1) % activeIndices.length;
        playTimer = setTimeout(runTimer, delay);
    };

    runTimer();
}

function stopPreview() {
    isPlaying = false;
    if (playTimer) {
        clearTimeout(playTimer);
        playTimer = null;
    }
    updateStaticPreview(staticPreviewIdx);
}

function togglePreview() {
    if (isPlaying) {
        stopPreview();
    } else {
        playPreview();
    }
}

// ==========================================
// 5. 画像デコード & インポート・一括処理系
// ==========================================

function isBufferEqual(buf1, buf2) {
    if (!buf1 || !buf2) return false;
    if (buf1.byteLength !== buf2.byteLength) return false;
    const view1 = new Uint8Array(buf1);
    const view2 = new Uint8Array(buf2);
    for (let i = 0; i < view1.length; i++) {
        if (view1[i] !== view2[i]) return false;
    }
    return true;
}

/**
 * 読み込んだ画像を目標サイズにリサイズした「PNGバイナリ (ArrayBuffer)」を返す
 */
async function processImage(blobOrFile, type) {
    return new Promise(resolve => {
        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
                const cvs = document.createElement('canvas');
                cvs.width = CONFIG[type].w;
                cvs.height = CONFIG[type].h;
                const ctx = cvs.getContext('2d');
                const s = Math.min(cvs.width / img.width, cvs.height / img.height);
                ctx.drawImage(img, (cvs.width - img.width * s) / 2, (cvs.height - img.height * s) / 2, img.width * s, img.height * s);
                
                // キャンバスから直接PNGバイナリを取得
                cvs.toBlob((blob) => {
                    const r = new FileReader();
                    r.onload = () => resolve(r.result);
                    r.readAsArrayBuffer(blob);
                }, 'image/png');
            };
            img.src = e.target.result;
        };
        if (blobOrFile instanceof Blob) {
            reader.readAsDataURL(blobOrFile);
        }
    });
}

/**
 * 生のRGBA配列を、指定幅にリサイズした「PNGバイナリ (ArrayBuffer)」にする
 */
async function resizeRgbaToPngBuffer(rgba, sw, sh, dw, dh) {
    return new Promise(resolve => {
        const c1 = document.createElement('canvas');
        c1.width = sw;
        c1.height = sh;
        c1.getContext('2d').putImageData(new ImageData(rgba, sw, sh), 0, 0);
        
        const c2 = document.createElement('canvas');
        c2.width = dw;
        c2.height = dh;
        const ctx = c2.getContext('2d');
        const s = Math.min(dw / sw, dh / sh);
        
        ctx.drawImage(c1, (dw - sw * s) / 2, (dh - sw * s) / 2, sw * s, sh * s);
        c2.toBlob((blob) => {
            const r = new FileReader();
            r.onload = () => resolve(r.result);
            r.readAsArrayBuffer(blob);
        }, 'image/png');
    });
}

/**
 * APNGファイルの安全な高度デコード (正常なPNGバッファを返す)
 */
async function smartDecode(buffer, id, type) {
    if (id === 'tab') {
        return { 
            frames: [await processImage(new Blob([buffer]), type)], 
            delays: [100],
            loopCount: 1
        };
    }
    
    try {
        const img = UPNG.decode(buffer);
        const rgbaFrames = UPNG.toRGBA8(img);
        const tempFrames = [];
        
        for (let i = 0; i < rgbaFrames.length; i++) {
            const resizedPngBuf = await resizeRgbaToPngBuffer(
                new Uint8ClampedArray(rgbaFrames[i]), 
                img.width, 
                img.height, 
                CONFIG[type].w, 
                CONFIG[type].h
            );
            const originalDelay = (img.frames && img.frames[i]) ? (img.frames[i].delay || 100) : 100;
            tempFrames.push({ buffer: resizedPngBuf, delay: originalDelay });
        }
        
        const compressed = [];
        if (tempFrames.length > 0) {
            compressed.push({
                buffer: tempFrames[0].buffer,
                delay: tempFrames[0].delay
            });

            for (let i = 1; i < tempFrames.length; i++) {
                const lastCompressed = compressed[compressed.length - 1];
                const currentFrame = tempFrames[i];

                if (isBufferEqual(lastCompressed.buffer, currentFrame.buffer)) {
                    lastCompressed.delay += currentFrame.delay;
                } else {
                    compressed.push({
                        buffer: currentFrame.buffer,
                        delay: currentFrame.delay
                    });
                }
            }
        }
        
        let loopCount = 4;
        const view = new DataView(buffer);
        let offset = 8;
        
        while (offset + 8 <= buffer.byteLength) {
            const length = view.getUint32(offset);
            const chunkType = view.getUint32(offset + 4);
            
            if (chunkType === 0x6163544C) { 
                if (offset + 16 <= buffer.byteLength) {
                    loopCount = view.getUint32(offset + 12);
                }
                break;
            }
            
            const nextOffset = offset + 12 + length;
            if (nextOffset <= offset) { 
                break;
            }
            offset = nextOffset;
        }
        
        return {
            frames: compressed.map(f => f.buffer),
            delays: compressed.map(f => f.delay),
            loopCount: loopCount === 0 ? 4 : loopCount
        };
    } catch (e) {
        console.error("APNGデコードに失敗したため、静止画としてフォールバックします:", e);
        return { 
            frames: [await processImage(new Blob([buffer]), type)], 
            delays: [100],
            loopCount: 4
        };
    }
}

/**
 * APNGファイルのインポート
 */
async function handleApngImport(input) {
    const file = input.files[0];
    if (!file) return;
    
    if (typeof toggleLoading === 'function') toggleLoading(true, "APNGデコード中...");
    
    const reader = new FileReader();
    reader.onload = async (e) => {
        try {
            const res = await smartDecode(e.target.result, currentId, currentType);
            const sData = project.stamps[currentId];
            
            sData.buffers.fill(null);
            sData.enabled.fill(true);
            sData.delays.fill(100);
            sData.loopCount = res.loopCount;

            res.frames.forEach((f, i) => {
                if (i < sData.buffers.length) {
                    sData.buffers[i] = f;
                    sData.delays[i] = res.delays ? res.delays[i] : 100;
                }
            });
            
            const loopSelect = document.getElementById('loop-count-select');
            if (loopSelect) {
                loopSelect.value = sData.loopCount;
            }

            renderEditorLists();
            updateStaticPreview(0);
        } catch (err) {
            alert("APNG解析に失敗しました: " + err.message);
        }
        if (typeof toggleLoading === 'function') toggleLoading(false);
    };
    reader.readAsArrayBuffer(file);
    input.value = "";
}

/**
 * 1コマごとの手動アップロード
 */
async function loadSingle(i, input) {
    if (!input.files[0]) return;
    project.stamps[currentId].buffers[i] = await processImage(input.files[0], currentType);
    renderEditorLists();
    updateStaticPreview(i);
}

/**
 * 連番ファイルの一括アップロード
 */
async function handleBulkUpload(input) {
    if (typeof toggleLoading === 'function') toggleLoading(true, "一括処理中...");
    const files = Array.from(input.files).sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
    for (let i = 0; i < project.stamps[currentId].buffers.length && i < files.length; i++) {
        project.stamps[currentId].buffers[i] = await processImage(files[i], currentType);
    }
    renderEditorLists();
    updateStaticPreview(0);
    if (typeof toggleLoading === 'function') toggleLoading(false);
    input.value = "";
}

// ==========================================
// 6. APNGエクスポート
// ==========================================

function patchApngLoopCount(arrayBuffer, loopCount) {
    const view = new DataView(arrayBuffer);
    const uint8 = new Uint8Array(arrayBuffer);
    
    for (let i = 0; i < uint8.length - 8; i++) {
        if (uint8[i] === 0x61 && uint8[i+1] === 0x63 && uint8[i+2] === 0x54 && uint8[i+3] === 0x4C) {
            view.setUint32(i + 8, loopCount, false);
            const crcTargetData = uint8.subarray(i, i + 12);
            const newCrc = calculateCrc32(crcTargetData);
            view.setUint32(i + 12, newCrc, false);
            break;
        }
    }
    return arrayBuffer;
}

/**
 * PNGバイナリ(ArrayBuffer)の配列を受け取り、APNG(ArrayBuffer)を生成する
 */
async function encodeApngFromPngBuffers(pngBuffers, w, h, delays, loops) {
    // 1. 各PNGをUPNG.encode用にRGBAピクセルバッファに一度展開する
    const rgbaBuffers = await Promise.all(pngBuffers.map(buf => {
        return new Promise(resolve => {
            const blob = new Blob([buf], { type: 'image/png' });
            const url = URL.createObjectURL(blob);
            const img = new Image();
            img.onload = () => {
                const cvs = document.createElement('canvas');
                cvs.width = w;
                cvs.height = h;
                const ctx = cvs.getContext('2d');
                ctx.drawImage(img, 0, 0);
                resolve(ctx.getImageData(0, 0, w, h).data.buffer);
                URL.revokeObjectURL(url);
            };
            img.src = url;
        });
    }));

    // 2. ディレイ値の辻褄合わせ
    const sanitizedDelays = delays.map(d => Math.round(d / 10) * 10);
    const rawTotal = sanitizedDelays.reduce((a, b) => a + b, 0);
    const targets = [1000, 2000, 3000, 4000];
    const nearestTarget = targets.reduce((prev, curr) => 
        Math.abs(curr - rawTotal) < Math.abs(prev - rawTotal) ? curr : prev
    );

    if (rawTotal !== nearestTarget && sanitizedDelays.length > 0) {
        const diff = nearestTarget - rawTotal;
        const lastIdx = sanitizedDelays.length - 1;
        sanitizedDelays[lastIdx] = Math.max(10, sanitizedDelays[lastIdx] + diff);
    }

    // 3. UPNGでエンコード
    let apng = UPNG.encode(rgbaBuffers, w, h, 0, sanitizedDelays);

    // 4. ループ数の指定書き換え
    apng = patchApngLoopCount(apng, loops);
    return apng;
}

/**
 * 単一APNGの出力
 */
async function exportSingleAPNG() {
    const sData = project.stamps[currentId];
    if (!sData) {
        alert("有効なスタンプデータがありません。");
        return;
    }

    const activeIndices = sData.buffers
        .map((b, i) => (b !== null && sData.enabled[i]) ? i : null)
        .filter(v => v !== null);

    if (activeIndices.length === 0) {
        alert("書き出すフレームがありません。");
        return;
    }

    if (typeof toggleLoading === 'function') toggleLoading(true, "APNG出力中...");

    const type = currentType;
    const width = CONFIG[type].w;
    const height = CONFIG[type].h;

    // 内部に保存されているPNGバイナリを取り出す
    const pngBuffers = activeIndices.map(idx => sData.buffers[idx]);

    try {
        let out;
        if (currentId === 'tab') {
            out = pngBuffers[0]; // タブ用の静止画は最初の1コマのPNGバイナリそのもの
        } else {
            const activeDelays = activeIndices.map(idx => sData.delays[idx] || 100);
            out = await encodeApngFromPngBuffers(pngBuffers, width, height, activeDelays, sData.loopCount);
        }
        
        const blob = new Blob([out], { type: 'image/png' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        
        const fileNum = (currentId === 'main' || currentId === 'tab') ? currentId : String(currentId).padStart(3, '0'); 
        a.download = `${fileNum}_${sData.loopCount || 4}.png`;
        
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    } catch (e) {
        console.error(e);
        alert("出力処理中にエラーが発生しました。");
    } finally {
        if (typeof toggleLoading === 'function') toggleLoading(false);
    }
}

/**
 * 一括APNGの出力
 */
async function exportAllAPNGs() {
    if (typeof toggleLoading === 'function') toggleLoading(true, "全APNGの一括生成中...");

    try {
        const stampIds = Object.keys(project.stamps);
        let exportCount = 0;

        for (const id of stampIds) {
            const sData = project.stamps[id];
            if (!sData) continue;

            const activeIndices = sData.buffers
                .map((b, i) => (b !== null && sData.enabled[i]) ? i : null)
                .filter(v => v !== null);

            if (activeIndices.length === 0) continue;

            const isTab = (id === 'tab');
            const width = isTab ? CONFIG['tab'].w : CONFIG['stamp'].w;
            const height = isTab ? CONFIG['tab'].h : CONFIG['stamp'].h;
            const pngBuffers = activeIndices.map(idx => sData.buffers[idx]);

            let out;
            if (isTab) {
                out = pngBuffers[0];
            } else {
                const activeDelays = activeIndices.map(idx => sData.delays[idx] || 100);
                out = await encodeApngFromPngBuffers(pngBuffers, width, height, activeDelays, sData.loopCount);
            }

            const blob = new Blob([out], { type: 'image/png' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            
            if (isTab) {
                a.download = 'tab.png';
            } else {
                const fileNum = (id === 'main') ? id : String(id).padStart(3, '0');
                a.download = `${fileNum}_${sData.loopCount || 4}.png`;
            }

            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);

            exportCount++;
            await new Promise(resolve => setTimeout(resolve, 300));
        }

        if (exportCount === 0) {
            alert("出力可能な有効なスタンプデータが1つもありません。");
        }
    } catch (error) {
        console.error(error);
        alert("一括出力処理中にエラーが発生しました。");
    } finally {
        if (typeof toggleLoading === 'function') toggleLoading(false);
    }
}

// ==========================================
// 7. ダッシュボードへの帰還
// ==========================================

function backToProject() {
    stopPreview();
    document.getElementById('editor-screen').classList.remove('active');
    document.getElementById('project-screen').classList.add('active');
}