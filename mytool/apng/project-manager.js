/**
 * project-manager.js
 * プロジェクト全体の管理・ダッシュボード表示ロジック
 */

const CONFIG = {
  main:  { w: 240, h: 240, maxF: 20, label: "Main" },
  tab:   { w: 96,  h: 74,  maxF: 1,  label: "Tab" },
  stamp: { w: 320, h: 270, maxF: 20, label: "Stamp" }
};

let project = {
  profile: 'stamp',
  stamps: {}
};

let currentId = "01";
let currentType = "stamp";

function applyProfile(mode) {
  project.profile = mode;
  CONFIG.stamp = (mode === 'emoji') 
    ? { w: 180, h: 180, maxF: 20, label: "Emoji" } 
    : { w: 320, h: 270, maxF: 20, label: "Stamp" };

  document.getElementById('setup-screen').style.display = 'none';
  document.getElementById('project-screen').classList.add('active');
  initProject();
}

function initProject() {
  const sg = document.getElementById('special-grid');
  if (sg) {
    sg.innerHTML = '';
    const list = (project.profile === 'emoji') ? ['tab'] : ['main', 'tab'];
    list.forEach(id => {
      if (!project.stamps[id]) project.stamps[id] = createStampData(id);
      renderCard(sg, id, CONFIG[id].label);
    });
  }

  const g = document.getElementById('stamp-grid');
  if (g) {
    g.innerHTML = '';
    const count = (project.profile === 'emoji') ? 40 : 24;
    for (let i = 1; i <= count; i++) {
      const id = String(i).padStart(2, '0');
      if (!project.stamps[id]) project.stamps[id] = createStampData(id);
      renderCard(g, id, `#${id}`);
    }
  }
}

function createStampData(id) {
  const type = (id === 'main' || id === 'tab') ? id : 'stamp';
  const max = CONFIG[type].maxF;
  return {
    delays: new Array(max).fill(100),
    loopCount: 4,
    buffers: new Array(max).fill(null),
    debugBgs: new Array(max).fill('debug-none'),
    enabled: new Array(max).fill(true)
  };
}

function renderCard(container, id, label) {
  const card = document.createElement('div');
  card.className = 'stamp-card';
  card.onclick = () => {
    if (typeof openEditor === 'function') {
      openEditor(id);
    }
  };

  const sData = project.stamps[id];
  const buf = sData ? sData.buffers[0] : null;
  const type = (id === 'main' || id === 'tab') ? id : 'stamp';

  let thumbHtml = '';
  if (buf) {
    const thumbSrc = arrayBufferToDataURL(buf, type);
    thumbHtml = `<img src="${thumbSrc}" alt="${label}" style="width:100%; height:60px; object-fit:contain; background:#fafafa; border-radius:4px;" />`;
  } else {
    thumbHtml = `<div style="height:60px; display:flex; align-items:center; justify-content:center; background:#eee; color:#aaa; font-size:10px; border-radius:4px;">No Frame</div>`;
  }

  card.innerHTML = `<div>${thumbHtml}<div style="margin-top:4px; font-weight:bold; overflow:hidden; text-overflow:ellipsis;">${label}</div></div>`;
  container.appendChild(card);
}

async function buildProjectZip() {
  if (typeof toggleLoading === 'function') toggleLoading(true, "ZIPを生成中...");
  const zip = new JSZip();
  const nameEl = document.getElementById('project-name');
  const pName = (nameEl && nameEl.value) || 'project';
  const meta = {};
  
  for (const id of Object.keys(project.stamps)) {
    const sData = project.stamps[id];
    const active = sData.buffers.filter((b, i) => b !== null && sData.enabled[i]);
    if (active.length > 0) {
      const type = (id === 'main' || id === 'tab') ? id : 'stamp';
      let out;
      if (id === 'tab') {
        out = UPNG.encode([active[0]], CONFIG[type].w, CONFIG[type].h, 0);
      } else {
        const activeDelays = sData.delays.filter((_, i) => sData.buffers[i] !== null && sData.enabled[i]);
        out = encodeApng(active, CONFIG[type].w, CONFIG[type].h, activeDelays, sData.loopCount);
      }
      zip.file(`${id}.png`, out);
    }
    
    meta[id] = {
      delays: sData.delays,
      loopCount: sData.loopCount,
      enabled: sData.enabled,
      debugBgs: sData.debugBgs
    };
  }
  
  zip.file("project_meta.json", JSON.stringify(meta));

  try {
    const content = await zip.generateAsync({ type: "blob" });
    saveBlob(content, `${pName}.zip`);
  } catch(e) {
    alert("ZIPの構築に失敗しました: " + e.message);
  }
  if (typeof toggleLoading === 'function') toggleLoading(false);
}

async function importProjectZip(input) {
  if (!input.files[0]) return;
  if (typeof toggleLoading === 'function') toggleLoading(true, "ZIPを展開中...");
  try {
    const zip = await JSZip.loadAsync(input.files[0]);
    const metaFile = zip.file("project_meta.json");
    let meta = {};
    if (metaFile) {
      meta = JSON.parse(await metaFile.async("text"));
    }
    
    for (const filename of Object.keys(zip.files)) {
      if (filename.endsWith('.png')) {
        const id = filename.replace('.png', '');
        const type = (id === 'main' || id === 'tab') ? id : 'stamp';
        const buffer = await zip.files[filename].async("arraybuffer");
        
        const decoded = await smartDecode(buffer, id, type);
        if (!project.stamps[id]) project.stamps[id] = createStampData(id);
        const sData = project.stamps[id];
        
        sData.buffers.fill(null);
        decoded.frames.forEach((f, i) => {
          if (i < sData.buffers.length) sData.buffers[i] = f;
        });
        
        if (meta[id]) {
          sData.delays = meta[id].delays || new Array(CONFIG[type].maxF).fill(100);
          sData.loopCount = meta[id].loopCount || 4;
          sData.enabled = meta[id].enabled || new Array(CONFIG[type].maxF).fill(true);
          sData.debugBgs = meta[id].debugBgs || new Array(CONFIG[type].maxF).fill('debug-none');
        } else {
          sData.delays = new Array(CONFIG[type].maxF).fill(100);
          if (decoded.delays) {
            decoded.delays.forEach((d, idx) => {
              if (idx < sData.delays.length) sData.delays[idx] = d;
            });
          } else {
            sData.delays.fill(decoded.delay || 100);
          }
          sData.loopCount = decoded.loopCount || 4;
        }
      }
    }
    alert("プロジェクトを正常に復元しました！");
    initProject();
  } catch (e) {
    alert("復元失敗: " + e.message);
  }
  if (typeof toggleLoading === 'function') toggleLoading(false);
  input.value = "";
}

function showDashboard() {
  if (typeof stopPreview === "function") stopPreview();
  document.getElementById('editor-screen').classList.remove('active');
  document.getElementById('project-screen').classList.add('active');
  initProject();
}