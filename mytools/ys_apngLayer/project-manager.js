/**
 * project-manager.js
 */
const CONFIG_MODES = {
    stamp: { w: 320, h: 270, label: "スタンプ" },
    emoji: { w: 180, h: 180, label: "絵文字" }
};

let project = {
    profile: 'stamp',
    lanes: [
        { id: 0, buffers: new Array(20).fill(null) },
        { id: 1, buffers: new Array(20).fill(null) },
        { id: 2, buffers: new Array(20).fill(null) }
    ],
    renderOrders: Array.from({ length: 20 }, () => [0, 1, 2]),
    delay: 100
};

function initApp(mode) {
    project.profile = mode;
    document.getElementById('setup-screen').style.display = 'none';
    const conf = CONFIG_MODES[mode];
    const canvas = document.getElementById('main-canvas');
    canvas.width = conf.w; canvas.height = conf.h;
    renderFrameList();
    updatePreview(0);
}

// 同じレーン内で、前後のフレームと入れ替える
function moveFrameInLane(laneId, frameIdx, direction) {
    const targetIdx = frameIdx + direction;
    if (targetIdx < 0 || targetIdx >= 20) return;

    const lane = project.lanes[laneId];
    const temp = lane.buffers[frameIdx];
    lane.buffers[frameIdx] = lane.buffers[targetIdx];
    lane.buffers[targetIdx] = temp;

    renderFrameList();
    updatePreview(frameIdx);
}

function setSpeed(ms) {
    project.delay = ms;
    if (isPlaying) { togglePlayback(); togglePlayback(); }
}