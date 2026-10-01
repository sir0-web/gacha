(() => {
'use strict';

const $ = s => document.querySelector(s);
const KEY = 'gacha.v1';
const MAX_BODIES = 60;
const HUES = [350, 28, 48, 140, 190, 215, 265, 320, 10, 75, 165, 200, 240, 285, 335, 95];
// lv は既定値の版。同梱の machine.png に合わせた値なので、変えたら lv を上げて保存済みの値を捨てる
const DEF_LAYOUT = { lv: 2, dx: 50, dy: 33.9, ds: 74.5, ce: 72, fl: 70, kx: 50, ky: 67.7, ks: 27, ox: 50, oy: 87.5, os: 18, cols: 4, rows: 4, fill: 81 };
const mergeLayout = l => (l && l.lv === DEF_LAYOUT.lv ? { ...DEF_LAYOUT, ...l } : { ...DEF_LAYOUT });
const SPRITES = {
  machine: ['assets/machine.png', 'マシン本体'],
  knob: ['assets/knob.png', 'ハンドル'],
  capsules: ['assets/capsules.png', 'カプセル'],
  bg: ['assets/bg.png', '背景'],
  burst: ['assets/burst.png', '後光エフェクト'],
};
const SLIDERS = [
  ['dx', 'ドーム 中心X (%)', 0, 100, .1], ['dy', 'ドーム 中心Y (%)', 0, 100, .1], ['ds', 'ドーム 直径 (%)', 10, 100, .5],
  ['ce', 'ドーム 天井の高さ (%)', 10, 100, 1], ['fl', 'ドーム 床の高さ (%)', 10, 100, 1],
  ['kx', 'ハンドル 中心X (%)', 0, 100, .1], ['ky', 'ハンドル 中心Y (%)', 0, 100, .1], ['ks', 'ハンドル サイズ (%)', 5, 60, .5],
  ['ox', '取り出し口 中心X (%)', 0, 100, .5], ['oy', '取り出し口 中心Y (%)', 0, 100, .5], ['os', '出てくるカプセルのサイズ (%)', 5, 40, .5],
  ['cols', 'カプセル画像 列数', 1, 8, 1], ['rows', 'カプセル画像 行数', 1, 8, 1], ['fill', 'カプセルがマス内に占める割合 (%)', 40, 100, 1],
];

// ---------- state ----------
function fresh() {
  const s = { title: 'ガチャマシーン', items: [], history: [], round: 1, seq: 1, opts: { sound: true, fast: false }, layout: { ...DEF_LAYOUT } };
  ['A賞', 'B賞', 'C賞', 'D賞', 'E賞', 'F賞'].forEach(n => newItem(s, n));
  return s;
}
function newItem(s, name) {
  const it = { id: s.seq, name, c: (s.seq - 1) % 16 };
  s.seq++;
  s.items.push(it);
  return it;
}
function load() {
  try {
    const p = JSON.parse(localStorage.getItem(KEY));
    if (p && Array.isArray(p.items) && Array.isArray(p.history)) {
      const f = fresh();
      return { ...f, ...p, opts: { ...f.opts, ...p.opts }, layout: mergeLayout(p.layout) };
    }
  } catch (e) { /* 保存データなし・破損時は初期状態 */ }
  return fresh();
}
function saveLocal() {
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { /* 保存不可でも動作は継続 */ }
}
function save() {
  state.rev = Math.max(Date.now(), (state.rev || 0) + 1);   // 新しい方を正とするための版番号
  saveLocal();
  schedulePush();
}
let state = load();

// 今の周でまだ当選していないもの
function pool() {
  const drawn = new Set(state.history.filter(h => h.round === state.round).map(h => h.itemId));
  return state.items.filter(i => !drawn.has(i.id));
}
// 偏りのない一様乱数（剰余バイアスを除去）
function randInt(n) {
  const lim = Math.floor(0x100000000 / n) * n;
  const u = new Uint32Array(1);
  do { crypto.getRandomValues(u); } while (u[0] >= lim);
  return u[0] % n;
}

// ---------- sprites ----------
const root = document.documentElement;
const imgs = {};
function loadSprites() {
  for (const [k, [src]] of Object.entries(SPRITES)) {
    const im = new Image();
    im.onload = () => {
      imgs[k] = im;
      root.classList.add('has-' + k);
      if (k === 'machine') $('#machineImg').src = src;
      if (k === 'knob') $('#knobImg').src = src;
      renderSprites(); renderItems(); wake(1);
    };
    im.src = src;
  }
}

function drawCapsule(ctx, c, x, y, r, a) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(a);
  const sp = imgs.capsules, L = state.layout;
  if (sp) {
    const sw = sp.naturalWidth / L.cols, sh = sp.naturalHeight / L.rows;
    const i = c % (L.cols * L.rows), s = 2 * r / (L.fill / 100);
    ctx.drawImage(sp, (i % L.cols) * sw, Math.floor(i / L.cols) * sh, sw, sh, -s / 2, -s / 2, s, s);
  } else {
    const h = HUES[c % HUES.length];
    let g = ctx.createRadialGradient(-r * .3, r * .3, r * .1, 0, 0, r);
    g.addColorStop(0, 'rgba(255,255,255,.95)'); g.addColorStop(1, 'rgba(205,215,240,.85)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI); ctx.fill();
    g = ctx.createRadialGradient(-r * .35, -r * .5, r * .05, 0, 0, r);
    g.addColorStop(0, `hsl(${h} 100% 78%)`); g.addColorStop(.6, `hsl(${h} 85% 55%)`); g.addColorStop(1, `hsl(${h} 80% 38%)`);
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, r, Math.PI, Math.PI * 2); ctx.fill();
    ctx.fillStyle = `hsl(${h} 70% 30%)`; ctx.fillRect(-r, -r * .07, r * 2, r * .14);
    ctx.strokeStyle = 'rgba(0,0,0,.25)'; ctx.lineWidth = Math.max(1, r * .05);
    ctx.beginPath(); ctx.arc(0, 0, r - ctx.lineWidth / 2, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,.6)';
    ctx.beginPath(); ctx.ellipse(-r * .38, -r * .5, r * .22, r * .12, -.6, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
}
// キャンバス全体に1個だけ描く
function drawSingle(cv, c, px) {
  const dpr = window.devicePixelRatio || 1;
  const w = px || Math.max(1, Math.round(cv.clientWidth * dpr));
  cv.width = cv.height = w;
  const ctx = cv.getContext('2d');
  ctx.clearRect(0, 0, w, w);
  drawCapsule(ctx, c, w / 2, w / 2, w / 2 * (imgs.capsules ? state.layout.fill / 100 : .92), 0);
}

// ---------- dome physics (単位円の中で計算) ----------
const domeCv = $('#domeCanvas');
let bodies = [], raf = 0, last = 0, awakeUntil = 0, shakeUntil = 0;

function syncBodies() {
  const p = pool().slice(0, MAX_BODIES);
  const ids = new Map(p.map(i => [i.id, i]));
  bodies = bodies.filter(b => ids.has(b.id));
  const r = Math.min(.2, Math.max(.085, Math.sqrt(.42 / Math.max(1, p.length))));
  const have = new Set(bodies.map(b => b.id));
  for (const b of bodies) { b.r = r; b.c = ids.get(b.id).c; }
  for (const it of p) {
    if (have.has(it.id)) continue;
    bodies.push({ id: it.id, c: it.c, r, x: (Math.random() - .5) * 1.1, y: -.15 - Math.random() * .45, vx: (Math.random() - .5) * .6, vy: 0, a: Math.random() * 6.28, va: 0 });
  }
  wake(4);
}
function step(dt, shaking) {
  const fl = state.layout.fl / 100, ce = state.layout.ce / 100;
  for (const b of bodies) {
    b.vy += 3.6 * dt;
    if (shaking) {
      b.vx += (Math.random() - .5) * 34 * dt - b.y * 9 * dt;
      b.vy += -Math.random() * 26 * dt + b.x * 9 * dt;
    }
    b.x += b.vx * dt; b.y += b.vy * dt; b.a += b.va * dt;
  }
  for (let k = 0; k < 3; k++) {
    for (let i = 0; i < bodies.length; i++) {
      const a = bodies[i];
      for (let j = i + 1; j < bodies.length; j++) {
        const b = bodies[j];
        const dx = b.x - a.x, dy = b.y - a.y, min = a.r + b.r, d2 = dx * dx + dy * dy;
        if (d2 >= min * min || d2 < 1e-9) continue;
        const d = Math.sqrt(d2), nx = dx / d, ny = dy / d, ov = (min - d) / 2;
        a.x -= nx * ov; a.y -= ny * ov; b.x += nx * ov; b.y += ny * ov;
        const rv = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
        if (rv < 0) {
          const imp = -1.25 * rv / 2;
          a.vx -= imp * nx; a.vy -= imp * ny; b.vx += imp * nx; b.vy += imp * ny;
        }
      }
    }
    for (const b of bodies) {
      const d = Math.hypot(b.x, b.y), lim = 1 - b.r;
      if (d <= lim) continue;
      const nx = b.x / d, ny = b.y / d;
      b.x = nx * lim; b.y = ny * lim;
      const vn = b.vx * nx + b.vy * ny;
      if (vn > 0) { b.vx -= 1.3 * vn * nx; b.vy -= 1.3 * vn * ny; }
      b.vx *= .985; b.vy *= .985;
      b.va += ((b.vy * nx - b.vx * ny) / b.r - b.va) * .2;
    }
    for (const b of bodies) {     // 球の上下を切り落とした床と天井
      if (b.y > fl - b.r) {
        b.y = fl - b.r;
        if (b.vy > 0) b.vy *= -.3;
        b.vx *= .985;
        b.va += (b.vx / b.r - b.va) * .2;
      } else if (b.y < b.r - ce) {
        b.y = b.r - ce;
        if (b.vy < 0) b.vy *= -.3;
      }
    }
  }
  for (const b of bodies) { b.vx *= .998; b.vy *= .998; b.va *= .97; }
}
function drawDome() {
  const dpr = window.devicePixelRatio || 1;
  const w = Math.max(1, Math.round(domeCv.clientWidth * dpr));
  if (domeCv.width !== w) domeCv.width = domeCv.height = w;
  const ctx = domeCv.getContext('2d'), R = w / 2;
  ctx.clearRect(0, 0, w, w);
  for (const b of bodies) drawCapsule(ctx, b.c, R + b.x * R, R + b.y * R, b.r * R, b.a);
}
function frame() {
  const now = performance.now();
  const dt = Math.min(.033, (now - last) / 1000);
  last = now;
  const shaking = now < shakeUntil;
  step(dt / 2, shaking); step(dt / 2, shaking);
  drawDome();
  raf = now < awakeUntil ? requestAnimationFrame(frame) : 0;
}
function wake(sec) {
  awakeUntil = Math.max(awakeUntil, performance.now() + sec * 1000);
  if (!raf) { last = performance.now(); raf = requestAnimationFrame(frame); }
}

// ---------- sound ----------
let ac;
function tone(f, at, dur, type, vol, f2) {
  if (!state.opts.sound) return;
  try {
    ac = ac || new (window.AudioContext || window.webkitAudioContext)();
    if (ac.state === 'suspended') ac.resume();
    const o = ac.createOscillator(), g = ac.createGain(), t = ac.currentTime + at;
    o.type = type; o.frequency.setValueAtTime(f, t);
    if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + dur);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(.0001, t + dur);
    o.connect(g).connect(ac.destination); o.start(t); o.stop(t + dur + .02);
  } catch (e) { /* 音が出せない環境では無音 */ }
}
const sfx = {
  ratchet(n) { for (let i = 0; i < n; i++) tone(170 + (i % 2) * 70, i * .09, .05, 'square', .05); },
  drop() { tone(520, 0, .28, 'sine', .14, 110); },
  rattle() { for (let i = 0; i < 6; i++) tone(300 + i * 60, i * .1, .06, 'triangle', .07); },
  fanfare() { [523, 659, 784, 1047].forEach((f, i) => tone(f, i * .09, .35, 'triangle', .11)); tone(1319, .36, .7, 'triangle', .09); },
  undo() { tone(420, 0, .22, 'sine', .09, 190); },
};

// ---------- draw / undo ----------
const machine = $('#machine'), reveal = $('#reveal');
let busy = false, knobAngle = 0, toastTimer = 0;
const sleep = ms => new Promise(r => setTimeout(r, ms));

function toast(msg) {
  const t = $('#toast');
  t.textContent = msg; t.classList.add('on');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('on'), 2200);
}

async function pull() {
  if (reveal.classList.contains('on')) { if (!busy) closeReveal(); return; }
  if (busy) return;
  busy = true; renderControls();
  await syncPull(true);           // 他の端末の最新状態を取り込んでから抽選する
  if (!state.items.length) {
    busy = false; renderControls();
    toast('中身を追加してください'); switchTab('items'); return;
  }
  const fast = state.opts.fast, prevRound = state.round;

  if (!pool().length) {           // 空になったので全員復活
    state.round++;
    syncBodies(); renderStats();
    await sleep(fast ? 200 : 800);
  }
  const p = pool(), it = p[randInt(p.length)];
  const entry = { no: state.history.length + 1, itemId: it.id, name: it.name, c: it.c, round: state.round, prevRound, t: Date.now() };
  state.history.push(entry);
  save();

  knobAngle += 360;
  $('#knobRot').style.transform = `rotate(${knobAngle}deg)`;
  machine.classList.add('spin');
  sfx.ratchet(fast ? 4 : 12);
  shakeUntil = performance.now() + (fast ? 350 : 1100);
  wake(5);
  await sleep(fast ? 400 : 1200);
  machine.classList.remove('spin');

  syncBodies();
  drawSingle($('#outCanvas'), it.c);
  $('#outlet').classList.add('show');
  sfx.drop();
  await sleep(fast ? 300 : 800);
  $('#outlet').classList.remove('show');

  drawSingle($('#halfTop'), it.c, 480);
  drawSingle($('#halfBot'), it.c, 480);
  $('#rvName').textContent = entry.name;
  const left = pool().length;
  $('#rvMeta').textContent = `No.${entry.no} ・ ${entry.round}周目 ・ ` + (left ? `残り ${left}` : '全部出ました！');
  reveal.className = 'reveal on';
  render();
  await sleep(450);
  reveal.classList.add('shake'); sfx.rattle();
  await sleep(fast ? 200 : 750);
  reveal.classList.remove('shake');
  reveal.classList.add('open');
  sfx.fanfare(); confetti();
  busy = false; renderControls();
  $('#rvOk').focus();
}
function closeReveal() {
  reveal.className = 'reveal';
  $('#confetti').textContent = '';
}
function undo() {
  if (busy) return;
  if (!state.history.length) { toast('取り消せる当選がありません'); return; }
  closeReveal();
  const h = state.history.pop();
  state.round = h.prevRound || h.round;
  save(); syncBodies(); render(); sfx.undo();
  toast(`「${h.name}」の当選を取り消しました`);
}
function resetRound() {
  if (busy) return;
  if (pool().length === state.items.length) { toast('すでに全部入っています'); return; }
  state.round++;
  save(); syncBodies(); render();
  toast('全部マシンに戻しました');
}
function confetti() {
  const box = $('#confetti');
  box.textContent = '';
  for (let i = 0; i < 70; i++) {
    const p = document.createElement('i');
    p.style.left = Math.random() * 100 + '%';
    p.style.background = `hsl(${HUES[i % HUES.length]} 95% 62%)`;
    p.style.setProperty('--sx', (Math.random() - .5) * 240 + 'px');
    p.style.setProperty('--sr', (Math.random() - .5) * 1400 + 'deg');
    p.style.animationDuration = 1.8 + Math.random() * 1.8 + 's';
    p.style.animationDelay = Math.random() * .5 + 's';
    box.appendChild(p);
  }
}

// ---------- render ----------
function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}
function renderStats() {
  const p = pool().length, n = state.items.length, s = $('#stats');
  s.textContent = '';
  if (!n) { s.textContent = '中身がありません'; return; }
  s.append('残り ', el('b', '', `${p} / ${n}`), ` ・ ${state.round}周目 ・ `);
  s.append(p ? `1つあたり ${(100 / p).toFixed(1)}%` : '全部出ました。次に回すと全員復活します');
}
function renderControls() {
  const empty = state.items.length && !pool().length;
  $('#pullBtn').textContent = empty ? '補充して回す' : '回す';
  $('#pullBtn').disabled = busy;
  for (const id of ['#undoBtn', '#undoBtn2']) $(id).disabled = busy || !state.history.length;
  $('#resetBtn').disabled = busy;
}
function renderItems() {
  const ul = $('#itemList'), left = new Set(pool().map(i => i.id));
  ul.textContent = '';
  if (!state.items.length) ul.append(el('li', 'empty', 'まだ何も入っていません'));
  for (const it of state.items) {
    const li = el('li', left.has(it.id) ? '' : 'done');
    const cv = el('canvas');
    const inp = el('input'); inp.type = 'text'; inp.value = it.name;
    inp.addEventListener('change', () => {
      const v = inp.value.trim();
      if (v) { it.name = v; save(); syncBulk(); } else inp.value = it.name;
    });
    const del = el('button', 'x', '✕'); del.type = 'button'; del.title = '削除';
    del.addEventListener('click', () => {
      state.items = state.items.filter(i => i !== it);
      save(); syncBodies(); render();
    });
    li.append(cv, inp, el('span', 'badge', left.has(it.id) ? '残り' : '当選済'), del);
    ul.append(li);
    drawSingle(cv, it.c, 52);
  }
  syncBulk();
}
function syncBulk() { $('#bulkText').value = state.items.map(i => i.name).join('\n'); }
function renderHistory() {
  const ul = $('#historyList');
  ul.textContent = '';
  if (!state.history.length) ul.append(el('li', 'empty', 'まだ履歴はありません'));
  for (let i = state.history.length - 1; i >= 0; i--) {
    const h = state.history[i];
    const li = el('li', i === state.history.length - 1 ? 'latest' : '');
    const cv = el('canvas');
    const meta = el('span', 'h-meta');
    meta.append(`${h.round}周目`, el('br'), new Date(h.t).toLocaleTimeString('ja-JP'));
    li.append(el('span', 'h-no', '#' + h.no), cv, el('span', 'h-name', h.name), meta);
    ul.append(li);
    drawSingle(cv, h.c, 52);
  }
}
function renderSprites() {
  const ul = $('#spriteStatus');
  ul.textContent = '';
  for (const [k, [src, label]] of Object.entries(SPRITES)) {
    const li = el('li');
    li.append(el('span', '', `${label}（${src}）`), el('span', imgs[k] ? 'ok' : 'ng', imgs[k] ? '✓ 使用中' : '未設定'));
    ul.append(li);
  }
}
function renderTitle() {
  $('#title').textContent = state.title;
  document.title = state.title;
}
function render() { renderTitle(); renderStats(); renderControls(); renderItems(); renderHistory(); }

function applyLayout() {
  for (const [k] of SLIDERS) machine.style.setProperty('--' + k, state.layout[k]);
  wake(1);
}
function buildSliders() {
  const box = $('#layoutSliders');
  box.textContent = '';
  for (const [k, label, min, max, stepv] of SLIDERS) {
    const row = el('label', 'slider'), inp = el('input'), out = el('output', '', state.layout[k]);
    inp.type = 'range'; inp.min = min; inp.max = max; inp.step = stepv; inp.value = state.layout[k];
    inp.addEventListener('input', () => {
      state.layout[k] = +inp.value; out.textContent = inp.value;
      save(); applyLayout();
      if (k === 'cols' || k === 'rows' || k === 'fill') { renderItems(); renderHistory(); }
    });
    row.append(el('span', '', label), inp, out);
    box.append(row);
  }
}
function switchTab(name) {
  document.querySelectorAll('#tabs button').forEach(b => b.classList.toggle('on', b.dataset.tab === name));
  document.querySelectorAll('.pane').forEach(p => p.classList.toggle('on', p.dataset.pane === name));
  machine.classList.toggle('show-guides', name === 'settings');
}
// 誤操作防止：2回押しで確定
function confirmBtn(btn, fn) {
  btn.addEventListener('click', () => {
    if (btn.dataset.arm) {
      delete btn.dataset.arm; btn.textContent = btn.dataset.label; fn();
    } else {
      btn.dataset.label = btn.textContent; btn.dataset.arm = '1'; btn.textContent = 'もう一度押して確定';
      setTimeout(() => { if (btn.dataset.arm) { delete btn.dataset.arm; btn.textContent = btn.dataset.label; } }, 2500);
    }
  });
}

// ---------- sync (GitHub の非公開 Gist に状態を置いて端末間で共有) ----------
const SYNC_KEY = 'gacha.sync', SYNC_FILE = 'gacha-state.json';
let sync = {}, pushTimer = 0, pushing = false;
try { sync = JSON.parse(localStorage.getItem(SYNC_KEY)) || {}; } catch (e) { /* 未設定 */ }

function storeSync() {
  try { localStorage.setItem(SYNC_KEY, JSON.stringify(sync)); } catch (e) { /* 保存不可 */ }
}
function setSyncStatus(msg) {
  $('#syncStatus').textContent = sync.gistId ? msg : '';
  $('#syncStatus2').textContent = msg;
}
const syncedNow = () => setSyncStatus('☁ 同期済み ' + new Date().toLocaleTimeString('ja-JP'));
async function api(path, opt = {}) {
  const headers = { Accept: 'application/vnd.github+json', Authorization: 'Bearer ' + sync.token };
  if (opt.body) headers['Content-Type'] = 'application/json';
  const r = await fetch('https://api.github.com' + path, { cache: 'no-store', signal: AbortSignal.timeout(8000), ...opt, headers });
  if (!r.ok) throw new Error(r.status === 401 ? 'トークンが無効です' : 'GitHub エラー ' + r.status);
  return r.json();
}
// 端末間で共有する部分（効果音などの好みは端末ごと）
function sharedState() {
  const { title, items, history, round, seq, layout, rev } = state;
  return JSON.stringify({ title, items, history, round, seq, layout, rev });
}
function applyRemote(r) {
  if (!r || !Array.isArray(r.items) || !Array.isArray(r.history)) return;
  state = { ...fresh(), ...r, opts: state.opts, layout: mergeLayout(r.layout) };
  saveLocal();
  $('#titleInput').value = state.title;
  buildSliders(); applyLayout(); syncBodies(); render();
}
function schedulePush() {
  if (!sync.gistId) return;
  clearTimeout(pushTimer);
  pushTimer = setTimeout(syncPush, 600);
  setSyncStatus('☁ 保存中…');
}
async function syncPush() {
  pushTimer = 0;
  if (pushing) { schedulePush(); return; }
  pushing = true;
  try {
    await api('/gists/' + sync.gistId, { method: 'PATCH', body: JSON.stringify({ files: { [SYNC_FILE]: { content: sharedState() } } }) });
    syncedNow();
  } catch (e) { setSyncStatus('⚠ 同期できません（' + e.message + '）'); }
  pushing = false;
}
// mode: true = 演出中でも取り込む / 'adopt' = 版に関係なく相手側を採用
async function syncPull(mode) {
  if (!sync.gistId || (busy && !mode)) return;
  try {
    const f = (await api('/gists/' + sync.gistId)).files[SYNC_FILE];
    if (busy && !mode) return;
    if (!f) { schedulePush(); return; }
    const r = JSON.parse(f.truncated ? await (await fetch(f.raw_url, { cache: 'no-store' })).text() : f.content);
    const d = (r.rev || 0) - (state.rev || 0);
    if (mode === 'adopt' || d > 0) applyRemote(r);
    else if (d < 0 && !pushTimer) schedulePush();
    if (!pushTimer) syncedNow();
  } catch (e) { setSyncStatus('⚠ 同期できません（' + e.message + '）'); }
}
async function syncConnect(token) {
  sync = { token };
  setSyncStatus('接続中…');
  try {
    const mine = (await api('/gists?per_page=100')).find(g => g.files && g.files[SYNC_FILE]);
    if (mine) {
      sync.gistId = mine.id; storeSync();
      await syncPull('adopt');
      toast('同期データを読み込みました');
    } else {
      const made = await api('/gists', { method: 'POST', body: JSON.stringify({ description: 'ガチャマシーン 同期データ', public: false, files: { [SYNC_FILE]: { content: sharedState() } } }) });
      sync.gistId = made.id; storeSync();
      syncedNow();
      toast('同期を開始しました');
    }
  } catch (e) {
    sync = {};
    setSyncStatus('⚠ 接続できません（' + e.message + '）');
  }
  renderSync();
}
function renderSync() {
  $('#syncOff').hidden = !!sync.gistId;
  $('#syncOn').hidden = !sync.gistId;
}
$('#syncForm').addEventListener('submit', e => {
  e.preventDefault();
  const t = $('#syncToken').value.trim();
  $('#syncToken').value = '';
  if (t) syncConnect(t);
});
$('#syncNow').addEventListener('click', () => syncPull());
$('#syncDisconnect').addEventListener('click', () => {
  sync = {};
  try { localStorage.removeItem(SYNC_KEY); } catch (e) { /* 保存不可 */ }
  setSyncStatus('');
  renderSync();
  toast('この端末の同期を解除しました');
});
document.addEventListener('visibilitychange', () => { if (!document.hidden) syncPull(); });
setInterval(() => { if (!document.hidden) syncPull(); }, 15000);

// ---------- events ----------
$('#pullBtn').addEventListener('click', pull);
$('#knob').addEventListener('click', pull);
$('#undoBtn').addEventListener('click', undo);
$('#undoBtn2').addEventListener('click', undo);
$('#rvUndo').addEventListener('click', undo);
$('#rvOk').addEventListener('click', closeReveal);
$('#resetBtn').addEventListener('click', resetRound);
reveal.addEventListener('click', e => { if (e.target === reveal && !busy) closeReveal(); });
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && !busy) closeReveal();
  if (e.key === ' ' && !/INPUT|TEXTAREA|BUTTON|SUMMARY/.test(e.target.tagName)) { e.preventDefault(); pull(); }
});
$('#tabs').addEventListener('click', e => { if (e.target.dataset.tab) switchTab(e.target.dataset.tab); });

$('#addForm').addEventListener('submit', e => {
  e.preventDefault();
  const v = $('#addInput').value.trim();
  if (!v) return;
  newItem(state, v);
  $('#addInput').value = '';
  save(); syncBodies(); render();
});
$('#bulkApply').addEventListener('click', () => {
  // 同じ名前の既存アイテムは引き継ぎ、当選済みの状態を保つ
  const old = state.items.slice();
  state.items = [];
  for (const name of $('#bulkText').value.split('\n').map(s => s.trim()).filter(Boolean)) {
    const i = old.findIndex(o => o.name === name);
    if (i >= 0) state.items.push(old.splice(i, 1)[0]); else newItem(state, name);
  }
  save(); syncBodies(); render();
  toast(`${state.items.length}個を反映しました`);
});
confirmBtn($('#clearHistory'), () => {
  state.history = []; state.round = 1;
  save(); syncBodies(); render();
  toast('履歴を消去しました');
});

$('#titleInput').value = state.title;
$('#titleInput').addEventListener('input', e => { state.title = e.target.value || 'ガチャマシーン'; save(); renderTitle(); });
$('#optSound').checked = state.opts.sound;
$('#optSound').addEventListener('change', e => { state.opts.sound = e.target.checked; save(); });
$('#optFast').checked = state.opts.fast;
$('#optFast').addEventListener('change', e => { state.opts.fast = e.target.checked; save(); });
$('#layoutReset').addEventListener('click', () => {
  state.layout = { ...DEF_LAYOUT };
  save(); buildSliders(); applyLayout(); renderItems(); renderHistory();
});
window.addEventListener('resize', () => wake(1));

// ---------- init ----------
applyLayout();
buildSliders();
renderSprites();
render();
syncBodies();
for (let i = 0; i < 240; i++) step(1 / 60, false);   // 開いた時点で底に積もった状態にしておく
loadSprites();
renderSync();
syncPull();
})();
