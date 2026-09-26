/* 든든 도우미 — 서버·요금 없이 폰 브라우저에서 돌아가는 어르신용 도구 모음 */
import { WORDS, SCAM_WORDS, URL_RE } from './words.js';
import qrcode from './vendor/qrcode.mjs';

const KEY = 'easy-helper-v1';
const NTFY = 'https://ntfy.sh/';
const OCR_URL = 'https://cdn.jsdelivr.net/npm/tesseract.js@7.0.0/dist/tesseract.min.js';

const $ = (s, el = document) => el.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uid = () => Math.random().toString(36).slice(2, 10);
const pad = (n) => String(n).padStart(2, '0');
const DAYS = ['일', '월', '화', '수', '목', '금', '토'];
const todayKey = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
const niceTime = (t) => { const d = new Date(t); return `${d.getMonth() + 1}월 ${d.getDate()}일 ${d.getHours() < 12 ? '오전' : '오후'} ${((d.getHours() + 11) % 12) + 1}시 ${pad(d.getMinutes())}분`; };
const cleanPhone = (p) => String(p || '').replace(/[^\d+]/g, '');
const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const smsHref = (phone, body) => `sms:${cleanPhone(phone)}${isIOS ? '&' : '?'}body=${encodeURIComponent(body)}`;
const telHref = (phone) => `tel:${cleanPhone(phone)}`;
const FACES = ['👩', '👨', '👧', '👦', '🧑', '👵', '👴', '🏥'];
const newTopic = () => 'dd-' + Array.from(crypto.getRandomValues(new Uint8Array(12)), (b) => 'abcdefghijkmnpqrstuvwxyz23456789'[b % 32]).join('');

/* ---------- 저장 ---------- */
const defaultState = () => ({
  v: 2,
  me: '',
  size: 1,
  topic: '',
  contacts: [],
  primaryId: '',
  emergency: { name: '', birth: '', blood: '', disease: '', meds: '', allergy: '', hospital: '', note: '' },
  helloLog: [],
});

function hydrate(d) {
  const base = defaultState();
  const out = { ...base, ...d, emergency: { ...base.emergency, ...(d.emergency || {}) } };
  delete out.apiKey; // 예전 버전의 AI 키는 더 이상 쓰지 않음
  delete out.helloToId;
  return out;
}

function load() {
  try { const raw = localStorage.getItem(KEY); if (raw) return hydrate(JSON.parse(raw)); } catch (e) { /* 저장소를 못 쓰는 환경 */ }
  return defaultState();
}
let state = load();
function save() {
  try { localStorage.setItem(KEY, JSON.stringify(state)); }
  catch (e) { toast('저장이 안 돼요. 브라우저 설정을 확인해 주세요.'); }
}

const primary = () => state.contacts.find((c) => c.id === state.primaryId) || state.contacts[0];
const whoAmI = () => state.me.trim() || '어르신';

let toastTimer;
function toast(msg) {
  const el = $('#toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2600);
}

function speak(text) {
  if (!('speechSynthesis' in window) || !text) return;
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = 'ko-KR';
  u.rate = 0.9;
  speechSynthesis.speak(u);
}
const stopSpeak = () => { if ('speechSynthesis' in window) speechSynthesis.cancel(); };

/* ---------- 가족 알림 (ntfy, 무료 푸시) ---------- */
// 가족 폰의 ntfy 앱으로 바로 알림이 감. JSON을 text/plain으로 보내 CORS 사전 요청 없이 전송.
async function notifyFamily({ title, message, click, priority = 4, tags = [] }) {
  if (!state.topic) throw new Error('no-topic');
  const body = { topic: state.topic, title, message, priority, tags };
  if (click) { body.click = click; body.actions = [{ action: 'view', label: '지도 보기', url: click }]; }
  const res = await fetch(NTFY, { method: 'POST', body: JSON.stringify(body) });
  if (!res.ok) throw new Error('ntfy ' + res.status);
}

function getPosition(timeout = 10000) {
  return new Promise((resolve) => {
    if (!navigator.geolocation) return resolve(null);
    navigator.geolocation.getCurrentPosition((p) => resolve(p.coords), () => resolve(null), { enableHighAccuracy: true, timeout, maximumAge: 60000 });
  });
}
const mapUrl = (c) => `https://map.kakao.com/link/map/${encodeURIComponent(whoAmI() + ' 위치')},${c.latitude.toFixed(6)},${c.longitude.toFixed(6)}`;

/* ---------- 화면 공통 ---------- */
const topbar = (title) => `<div class="topbar"><button class="back" data-act="go" data-to="home">← 처음으로</button><h1>${title}</h1></div>`;
const needSetup = (what) => `<div class="card warn"><h2>${what}</h2>
  <p class="muted" style="margin-top:6px">가족이 설정을 먼저 해 주세요.</p>
  <button class="btn full" style="margin-top:12px" data-act="go" data-to="settings">⚙️ 설정하러 가기</button></div>`;
const callButtons = (list = state.contacts) => list.map((c) => `<a class="btn blue huge full" href="${telHref(c.phone)}">📞 ${esc(c.name)}에게 전화</a>`).join('');

/* ---------- 홈 ---------- */
function viewHome() {
  const d = new Date();
  const sentToday = state.helloLog.some((h) => h.day === todayKey());
  const ready = state.contacts.length && state.topic;
  return `<div class="hello">
      <h1>안녕하세요 👋</h1>
      <p>${d.getMonth() + 1}월 ${d.getDate()}일 ${DAYS[d.getDay()]}요일</p>
    </div>
    ${ready ? '' : `<div class="card warn" style="margin-bottom:14px"><h2>처음 쓰시나요?</h2><p class="muted" style="margin-top:6px">가족이 맨 아래 <b>설정</b>에서 연락처와 알림을 먼저 연결해 주세요.</p></div>`}
    <div class="home-grid">
      <button class="big-btn b-purple" data-act="go" data-to="read"><span class="ico">📖</span><span>글씨 읽어 주기<small>비추면 크게 보여 주고, 쉬운 말로 읽어 줘요</small></span></button>
      <button class="big-btn b-orange" data-act="go" data-to="call" data-fresh="1"><span class="ico">📍</span><span>가족에게 연락<small>내 위치가 가족에게 바로 가요</small></span></button>
      <button class="big-btn b-red" data-act="go" data-to="emergency"><span class="ico">🚑</span><span>응급 정보<small>아플 때 이 화면을 보여 주세요</small></span></button>
      <button class="big-btn b-green" data-act="go" data-to="hello"><span class="ico">💚</span><span>안부 보내기<small class="done-mark">${sentToday ? '✓ 오늘 안부를 보냈어요' : '오늘도 잘 있다고 알려요'}</small></span></button>
    </div>
    <button class="settings-link" data-act="go" data-to="settings">⚙️ 설정 (가족용)</button>`;
}

/* ---------- 1. 글씨 읽어 주기 (돋보기 + 글자 인식 + 쉬운 말) ---------- */
const cam = { stream: null, track: null, hw: null, hwVal: 1, css: 1, panX: 0, panY: 0, torch: false, hasTorch: false, error: '' };
const read = { status: 'camera', progress: 0, text: '', result: null, error: '' }; // camera | paste | working | done

function viewRead() {
  if (read.status === 'working') {
    return `${topbar('📖 글씨 읽기')}<div class="card loading">글자를 읽고 있어요<span class="dots"></span>
      <div class="bar"><i style="width:${Math.round(read.progress * 100)}%"></i></div>
      <p class="muted" style="margin-top:8px">처음 한 번은 준비하느라 30초쯤 걸려요</p></div>`;
  }
  if (read.status === 'done' && read.result) return `${topbar('📖 글씨 읽기')}${resultView(read.result)}`;
  if (read.status === 'paste') {
    return `${topbar('💬 문자 풀기')}
      <div class="stack"><div class="card">
        <label class="field" style="margin-top:0"><span>문자 내용을 여기에 붙여 넣으세요</span>
          <textarea id="paste-text" placeholder="문자를 꾹 눌러 복사한 뒤, 여기를 꾹 눌러 붙여넣기">${esc(read.text)}</textarea>
        </label>
        <button class="btn purple huge full" style="margin-top:12px" data-act="paste-run">📖 쉬운 말로 풀기</button>
      </div>
      <button class="btn full" data-act="read-camera">📷 카메라로 돌아가기</button></div>`;
  }
  return `${topbar('📖 글씨 읽기')}
    <div class="stack">
      <div class="magnifier" id="mag">
        <video id="cam" playsinline muted autoplay></video>
        <span class="badge" id="zoom-badge">1배</span>
      </div>
      <p class="muted" id="cam-msg">${cam.error ? esc(cam.error) : '읽고 싶은 글씨를 화면에 비추세요.'}</p>
      ${read.error ? `<div class="card warn"><p>${esc(read.error)}</p></div>` : ''}
      <button class="btn purple huge full" data-act="read-run">📖 읽어 주세요</button>
      <div class="zoom-row">
        <button class="btn" data-act="zoom" data-d="-1" aria-label="작게">－</button>
        <input type="range" id="zoom" min="1" max="5" step="0.1" value="1" aria-label="확대">
        <button class="btn" data-act="zoom" data-d="1" aria-label="크게">＋</button>
      </div>
      <button class="btn full" data-act="torch" id="torch-btn" hidden>🔦 불 켜기</button>
      <button class="settings-link" data-act="read-paste">💬 받은 문자를 풀고 싶으면 여기를 누르세요</button>
    </div>`;
}

async function startCamera() {
  cam.error = '';
  const video = $('#cam');
  if (!navigator.mediaDevices?.getUserMedia) { camError('이 브라우저에서는 카메라를 쓸 수 없어요. 크롬이나 사파리로 열어 주세요.'); return; }
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: false });
    if (route !== 'read' || read.status !== 'camera') { stream.getTracks().forEach((t) => t.stop()); return; }
    cam.stream = stream;
    cam.track = stream.getVideoTracks()[0];
    video.srcObject = stream;
    await video.play().catch(() => {});
    const caps = cam.track.getCapabilities ? cam.track.getCapabilities() : {};
    cam.hw = caps.zoom && caps.zoom.max > caps.zoom.min ? { min: caps.zoom.min, max: Math.min(caps.zoom.max, 10), step: caps.zoom.step || 0.1 } : null;
    cam.hwVal = cam.hw ? cam.hw.min : 1;
    cam.hasTorch = !!caps.torch;
    syncCamUI();
  } catch (e) {
    camError(e && e.name === 'NotAllowedError'
      ? '카메라 사용을 허락해 주세요. 주소창 옆 자물쇠(🔒)를 눌러 카메라를 "허용"으로 바꾸면 돼요.'
      : '카메라를 켤 수 없어요. 다른 앱이 카메라를 쓰고 있지 않은지 확인해 주세요.');
  }
}

function camError(msg) {
  cam.error = msg;
  const el = $('#cam-msg');
  if (el) { el.textContent = msg; el.style.color = 'var(--red)'; }
}

function stopCamera() {
  if (cam.stream) cam.stream.getTracks().forEach((t) => t.stop());
  Object.assign(cam, { stream: null, track: null, hw: null, css: 1, panX: 0, panY: 0, torch: false, hasTorch: false });
}

function syncCamUI() {
  const slider = $('#zoom');
  if (!slider) return;
  if (cam.hw) { Object.assign(slider, { min: cam.hw.min, max: cam.hw.max, step: cam.hw.step }); slider.value = cam.hwVal; }
  else { Object.assign(slider, { min: 1, max: 5, step: 0.1 }); slider.value = cam.css; }
  applyView();
  const t = $('#torch-btn');
  t.hidden = !cam.hasTorch;
  t.textContent = cam.torch ? '🔦 불 끄기' : '🔦 불 켜기';
}

function applyView() {
  const el = $('#cam');
  if (!el) return;
  const s = cam.css;
  const lim = ((s - 1) / (2 * s)) * 100; // 확대한 만큼만 옆으로 밀 수 있게
  cam.panX = Math.max(-lim, Math.min(lim, cam.panX));
  cam.panY = Math.max(-lim, Math.min(lim, cam.panY));
  el.style.transform = `scale(${s}) translate(${cam.panX}%, ${cam.panY}%)`;
  const badge = $('#zoom-badge');
  if (badge) badge.textContent = `${Math.round((cam.hw ? cam.hwVal : s) * 10) / 10}배`;
}

function setZoom(v) {
  if (cam.hw) {
    cam.hwVal = Math.max(cam.hw.min, Math.min(cam.hw.max, v));
    cam.track.applyConstraints({ advanced: [{ zoom: cam.hwVal }] }).catch(() => { cam.hw = null; cam.hwVal = 1; syncCamUI(); });
  } else {
    cam.css = Math.max(1, Math.min(5, v));
  }
  const slider = $('#zoom');
  if (slider) slider.value = cam.hw ? cam.hwVal : cam.css;
  applyView();
}

// 화면에 보이는 부분만 잘라서 글자 인식에 넘김 (확대·이동·object-fit: cover 반영)
function captureVisible() {
  const video = $('#cam');
  const box = $('#mag');
  const vw = video.videoWidth, vh = video.videoHeight;
  const W = box.clientWidth, H = box.clientHeight;
  const s0 = Math.max(W / vw, H / vh);
  const ox = (W - vw * s0) / 2, oy = (H - vh * s0) / 2;
  const s = cam.css, tx = (cam.panX / 100) * W, ty = (cam.panY / 100) * H;
  const toVideo = (qx, qy) => [((W / 2 + (qx - W / 2) / s - tx) - ox) / s0, ((H / 2 + (qy - H / 2) / s - ty) - oy) / s0];
  let [x0, y0] = toVideo(0, 0);
  let [x1, y1] = toVideo(W, H);
  x0 = Math.max(0, x0); y0 = Math.max(0, y0); x1 = Math.min(vw, x1); y1 = Math.min(vh, y1);
  const cw = x1 - x0, ch = y1 - y0;
  // 글자 인식이 잘 되도록 적당한 크기로 키우고 흑백으로
  const k = Math.min(3, 2000 / Math.max(cw, ch));
  const out = document.createElement('canvas');
  out.width = Math.round(cw * k);
  out.height = Math.round(ch * k);
  const g = out.getContext('2d');
  g.filter = 'grayscale(1) contrast(1.4)';
  g.drawImage(video, x0, y0, cw, ch, 0, 0, out.width, out.height);
  return out;
}

let ocrWorker = null;
function loadScript(src) {
  return new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = src; s.onload = res; s.onerror = () => { s.remove(); rej(new Error('load')); };
    document.head.appendChild(s);
  });
}
async function getOcr() {
  if (ocrWorker) return ocrWorker;
  if (!window.Tesseract) await loadScript(OCR_URL);
  ocrWorker = await window.Tesseract.createWorker('kor', 1, {
    logger: (m) => { if (m.status === 'recognizing text' || m.status.startsWith('loading')) { read.progress = m.progress || 0; const bar = $('.loading .bar i'); if (bar) bar.style.width = Math.round(read.progress * 100) + '%'; } },
  });
  return ocrWorker;
}

// 인식 결과 정리: 한글 사이 불필요한 띄어쓰기와 잡음 줄 제거
function tidy(text) {
  return text.split('\n')
    .map((l) => l.replace(/(?<=[가-힣]) (?=[가-힣](?:[ \n]|$))/g, '').replace(/\s{2,}/g, ' ').trim())
    .filter((l) => (l.match(/[가-힣0-9A-Za-z]/g) || []).length >= 2)
    .join('\n');
}

async function runRead() {
  const video = $('#cam');
  if (!video?.videoWidth) { toast('카메라가 아직 켜지지 않았어요'); return; }
  const canvas = captureVisible();
  stopCamera();
  Object.assign(read, { status: 'working', progress: 0, error: '' });
  render();
  try {
    const worker = await getOcr();
    const { data } = await worker.recognize(canvas);
    const text = tidy(data.text || '');
    if ((text.match(/[가-힣0-9]/g) || []).length < 4) {
      Object.assign(read, { status: 'camera', error: '글자를 잘 못 읽었어요. 밝은 곳에서 폰을 조금 떨어뜨려 글씨가 또렷하게 보일 때 다시 눌러 주세요.' });
    } else {
      Object.assign(read, { status: 'done', text, result: explain(text) });
    }
  } catch (e) {
    Object.assign(read, { status: 'camera', error: '처음 한 번은 인터넷이 필요해요. 와이파이나 데이터를 켜고 다시 눌러 주세요.' });
  }
  if (route !== 'read') return;
  render();
  if (read.status === 'done') speak(read.result.speech);
}

// 띄어쓰기가 섞여도 찾도록 (예: "납 부기한")
const WORD_RE = new RegExp(Object.keys(WORDS).sort((a, b) => b.length - a.length)
  .map((w) => [...w].map((ch) => ch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('\\s?')).join('|'), 'g');
const lookup = (m) => WORDS[m.replace(/\s/g, '')];

function explain(text) {
  const found = [...new Set((text.match(WORD_RE) || []).map((m) => m.replace(/\s/g, '')))].filter((w) => WORDS[w]);
  const html = esc(text).replace(WORD_RE, (m) => lookup(m) ? `<mark class="easy">${m}<i>(${esc(lookup(m))})</i></mark>` : m);
  const dates = [...new Set([
    ...(text.match(/\d{4}\s*[.\-/년]\s*\d{1,2}\s*[.\-/월]\s*\d{1,2}\s*일?/g) || []),
    ...(text.match(/(?<![\d.])\d{1,2}\s*월\s*\d{1,2}\s*일/g) || []),
  ].map((s) => s.trim()))];
  const money = [...new Set((text.match(/\d[\d,]*\s*(만\s*)?원/g) || []).map((s) => s.trim()))];
  const scamHits = SCAM_WORDS.filter((w) => text.includes(w));
  const hasLink = URL_RE.test(text);
  const scam = scamHits.length > 0 && (hasLink || scamHits.length >= 2);
  const caution = scam
    ? '사기일 수 있어요. 링크를 누르거나 돈을 보내지 말고, 가족에게 먼저 물어보세요.'
    : hasLink ? '링크가 들어 있어요. 모르는 곳에서 온 것이라면 누르지 마세요.' : '';
  const facts = [dates.length ? `날짜: ${dates.join(', ')}` : '', money.length ? `금액: ${money.join(', ')}` : ''].filter(Boolean).join('\n');
  const speech = [
    caution,
    found.length ? found.map((w) => `${w}는 ${WORDS[w]}라는 뜻이에요.`).join(' ') : '',
    dates.length ? `날짜는 ${dates.join(', ')}.` : '',
    money.length ? `금액은 ${money.join(', ')}.` : '',
    '읽은 글은 이래요. ' + text,
  ].filter(Boolean).join(' ');
  return { html, facts, caution, scam, found, speech };
}

function resultView(r) {
  const p = primary();
  const sec = (title, body, cls = '') => body ? `<div class="sec ${cls}"><b>${title}</b><span class="txt">${body}</span></div>` : '';
  return `<div class="stack">
    <div class="card">
      <div class="result">
        ${sec('⚠️ 조심하세요', esc(r.caution), 'alert')}
        ${r.found.length ? sec('📌 어려운 말 풀이', r.found.map((w) => `<b style="display:inline;color:inherit">${esc(w)}</b> → ${esc(WORDS[w])}`).join('\n')) : ''}
        ${sec('📅 날짜·금액', esc(r.facts))}
        ${sec('✍️ 읽은 글', r.html)}
      </div>
    </div>
    <div class="row">
      <button class="btn blue" data-act="speak">🔊 다시 듣기</button>
      <button class="btn" data-act="stop-speak">⏹ 그만</button>
    </div>
    ${p ? `<a class="btn full ${r.scam ? 'red' : ''}" href="${telHref(p.phone)}">📞 ${esc(p.name)}에게 물어보기</a>` : ''}
    <button class="btn purple full" data-act="read-camera">📷 다른 글 읽기</button>
  </div>`;
}

// 손가락으로 밀어서 확대한 화면 옮기기
let drag = null;
document.addEventListener('pointerdown', (e) => {
  if (route !== 'read' || !e.target.closest('#mag') || cam.css <= 1) return;
  drag = { x: e.clientX, y: e.clientY, px: cam.panX, py: cam.panY, w: $('#mag').clientWidth, h: $('#mag').clientHeight };
});
document.addEventListener('pointermove', (e) => {
  if (!drag) return;
  cam.panX = drag.px + ((e.clientX - drag.x) / drag.w) * (100 / cam.css);
  cam.panY = drag.py + ((e.clientY - drag.y) / drag.h) * (100 / cam.css);
  applyView();
});
document.addEventListener('pointerup', () => { drag = null; });
document.addEventListener('pointercancel', () => { drag = null; });

/* ---------- 2. 가족에게 연락 (위치 자동 전송) ---------- */
const sos = { phase: 'idle', n: 3, timer: null, hadFix: false, fallbackText: '' }; // idle | count | sending | sent | fallback

function viewCall() {
  if (!state.contacts.length) return `${topbar('📍 가족에게 연락')}${needSetup('가족 연락처가 아직 없어요')}`;
  const p = primary();
  let panel;
  if (sos.phase === 'count') {
    panel = `<div class="card count-card"><p class="count-num" id="count-num">${sos.n}</p>
      <h2>초 뒤에 가족에게 내 위치를 보내요</h2></div>
      <button class="btn huge full" data-act="sos-cancel">✋ 보내지 않기</button>`;
  } else if (sos.phase === 'sending') {
    panel = `<div class="card loading">가족에게 보내고 있어요<span class="dots"></span></div>`;
  } else if (sos.phase === 'sent') {
    panel = `<div class="card ok-card"><p class="big-emoji">✅</p><h2>가족에게 ${sos.hadFix ? '내 위치를' : '연락 부탁을'} 보냈어요</h2>
      <p class="muted" style="margin-top:6px">${sos.hadFix ? '가족 폰에 알림이 갔어요.' : '위치는 찾지 못했지만 알림은 갔어요. 폰 설정에서 위치를 켜 두면 다음엔 위치도 가요.'}</p></div>
      ${callButtons()}`;
  } else if (sos.phase === 'fallback') {
    panel = `<div class="card warn"><h2>문자 앱으로 보낼게요</h2><p class="muted" style="margin-top:6px">${state.topic ? '알림을 못 보냈어요.' : '알림 연결이 아직 안 돼 있어요.'} 문자 앱이 열리면 <b>보내기</b>를 눌러 주세요.</p></div>
      <a class="btn green huge full" href="${smsHref(p.phone, sos.fallbackText)}">💬 ${esc(p.name)}에게 문자 보내기</a>
      ${callButtons()}`;
  } else {
    panel = `<button class="btn orange huge full" data-act="sos-start">📍 가족에게 내 위치 보내기</button>
      ${callButtons()}`;
  }
  return `${topbar('📍 가족에게 연락')}<div class="stack">${panel}</div>`;
}

function startCountdown() {
  clearInterval(sos.timer);
  Object.assign(sos, { phase: 'count', n: 3 });
  render();
  sos.timer = setInterval(() => {
    sos.n -= 1;
    if (sos.n > 0) { const el = $('#count-num'); if (el) el.textContent = sos.n; return; }
    clearInterval(sos.timer);
    sendLocation();
  }, 1000);
}

async function sendLocation() {
  sos.phase = 'sending';
  render();
  const coords = await getPosition();
  sos.hadFix = !!coords;
  const when = niceTime(Date.now());
  const url = coords ? mapUrl(coords) : '';
  const message = coords
    ? `${whoAmI()}의 지금 위치예요. 알림을 누르면 지도가 열려요. (${when}, 오차 약 ${Math.round(coords.accuracy)}m)`
    : `${whoAmI()}가 연락을 부탁했어요. 위치는 찾지 못했어요. (${when})`;
  sos.fallbackText = `[든든 도우미] ${whoAmI()}예요. ${coords ? `지금 여기 있어요.\n${url}` : '연락 부탁해요.'}\n(${when})`;
  try {
    await notifyFamily({ title: `📍 ${whoAmI()}가 연락을 원해요`, message, click: url || undefined, priority: 5, tags: ['rotating_light'] });
    sos.phase = 'sent';
    if (route === 'call') render();
  } catch (e) {
    sos.phase = 'fallback';
    if (route !== 'call') return;
    render();
    location.href = smsHref(primary().phone, sos.fallbackText);
  }
}

/* ---------- 3. 응급 정보 ---------- */
const EMG_FIELDS = [
  ['name', '이름'], ['birth', '생년월일'], ['blood', '혈액형'], ['disease', '앓고 있는 병'],
  ['meds', '먹는 약'], ['allergy', '알레르기'], ['hospital', '다니는 병원'], ['note', '그 밖에 알릴 것'],
];

function viewEmergency() {
  const e = state.emergency;
  const filled = EMG_FIELDS.filter(([k]) => (e[k] || '').trim());
  const guardians = state.contacts.slice(0, 3);
  return `<div class="topbar"><button class="back" data-act="go" data-to="home">← 처음으로</button></div>
    <div class="stack">
      <div class="emg-head"><h1>🚑 응급 정보</h1><p>EMERGENCY · 구급대원·의료진께 보여 주세요</p></div>
      <a class="btn red huge full" href="tel:119">📞 119 부르기</a>
      ${filled.length ? `<div class="card danger"><div class="emg-list">${filled.map(([k, label]) => `<div class="emg-item"><b>${label}</b><span>${esc(e[k])}</span></div>`).join('')}</div></div>`
        : `<div class="card warn"><h2>응급 정보가 비어 있어요</h2><p class="muted" style="margin-top:6px">가족이 설정에서 지병, 먹는 약, 알레르기를 넣어 주세요.</p></div>`}
      ${guardians.length ? `<div class="card"><h2>보호자 연락처</h2>
        ${guardians.map((c) => `<a class="btn blue full" style="margin-top:10px" href="${telHref(c.phone)}">📞 ${esc(c.name)} · ${esc(c.phone)}</a>`).join('')}</div>` : ''}
      <div class="row">
        <button class="btn" data-act="print">🖨️ 지갑 카드 인쇄</button>
        <button class="btn" data-act="go" data-to="settings" data-sec="emg">✏️ 고치기</button>
      </div>
      <details class="card sum"><summary>📱 잠금 화면에서도 보이게 하려면</summary>
        <p class="muted" style="margin-top:8px"><b>갤럭시</b>: 설정 → 안전 및 긴급 → 의료 정보<br><b>아이폰</b>: 건강 앱 → 오른쪽 위 프로필 → 의료 ID<br>이 화면의 내용을 그대로 옮겨 적으면, 폰이 잠겨 있어도 구급대원이 볼 수 있어요.</p>
      </details>
    </div>
    <div class="print-card">
      <h3>🚑 응급 정보 EMERGENCY</h3>
      ${filled.map(([k, label]) => `<div><b>${label}</b> ${esc(e[k])}</div>`).join('')}
      ${guardians.map((c) => `<div><b>보호자</b> ${esc(c.name)} ${esc(c.phone)}</div>`).join('')}
    </div>`;
}

/* ---------- 4. 안부 보내기 (한 번 누르면 바로 감) ---------- */
const MOODS = {
  good: { face: '😊', label: '잘 있어요', text: '오늘도 잘 지내고 있어요 😊', priority: 3 },
  soso: { face: '😐', label: '그저 그래요', text: '오늘은 그저 그래요 😐 그래도 괜찮아요.', priority: 3 },
  sick: { face: '😣', label: '좀 아파요', text: '오늘은 몸이 좀 안 좋아요 😣 전화 한 번 주세요.', priority: 4 },
};
const hello = { phase: 'pick', mood: 'good' }; // pick | sending | sent | fallback

function viewHello() {
  if (!state.contacts.length) return `${topbar('💚 안부 보내기')}${needSetup('가족 연락처가 아직 없어요')}`;
  const m = MOODS[hello.mood];
  const p = primary();
  const log = [...state.helloLog].reverse().slice(0, 5);
  let body;
  if (hello.phase === 'sending') body = `<div class="card loading">보내고 있어요<span class="dots"></span></div>`;
  else if (hello.phase === 'sent') {
    body = `<div class="card ok-card"><p class="big-emoji">${m.face}</p><h2>가족에게 안부를 보냈어요</h2><p class="muted" style="margin-top:6px">"${esc(m.text)}"</p></div>
      ${hello.mood === 'sick' ? callButtons() : ''}
      <button class="btn huge full" data-act="go" data-to="home">처음으로</button>`;
  } else if (hello.phase === 'fallback') {
    body = `<div class="card warn"><h2>문자 앱으로 보낼게요</h2><p class="muted" style="margin-top:6px">문자 앱이 열리면 <b>보내기</b>를 눌러 주세요.</p></div>
      <a class="btn green huge full" href="${smsHref(p.phone, helloText())}">💬 ${esc(p.name)}에게 문자 보내기</a>`;
  } else {
    body = `<h2>누르면 가족에게 바로 가요</h2>
      <div class="mood-list">${Object.entries(MOODS).map(([k, x]) => `<button class="mood-btn m-${k}" data-act="hello-send" data-m="${k}"><span>${x.face}</span>${x.label}</button>`).join('')}</div>`;
  }
  return `${topbar('💚 안부 보내기')}
    <div class="stack">${body}
      ${log.length && hello.phase === 'pick' ? `<div class="card"><h2>최근에 보낸 안부</h2><ul class="history">${log.map((h) => `<li>${MOODS[h.mood]?.face || '💚'} ${niceTime(h.at)}</li>`).join('')}</ul></div>` : ''}
    </div>`;
}
const helloText = () => `[든든 도우미] ${whoAmI()}예요. ${MOODS[hello.mood].text}`;

async function sendHello(mood) {
  hello.mood = mood;
  hello.phase = 'sending';
  render();
  const m = MOODS[mood];
  state.helloLog.push({ at: Date.now(), day: todayKey(), mood });
  state.helloLog = state.helloLog.slice(-60);
  save();
  try {
    await notifyFamily({ title: `💚 ${whoAmI()}의 안부`, message: m.text, priority: m.priority, tags: [mood === 'sick' ? 'face_with_thermometer' : 'green_heart'] });
    hello.phase = 'sent';
    if (route === 'hello') render();
  } catch (e) {
    hello.phase = 'fallback';
    if (route !== 'hello') return;
    render();
    location.href = smsHref(primary().phone, helloText());
  }
}

/* ---------- 설정 (가족용) ---------- */
let editId = null;

function viewSettings() {
  const e = state.emergency;
  const editing = state.contacts.find((c) => c.id === editId);
  return `${topbar('⚙️ 설정')}
    <div class="stack">
      <p class="muted">가족이 한 번만 설정해 주세요. 내용은 <b>이 폰에만</b> 저장돼요.</p>

      <div class="card">
        <h2>👤 가족이 알아볼 이름</h2>
        <label class="field"><span>예: 엄마, 아버지, 김순자</span><input data-bind="me" value="${esc(state.me)}" placeholder="엄마"></label>
        <p class="hint">알림에 "📍 엄마가 연락을 원해요"처럼 나와요.</p>
      </div>

      <div class="card" id="sec-contacts">
        <h2>👨‍👩‍👧 가족 연락처</h2>
        ${state.contacts.length ? state.contacts.map((c) => `<div class="person" style="margin-top:12px">
          <span class="face">${c.face || '🧑'}</span>
          <div style="flex:1;min-width:0"><div class="name">${esc(c.name)} ${c.id === primary()?.id ? '<span class="muted">⭐ 기본</span>' : ''}</div><div class="num">${esc(c.phone)}</div></div>
          <button class="chip" data-act="edit-contact" data-id="${c.id}">고치기</button>
        </div>`).join('') : '<p class="muted" style="margin-top:6px">전화 버튼과 응급 보호자에 쓰여요.</p>'}
        <form data-form="contact" style="margin-top:14px">
          <p style="font-weight:700">${editing ? '연락처 고치기' : '새 연락처 넣기'}</p>
          <div class="contact-edit">
            <select name="face" aria-label="얼굴">${FACES.map((f) => `<option ${editing?.face === f ? 'selected' : ''}>${f}</option>`).join('')}</select>
            <input name="name" placeholder="이름 (예: 큰딸)" value="${esc(editing?.name || '')}" autocomplete="off">
            <input name="phone" type="tel" class="wide" placeholder="전화번호 (예: 010-1234-5678)" value="${esc(editing?.phone || '')}" autocomplete="off">
          </div>
          <div class="row" style="margin-top:10px">
            <button class="btn green">${editing ? '고친 내용 저장' : '넣기'}</button>
            ${editing ? `<button type="button" class="btn" data-act="primary" data-id="${editing.id}">⭐ 기본으로</button>
              <button type="button" class="btn" data-act="del-contact" data-id="${editing.id}" style="color:var(--red)">지우기</button>
              <button type="button" class="btn" data-act="cancel-edit">취소</button>` : ''}
          </div>
          <p class="hint">알림이 안 될 때는 ⭐ 기본 연락처에게 문자가 가요. 맨 위 세 명은 응급 화면에 보호자로 나와요.</p>
        </form>
      </div>

      <div class="card" id="sec-notify">
        <h2>🔔 가족 폰으로 알림 받기 (무료)</h2>
        ${state.topic ? `
          <p style="margin-top:8px;font-weight:700">가족 폰 카메라로 이 QR을 찍으세요</p>
          <div class="qr">${qrSvg(connectUrl())}</div>
          <p class="muted" style="text-align:center">안내 페이지가 열리면 따라 하기만 하면 돼요.</p>
          <p class="muted" style="margin-top:10px">연결 코드</p>
          <p class="topic-code">${esc(state.topic)}</p>
          <div class="stack" style="margin-top:12px">
            <button class="btn full" data-act="share-topic">📤 멀리 사는 가족에게 링크 보내기</button>
            <button class="btn blue full" data-act="test-notify">🔔 시험 알림 보내기</button>
            <button class="btn full" data-act="ask-location">📍 위치 사용 미리 허락하기</button>
          </div>
          <p class="hint">알림을 받을 가족은 모두 같은 코드로 구독하면 돼요. 코드를 아는 사람만 알림을 볼 수 있으니 남에게 알려 주지 마세요.</p>
          <button class="chip" style="margin-top:10px" data-act="reset-topic">코드 새로 만들기</button>`
        : `<p class="muted" style="margin-top:6px">연결하면 "가족에게 연락"과 "안부"를 누르는 순간 가족 폰에 알림이 바로 가요. 문자 앱을 거치지 않아요.</p>
          <button class="btn green full" style="margin-top:12px" data-act="make-topic">🔗 알림 연결 만들기</button>`}
      </div>

      <div class="card" id="sec-install">
        <h2>📲 앱처럼 설치하기</h2>
        ${installView()}
      </div>

      <div class="card">
        <h2>🔠 글자 크기</h2>
        <div class="size-pick" style="margin-top:10px">${[1, 2, 3].map((n) => `<button class="chip ${state.size === n ? 'on' : ''}" data-act="size" data-n="${n}">${['크게', '더 크게', '아주 크게'][n - 1]}</button>`).join('')}</div>
      </div>

      <div class="card" id="sec-emg">
        <h2>🚑 응급 정보</h2>
        ${EMG_FIELDS.map(([k, label]) => `<label class="field"><span>${label}</span>${['disease', 'meds', 'note'].includes(k)
          ? `<textarea data-bind="emergency.${k}" style="min-height:90px" placeholder="${k === 'meds' ? '예: 혈압약(아침), 당뇨약(저녁)' : ''}">${esc(e[k])}</textarea>`
          : `<input data-bind="emergency.${k}" value="${esc(e[k])}" placeholder="${{ birth: '예: 1950년 3월 5일', blood: '예: A형 Rh+', allergy: '예: 페니실린, 땅콩', hospital: '예: ○○내과 02-123-4567' }[k] || ''}">`}</label>`).join('')}
      </div>

      <div class="card">
        <h2>💾 백업</h2>
        <p class="muted" style="margin-top:6px">폰을 바꾸기 전에 내보내 두고, 새 폰에서 가져오세요.</p>
        <div class="row" style="margin-top:12px">
          <button class="btn" data-act="export">⬇️ 내보내기</button>
          <label class="btn">⬆️ 가져오기<input type="file" accept="application/json,.json" data-act="import" hidden></label>
        </div>
      </div>
    </div>`;
}

// 가족이 QR을 찍거나 링크를 누르면 열리는 안내 페이지 주소
const connectUrl = () => {
  const u = new URL('connect.html', location.href);
  u.search = new URLSearchParams({ t: state.topic, n: whoAmI() }).toString();
  return u.toString();
};
function qrSvg(text) {
  const qr = qrcode(0, 'M');
  qr.addData(text);
  qr.make();
  return qr.createSvgTag({ cellSize: 6, margin: 3, scalable: true, alt: '알림 연결 QR코드' });
}
const topicGuide = () => `[든든 도우미] ${whoAmI()}의 연락과 안부를 폰 알림으로 받는 방법이에요. (무료)\n아래 링크를 눌러 따라 해 주세요.\n${connectUrl()}`;

/* ---------- 앱 설치 (PWA) ---------- */
let installPrompt = null;
window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); installPrompt = e; if (route === 'settings') render(); });
window.addEventListener('appinstalled', () => { installPrompt = null; toast('📲 홈 화면에 설치됐어요'); if (route === 'settings') render(); });
const isStandalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;

function installView() {
  if (isStandalone()) return `<p class="muted" style="margin-top:6px">✅ 앱으로 설치돼 있어요.</p>`;
  if (installPrompt) return `<p class="muted" style="margin-top:6px">홈 화면에 💚 아이콘이 생기고, 앱처럼 열려요. 인터넷이 약해도 열려요.</p>
    <button class="btn green huge full" style="margin-top:12px" data-act="install">📲 홈 화면에 설치</button>`;
  if (isIOS) return `<p class="muted" style="margin-top:6px">사파리에서 아래처럼 해 주세요.</p>
    <ol class="steps-ko"><li>화면 아래 <b>공유 버튼</b>(네모에 위 화살표)을 눌러요.</li><li><b>홈 화면에 추가</b>를 눌러요.</li><li>오른쪽 위 <b>추가</b>를 눌러요.</li></ol>`;
  return `<p class="muted" style="margin-top:6px">크롬 오른쪽 위 <b>⋮ 메뉴</b> → <b>앱 설치</b> 또는 <b>홈 화면에 추가</b>를 눌러 주세요.</p>`;
}

/* ---------- 라우팅 ---------- */
const VIEWS = { home: viewHome, read: viewRead, call: viewCall, emergency: viewEmergency, hello: viewHello, settings: viewSettings };
let route = VIEWS[location.hash.slice(1)] ? location.hash.slice(1) : 'home';

function render() {
  document.documentElement.dataset.size = state.size;
  $('#app').innerHTML = VIEWS[route]();
  if (route === 'read' && read.status === 'camera') {
    if (cam.stream) { $('#cam').srcObject = cam.stream; $('#cam').play().catch(() => {}); syncCamUI(); }
    else startCamera();
  }
}

// 화면 이동은 주소(#) 기록으로 남겨서, 폰의 '뒤로' 버튼을 누르면 앱 안에서 이전 화면으로 돌아가게 함
let pending = { sec: '', fresh: false };
function go(to, sec, fresh) {
  pending = { sec: sec || '', fresh: !!fresh };
  const hash = to === 'home' ? '' : '#' + to;
  if (location.hash === hash || (!hash && !location.hash)) applyRoute();
  else location.hash = hash;
}

function applyRoute() {
  const to = VIEWS[location.hash.slice(1)] ? location.hash.slice(1) : 'home';
  const { sec, fresh } = pending;
  pending = { sec: '', fresh: false };
  if (route === 'read' && to !== 'read') stopCamera();
  if (to !== route) stopSpeak();
  if (route === 'call' && to !== 'call') { clearInterval(sos.timer); sos.phase = 'idle'; }
  if (to === 'read' && to !== route) Object.assign(read, { status: 'camera', result: null, error: '' });
  if (to === 'hello' && to !== route) hello.phase = 'pick';
  if (to === 'settings') editId = null;
  route = to;
  // 홈의 버튼으로 들어왔을 때만 카운트다운 후 자동 전송 (뒤로가기·새로고침으로는 보내지 않음)
  if (to === 'call' && fresh && state.contacts.length) { window.scrollTo(0, 0); startCountdown(); return; }
  render();
  if (sec) $('#sec-' + sec)?.scrollIntoView({ block: 'start' });
  else window.scrollTo(0, 0);
}
window.addEventListener('hashchange', applyRoute);

/* ---------- 이벤트 ---------- */
document.addEventListener('click', async (ev) => {
  const el = ev.target.closest('[data-act]');
  if (!el || el.matches('input, select')) return;
  const id = el.dataset.id;
  switch (el.dataset.act) {
    case 'go': return go(el.dataset.to, el.dataset.sec, el.dataset.fresh);
    case 'zoom': {
      const step = cam.hw ? Math.max(0.5, (cam.hw.max - cam.hw.min) / 8) : 0.5;
      return setZoom((cam.hw ? cam.hwVal : cam.css) + step * Number(el.dataset.d));
    }
    case 'torch':
      if (!cam.track) return;
      cam.torch = !cam.torch;
      cam.track.applyConstraints({ advanced: [{ torch: cam.torch }] }).catch(() => { cam.torch = false; toast('불을 켤 수 없어요'); syncCamUI(); });
      return syncCamUI();
    case 'read-run': return runRead();
    case 'read-camera': stopSpeak(); Object.assign(read, { status: 'camera', result: null, error: '' }); return render();
    case 'read-paste': stopCamera(); Object.assign(read, { status: 'paste', error: '' }); return render();
    case 'paste-run': {
      const t = ($('#paste-text')?.value || '').trim();
      if (!t) { toast('문자 내용을 먼저 붙여 넣어 주세요'); return; }
      Object.assign(read, { status: 'done', text: t, result: explain(t) });
      render();
      return speak(read.result.speech);
    }
    case 'speak': if (read.result) speak(read.result.speech); return;
    case 'stop-speak': return stopSpeak();
    case 'sos-start': return startCountdown();
    case 'sos-cancel': clearInterval(sos.timer); sos.phase = 'idle'; toast('보내지 않았어요'); return render();
    case 'hello-send': return sendHello(el.dataset.m);
    case 'print': return window.print();
    case 'size': state.size = Number(el.dataset.n); save(); return render();
    case 'edit-contact': editId = id; render(); $('#sec-contacts')?.scrollIntoView({ block: 'start' }); return;
    case 'cancel-edit': editId = null; return render();
    case 'primary': state.primaryId = id; save(); toast('⭐ 기본 연락처로 정했어요'); return render();
    case 'del-contact':
      if (!confirm('이 연락처를 지울까요?')) return;
      state.contacts = state.contacts.filter((c) => c.id !== id);
      if (state.primaryId === id) state.primaryId = '';
      editId = null; save(); return render();
    case 'make-topic': state.topic = newTopic(); save(); render(); $('#sec-notify')?.scrollIntoView({ block: 'start' }); return;
    case 'reset-topic':
      if (!confirm('코드를 새로 만들면 가족이 다시 구독해야 해요. 새로 만들까요?')) return;
      state.topic = newTopic(); save(); return render();
    case 'share-topic':
      if (navigator.share) { navigator.share({ text: topicGuide() }).catch(() => {}); return; }
      try { await navigator.clipboard.writeText(topicGuide()); toast('📋 복사했어요. 카톡에 붙여 넣어 보내 주세요'); } catch (e) { toast('코드를 직접 적어 보내 주세요'); }
      return;
    case 'test-notify':
      try { await notifyFamily({ title: '🔔 든든 도우미 시험 알림', message: `${whoAmI()}의 폰과 연결됐어요. 이제 연락과 안부가 이렇게 와요.`, priority: 3, tags: ['bell'] }); toast('🔔 보냈어요. 가족 폰에 알림이 왔는지 확인해 주세요'); }
      catch (e) { toast('보내지 못했어요. 인터넷 연결을 확인해 주세요'); }
      return;
    case 'ask-location': {
      const c = await getPosition(15000);
      toast(c ? '📍 위치 사용이 허락됐어요' : '위치를 쓸 수 없어요. 폰 설정에서 위치를 켜고 브라우저에 허용해 주세요');
      return;
    }
    case 'install':
      if (!installPrompt) return;
      installPrompt.prompt();
      await installPrompt.userChoice.catch(() => {});
      installPrompt = null;
      return render();
    case 'export': return exportData();
    default:
  }
});

document.addEventListener('input', (ev) => {
  const el = ev.target;
  if (el.id === 'zoom') return setZoom(Number(el.value));
  if (el.id === 'paste-text') { read.text = el.value; return; }
  if (el.dataset.bind) {
    const [a, b] = el.dataset.bind.split('.');
    if (b) state[a][b] = el.value; else state[a] = el.value;
    save();
  }
});

document.addEventListener('change', (ev) => {
  if (ev.target.dataset.act === 'import') importData(ev.target.files[0]);
});

document.addEventListener('submit', (ev) => {
  const f = ev.target;
  if (f.dataset.form !== 'contact') return;
  ev.preventDefault();
  const name = f.elements.name.value.trim();
  const phone = f.elements.phone.value.trim();
  if (!name || cleanPhone(phone).length < 3) { toast('이름과 전화번호를 넣어 주세요'); return; }
  const face = f.elements.face.value;
  const c = state.contacts.find((x) => x.id === editId);
  if (c) Object.assign(c, { name, phone, face });
  else state.contacts.push({ id: uid(), name, phone, face });
  editId = null;
  save();
  toast('✅ 저장했어요');
  render();
  $('#sec-contacts')?.scrollIntoView({ block: 'start' });
});

/* ---------- 백업 ---------- */
function exportData() {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' }));
  a.download = `든든도우미-백업-${todayKey()}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

function importData(file) {
  if (!file) return;
  const r = new FileReader();
  r.onload = () => {
    try {
      const d = JSON.parse(r.result);
      if (!d || !Array.isArray(d.contacts)) throw new Error('bad');
      if (!confirm('지금 내용을 백업 파일로 바꿀까요?')) return;
      state = hydrate(d);
      save();
      render();
      toast('⬆️ 가져왔어요');
    } catch (e) { toast('이 파일은 읽을 수 없어요'); }
  };
  r.readAsText(file);
}

// 다른 앱(문자·전화)에 다녀오면 카메라가 멈춰 있을 수 있어 다시 켬
document.addEventListener('visibilitychange', () => {
  if (document.hidden) { if (route === 'read') stopCamera(); }
  else if (route === 'read' && read.status === 'camera' && !cam.stream) render();
});

render();

// 오프라인에서도 열리도록 (https에서만 동작)
if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
