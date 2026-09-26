/* 든든 도우미 — 서버 없이 폰 브라우저에서 돌아가는 어르신용 도구 모음 */

const KEY = 'easy-helper-v1';
const SDK_URL = 'https://cdn.jsdelivr.net/npm/@anthropic-ai/sdk@0.128.0/+esm';
const MODEL = 'claude-opus-5';

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

/* ---------- 저장 ---------- */
const defaultState = () => ({
  v: 1,
  me: '',
  size: 1,
  contacts: [],
  primaryId: '',
  emergency: { name: '', birth: '', blood: '', disease: '', meds: '', allergy: '', hospital: '', note: '' },
  helloToId: '',
  helloLog: [],
  apiKey: '',
});

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const d = JSON.parse(raw);
      const base = defaultState();
      return { ...base, ...d, emergency: { ...base.emergency, ...(d.emergency || {}) } };
    }
  } catch (e) { /* 저장소를 못 쓰는 환경 */ }
  return defaultState();
}
let state = load();
function save() {
  try { localStorage.setItem(KEY, JSON.stringify(state)); }
  catch (e) { toast('저장이 안 돼요. 브라우저 설정을 확인해 주세요.'); }
}

const primary = () => state.contacts.find((c) => c.id === state.primaryId) || state.contacts[0];
const helloTo = () => state.contacts.find((c) => c.id === state.helloToId) || primary();
const whoAmI = () => state.me.trim() || '저';

let toastTimer;
function toast(msg) {
  const el = $('#toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2600);
}

function speak(text) {
  if (!('speechSynthesis' in window)) { toast('이 폰은 읽어주기를 지원하지 않아요'); return; }
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = 'ko-KR';
  u.rate = 0.9;
  speechSynthesis.speak(u);
}
const stopSpeak = () => { if ('speechSynthesis' in window) speechSynthesis.cancel(); };

/* ---------- 화면 공통 ---------- */
const topbar = (title) => `<div class="topbar"><button class="back" data-act="go" data-to="home">← 처음으로</button><h1>${title}</h1></div>`;
const needContact = () => `<div class="card warn"><h2>가족 연락처가 아직 없어요</h2>
  <p class="muted" style="margin-top:6px">가족이 설정에서 연락처를 먼저 넣어 주세요.</p>
  <button class="btn full" style="margin-top:12px" data-act="go" data-to="settings">⚙️ 설정하러 가기</button></div>`;

/* ---------- 홈 ---------- */
function viewHome() {
  const d = new Date();
  const sentToday = state.helloLog.some((h) => h.day === todayKey());
  return `<div class="hello">
      <h1>안녕하세요 👋</h1>
      <p>${d.getMonth() + 1}월 ${d.getDate()}일 ${DAYS[d.getDay()]}요일</p>
    </div>
    ${state.contacts.length ? '' : `<div class="card warn" style="margin-bottom:14px"><h2>처음 쓰시나요?</h2><p class="muted" style="margin-top:6px">가족이 맨 아래 <b>설정</b>에서 연락처와 응급 정보를 먼저 넣어 주세요.</p></div>`}
    <div class="home-grid">
      <button class="big-btn b-blue" data-act="go" data-to="magnify"><span class="ico">🔍</span><span>크게 보기<small>작은 글씨를 카메라로 크게</small></span></button>
      <button class="big-btn b-purple" data-act="go" data-to="easy"><span class="ico">📄</span><span>쉬운 말로 풀기<small>어려운 안내문·문자를 쉽게</small></span></button>
      <button class="big-btn b-orange" data-act="go" data-to="call"><span class="ico">📍</span><span>가족에게 연락<small>내 위치 보내고 전화하기</small></span></button>
      <button class="big-btn b-red" data-act="go" data-to="emergency"><span class="ico">🚑</span><span>응급 정보<small>아플 때 이 화면을 보여주세요</small></span></button>
      <button class="big-btn b-green" data-act="go" data-to="hello"><span class="ico">💚</span><span>안부 보내기<small class="done-mark">${sentToday ? '✓ 오늘 안부를 보냈어요' : '오늘도 잘 있다고 알려요'}</small></span></button>
    </div>
    <button class="settings-link" data-act="go" data-to="settings">⚙️ 설정 (가족용)</button>`;
}

/* ---------- 1. 크게 보기 (돋보기) ---------- */
const cam = { stream: null, track: null, hw: null, hwVal: 1, css: 1, panX: 0, panY: 0, filter: 'none', torch: false, hasTorch: false, frozen: false, error: '' };
const FILTERS = {
  none: { label: '보통', css: 'none' },
  contrast: { label: '또렷하게', css: 'grayscale(1) contrast(1.8) brightness(1.05)' },
  invert: { label: '검은 바탕', css: 'grayscale(1) invert(1) contrast(1.6)' },
};

function viewMagnify() {
  return `${topbar('🔍 크게 보기')}
    <div class="stack">
      <div class="magnifier" id="mag">
        <video id="cam" playsinline muted autoplay></video>
        <canvas id="still" hidden></canvas>
        <span class="badge" id="zoom-badge">1배</span>
      </div>
      <p class="muted" id="cam-msg">${cam.error ? esc(cam.error) : '글씨에 폰을 가까이 대 보세요. 화면을 손가락으로 밀면 옆으로 움직여요.'}</p>
      <div class="zoom-row">
        <button class="btn" data-act="zoom" data-d="-1" aria-label="작게">－</button>
        <input type="range" id="zoom" min="1" max="5" step="0.1" value="1" aria-label="확대">
        <button class="btn" data-act="zoom" data-d="1" aria-label="크게">＋</button>
      </div>
      <div class="row">
        <button class="btn blue" data-act="freeze" id="freeze-btn">⏸ 멈춰서 보기</button>
        <button class="btn" data-act="torch" id="torch-btn" hidden>🔦 불 켜기</button>
      </div>
      <div class="filters">${Object.entries(FILTERS).map(([k, f]) => `<button class="chip ${cam.filter === k ? 'on' : ''}" data-act="filter" data-f="${k}">${f.label}</button>`).join('')}</div>
      <button class="btn purple full" data-act="still-to-easy" id="to-easy" hidden>📄 이 글을 쉬운 말로 풀기</button>
    </div>`;
}

async function startCamera() {
  cam.error = '';
  const video = $('#cam');
  if (!navigator.mediaDevices?.getUserMedia) { camError('이 브라우저에서는 카메라를 쓸 수 없어요. 크롬이나 사파리로 열어 주세요.'); return; }
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: false });
    if (route !== 'magnify') { stream.getTracks().forEach((t) => t.stop()); return; }
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
  Object.assign(cam, { stream: null, track: null, hw: null, css: 1, panX: 0, panY: 0, torch: false, hasTorch: false, frozen: false });
}

// 지금 화면에서 확대 슬라이더가 움직이는 대상: 카메라 자체 줌(가능할 때) 또는 화면 확대
const usingHw = () => cam.hw && !cam.frozen;

function syncCamUI() {
  const slider = $('#zoom');
  if (!slider) return;
  if (usingHw()) {
    Object.assign(slider, { min: cam.hw.min, max: cam.hw.max, step: cam.hw.step });
    slider.value = cam.hwVal;
  } else {
    Object.assign(slider, { min: 1, max: 5, step: 0.1 });
    slider.value = cam.css;
  }
  applyView();
  $('#torch-btn').hidden = !cam.hasTorch || cam.frozen;
  $('#torch-btn').textContent = cam.torch ? '🔦 불 끄기' : '🔦 불 켜기';
  $('#freeze-btn').textContent = cam.frozen ? '▶ 다시 비추기' : '⏸ 멈춰서 보기';
  $('#to-easy').hidden = !cam.frozen;
  $('#cam').hidden = cam.frozen;
  $('#still').hidden = !cam.frozen;
}

function applyView() {
  const el = cam.frozen ? $('#still') : $('#cam');
  if (!el) return;
  const s = cam.css;
  const lim = ((s - 1) / (2 * s)) * 100; // 확대한 만큼만 옆으로 밀 수 있게
  cam.panX = Math.max(-lim, Math.min(lim, cam.panX));
  cam.panY = Math.max(-lim, Math.min(lim, cam.panY));
  el.style.transform = `scale(${s}) translate(${cam.panX}%, ${cam.panY}%)`;
  el.style.filter = FILTERS[cam.filter].css;
  const total = (usingHw() || cam.frozen ? cam.hwVal : 1) * s;
  const badge = $('#zoom-badge');
  if (badge) badge.textContent = `${Math.round(total * 10) / 10}배`;
}

function setZoom(v) {
  if (usingHw()) {
    cam.hwVal = Math.max(cam.hw.min, Math.min(cam.hw.max, v));
    cam.track.applyConstraints({ advanced: [{ zoom: cam.hwVal }] }).catch(() => { cam.hw = null; cam.hwVal = 1; syncCamUI(); });
  } else {
    cam.css = Math.max(1, Math.min(5, v));
  }
  const slider = $('#zoom');
  if (slider) slider.value = usingHw() ? cam.hwVal : cam.css;
  applyView();
}

function toggleFreeze() {
  const video = $('#cam');
  if (!cam.frozen) {
    if (!video.videoWidth) { toast('카메라가 아직 켜지지 않았어요'); return; }
    const c = $('#still');
    c.width = video.videoWidth;
    c.height = video.videoHeight;
    c.getContext('2d').drawImage(video, 0, 0);
    cam.frozen = true;
  } else {
    cam.frozen = false;
  }
  syncCamUI();
}

// 멈춘 화면을 AI에 보낼 크기로 줄이기
function stillToDataUrl() {
  const c = $('#still');
  return downscale(c, c.width, c.height);
}

function downscale(src, w, h, max = 1600) {
  const k = Math.min(1, max / Math.max(w, h));
  const out = document.createElement('canvas');
  out.width = Math.round(w * k);
  out.height = Math.round(h * k);
  out.getContext('2d').drawImage(src, 0, 0, out.width, out.height);
  return out.toDataURL('image/jpeg', 0.85);
}

// 손가락으로 밀어서 확대한 화면 옮기기
let drag = null;
document.addEventListener('pointerdown', (e) => {
  if (route !== 'magnify' || !e.target.closest('#mag') || cam.css <= 1) return;
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

/* ---------- 2. 쉬운 말로 풀기 ---------- */
const easy = { mode: 'photo', image: '', text: '', status: 'idle', result: null, error: '' };

// 관공서·병원·은행 안내문에 자주 나오는 말
const WORDS = {
  '납부기한': '돈 내는 마감 날짜', '납기': '돈 내는 날', '납기일': '돈 내는 날', '납부': '돈을 냄', '가산금': '늦게 내서 더 붙는 돈', '가산세': '늦게 내서 더 붙는 세금',
  '연체료': '늦게 내서 더 붙는 돈', '연체': '내야 할 날을 넘김', '체납': '내야 할 돈을 안 냄', '미납': '아직 안 냄', '독촉': '빨리 내라고 재촉함', '압류': '재산을 못 쓰게 묶음',
  '고지서': '돈 내라는 안내 종이', '고지': '알림', '청구': '돈 달라고 요구함', '청구서': '돈 내라는 종이', '과태료': '규칙을 어겨서 내는 돈', '범칙금': '교통 규칙을 어겨서 내는 돈',
  '환급': '낸 돈을 돌려받음', '공제': '빼 줌', '원천징수': '미리 떼어 간 세금', '면제': '안 내도 됨', '감면': '깎아 줌', '경감': '줄여 줌', '부과': '내라고 매김',
  '이의신청': '결정이 틀렸다고 다시 봐 달라는 신청', '기한': '마감 날짜', '기한 내': '마감 날짜 안에', '도래': '다가옴', '경과': '지남', '익일': '다음 날', '금일': '오늘', '명일': '내일', '익월': '다음 달', '당월': '이번 달', '전월': '지난달',
  '상기': '위에 적은', '하기': '아래에 적은', '기재': '적음', '기입': '적어 넣음', '첨부': '같이 붙임', '제출': '내기', '지참': '가지고 옴', '구비서류': '챙겨야 할 서류', '구비': '갖춤',
  '수령': '받음', '수취인': '받는 사람', '발신인': '보낸 사람', '교부': '내어 줌', '발급': '만들어 줌', '재발급': '다시 만들어 줌', '송달': '보내서 전달함', '반송': '되돌려 보냄',
  '본인부담금': '내가 내야 하는 돈', '본인부담': '내가 냄', '비급여': '건강보험이 안 되는 것', '급여': '건강보험이 되는 것', '실손보험': '실제 쓴 병원비를 돌려주는 보험',
  '내원': '병원에 옴', '수납': '돈 내는 곳', '처방전': '약 받는 종이', '처방': '약을 정해 줌', '조제': '약을 지음', '복용': '약을 먹음', '투약': '약을 줌', '공복': '빈속',
  '식전': '밥 먹기 전', '식후': '밥 먹은 뒤', '취침 전': '자기 전', '1일 3회': '하루에 세 번', '1일 2회': '하루에 두 번', '1일 1회': '하루에 한 번', '금기': '하면 안 됨', '부작용': '약 때문에 생길 수 있는 나쁜 증상', '소견서': '의사가 쓴 의견 종이',
  '자동이체': '날짜 되면 통장에서 저절로 빠져나감', '원금': '처음 빌린 돈', '이자': '돈을 빌린 값', '금리': '이자 비율', '해지': '끊음·그만둠', '약정': '약속한 기간', '위약금': '약속을 깨서 내는 돈', '만기': '끝나는 날',
  '명의': '누구 이름으로 된 것', '명의자': '이름이 올라간 사람', '갱신': '새로 연장함', '만료': '기간이 끝남', '유효기간': '쓸 수 있는 기간', '연장': '기간을 늘림',
  '수급자': '나라 지원을 받는 사람', '차상위': '형편이 어려운 가구(지원 대상)', '소득인정액': '나라가 계산한 한 달 소득', '자격': '받을 수 있는 조건', '신청기한': '신청 마감 날짜', '대상자': '해당하는 사람', '해당자': '해당하는 사람',
  '주민등록등본': '우리 집 식구가 나온 서류', '등본': '식구가 나온 서류', '초본': '내 이사 기록이 나온 서류', '인감': '공식 도장', '위임장': '대신 처리해도 된다는 종이', '대리인': '대신하는 사람',
  '본인인증': '나라는 걸 확인하는 절차', '인증번호': '확인용 숫자(남에게 알려주면 절대 안 됨)', '개인정보': '이름·주민번호·계좌 같은 내 정보',
};
const WORD_RE = new RegExp(Object.keys(WORDS).sort((a, b) => b.length - a.length).map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'), 'g');
const SCAM_WORDS = ['검찰', '검사', '수사관', '금융감독원', '금감원', '안전계좌', '인증번호', '원격', '앱 설치', '앱을 설치', '비밀번호', '보안카드', '대출 승인', '저금리', '엄마 나', '아빠 나', '폰이 고장', '액정', '문화상품권', '기프트카드', '택배 주소', '주소지 확인', '미납 요금', '결제 완료', '해외 결제', '환불 신청'];
const URL_RE = /(https?:\/\/|www\.|bit\.ly|han\.gl|[a-z0-9-]+\.(com|kr|net|me|ly|xyz|top|shop|site|info)\b)/i;

function offlineExplain(text) {
  const found = [...new Set(text.match(WORD_RE) || [])];
  const highlighted = esc(text).replace(WORD_RE, (w) => `<mark class="easy">${w}<i>(${esc(WORDS[w])})</i></mark>`);
  const dates = [...new Set([
    ...(text.match(/\d{4}\s*[.\-/년]\s*\d{1,2}\s*[.\-/월]\s*\d{1,2}\s*일?/g) || []),
    ...(text.match(/(?<![\d.])\d{1,2}\s*월\s*\d{1,2}\s*일/g) || []),
  ].map((s) => s.trim()))];
  const money = [...new Set((text.match(/\d[\d,]*\s*(만\s*)?원/g) || []).map((s) => s.trim()))];
  const scamHits = SCAM_WORDS.filter((w) => text.includes(w));
  const hasLink = URL_RE.test(text);
  const scam = scamHits.length > 0 && (hasLink || scamHits.length >= 2);
  return {
    kind: 'offline',
    summary: found.length ? `어려운 말 ${found.length}개를 쉬운 말로 바꿔 뒀어요.` : '특별히 어려운 말은 찾지 못했어요.',
    html: highlighted,
    facts: [dates.length ? `날짜: ${dates.join(', ')}` : '', money.length ? `금액: ${money.join(', ')}` : ''].filter(Boolean).join('\n'),
    caution: scam
      ? '사기 문자일 수 있어요. 링크를 누르거나 돈을 보내지 말고, 가족에게 먼저 물어보세요.'
      : hasLink ? '링크가 들어 있어요. 모르는 곳에서 온 문자라면 누르지 마세요.' : '',
    scam,
    speech: [found.length ? found.map((w) => `${w}는 ${WORDS[w]}라는 뜻이에요.`).join(' ') : '', dates.length ? `날짜는 ${dates.join(', ')}.` : '', money.length ? `금액은 ${money.join(', ')}.` : '', scam ? '사기일 수 있으니 조심하세요.' : ''].filter(Boolean).join(' '),
  };
}

const SYSTEM = `당신은 어르신이 받은 안내문, 고지서, 문자, 약 봉투, 병원 서류를 쉬운 말로 풀어 드리는 도우미입니다.
- 초등학생도 알아들을 만큼 쉬운 한국어로, 짧은 문장의 해요체로 씁니다. 한자어와 전문 용어는 쉬운 말로 바꿉니다.
- 원문에 없는 내용은 지어내지 않습니다. 글자가 흐리거나 잘려서 못 읽은 부분은 그렇다고 알려 줍니다.
- 돈을 보내라, 링크를 누르라, 앱을 깔라, 인증번호·계좌·비밀번호를 알려 달라는 등 사기 신호가 보이면 scam_suspect를 true로 하고, caution에 "누르지 말고 가족에게 먼저 물어보세요"처럼 할 일을 분명히 적습니다.
- 각 항목은 두세 문장 이내로 짧게 씁니다.`;

const SCHEMA = {
  type: 'object',
  properties: {
    summary: { type: 'string', description: '이 글이 무엇인지 한두 문장으로' },
    todo: { type: 'string', description: '어르신이 해야 할 일. 할 일이 없으면 "따로 하실 일은 없어요"' },
    facts: { type: 'string', description: '중요한 날짜, 금액, 장소, 전화번호. 없으면 빈 문자열' },
    caution: { type: 'string', description: '조심할 점. 없으면 빈 문자열' },
    scam_suspect: { type: 'boolean', description: '사기가 의심되면 true' },
  },
  required: ['summary', 'todo', 'facts', 'caution', 'scam_suspect'],
  additionalProperties: false,
};

let sdkPromise = null;
const loadSdk = () => (sdkPromise ||= import(SDK_URL).then((m) => m.default).catch((e) => { sdkPromise = null; throw e; }));

async function aiExplain({ image, text }) {
  let Anthropic;
  try { Anthropic = await loadSdk(); }
  catch (e) { throw new Error('인터넷 연결을 확인해 주세요.'); }
  const client = new Anthropic({ apiKey: state.apiKey.trim(), dangerouslyAllowBrowser: true });
  const content = [];
  if (image) content.push({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: image.split(',')[1] } });
  content.push({ type: 'text', text: text ? `다음 글을 쉬운 말로 풀어 주세요.\n\n${text}` : '사진 속 글을 쉬운 말로 풀어 주세요.' });
  try {
    const res = await client.beta.messages.create({
      model: MODEL,
      max_tokens: 4000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort: 'low', format: { type: 'json_schema', schema: SCHEMA } },
      system: SYSTEM,
      messages: [{ role: 'user', content }],
    });
    if (res.stop_reason === 'refusal') throw new Error('이 내용은 풀어 드릴 수 없어요. 가족에게 보여 주세요.');
    if (res.stop_reason === 'max_tokens') throw new Error('글이 너무 길어요. 조금씩 나눠서 해 주세요.');
    const raw = res.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
    const r = JSON.parse(raw);
    return {
      kind: 'ai', summary: r.summary, todo: r.todo, facts: r.facts, caution: r.caution, scam: !!r.scam_suspect,
      speech: [r.summary, r.todo, r.facts, r.caution].filter(Boolean).join(' '),
    };
  } catch (e) {
    if (e instanceof Anthropic.AuthenticationError || e instanceof Anthropic.PermissionDeniedError) throw new Error('AI 열쇠(키)가 맞지 않아요. 가족에게 설정을 확인해 달라고 해 주세요.');
    if (e instanceof Anthropic.RateLimitError) throw new Error('지금 사용하는 사람이 많아요. 잠시 뒤에 다시 해 주세요.');
    if (e instanceof Anthropic.APIConnectionError) throw new Error('인터넷 연결을 확인해 주세요.');
    if (e instanceof Anthropic.APIError) throw new Error('잠시 문제가 생겼어요. 조금 뒤에 다시 해 주세요.');
    throw e instanceof SyntaxError ? new Error('답을 읽지 못했어요. 다시 한 번 해 주세요.') : e;
  }
}

function viewEasy() {
  const hasKey = !!state.apiKey.trim();
  if (easy.status === 'loading') {
    return `${topbar('📄 쉬운 말로')}<div class="card loading">읽고 있어요<span class="dots"></span><p class="muted" style="margin-top:8px">10~20초쯤 걸려요</p></div>`;
  }
  if (easy.status === 'done' && easy.result) return `${topbar('📄 쉬운 말로')}${resultView(easy.result)}`;

  return `${topbar('📄 쉬운 말로')}
    <div class="stack">
      <div class="row">
        <button class="btn ${easy.mode === 'photo' ? 'purple' : ''}" data-act="easy-mode" data-m="photo">📷 사진으로</button>
        <button class="btn ${easy.mode === 'text' ? 'purple' : ''}" data-act="easy-mode" data-m="text">✍️ 글자로</button>
      </div>
      ${easy.error ? `<div class="card warn"><p>${esc(easy.error)}</p></div>` : ''}
      ${easy.mode === 'photo' ? `
        <div class="card">
          ${hasKey ? '' : `<p class="muted" style="margin-bottom:10px">사진 풀이는 가족이 <b>설정</b>에서 AI를 켜야 쓸 수 있어요. 문자나 글은 <b>✍️ 글자로</b>를 누르면 바로 풀어 드려요.</p>`}
          ${easy.image ? `<img class="photo-preview" src="${easy.image}" alt="찍은 사진">` : '<p class="muted">안내문이나 약 봉투를 밝은 곳에서 찍어 주세요.</p>'}
          <label class="btn full ${easy.image ? '' : 'blue'}" style="margin-top:12px">📷 ${easy.image ? '다시 찍기' : '사진 찍기'}
            <input type="file" accept="image/*" capture="environment" data-act="easy-photo" hidden>
          </label>
          ${easy.image ? `<button class="btn purple huge full" style="margin-top:12px" data-act="easy-run" ${hasKey ? '' : 'disabled'}>쉬운 말로 풀기</button>` : ''}
        </div>` : `
        <div class="card">
          <label class="field" style="margin-top:0"><span>어려운 글이나 문자를 여기에 붙여 넣으세요</span>
            <textarea id="easy-text" placeholder="예: 납부기한 경과 시 가산금이 부과됩니다.">${esc(easy.text)}</textarea>
          </label>
          <p class="hint">문자를 꾹 누르면 "복사"가 나와요. 여기를 꾹 누르고 "붙여넣기"를 누르세요.</p>
          <button class="btn purple huge full" style="margin-top:12px" data-act="easy-run">쉬운 말로 풀기</button>
          ${hasKey ? '' : '<p class="hint">지금은 어려운 낱말을 바꿔 드려요. 가족이 AI를 켜면 글 전체를 풀어 드려요.</p>'}
        </div>`}
    </div>`;
}

function resultView(r) {
  const p = primary();
  const sec = (title, body, alert) => body ? `<div class="sec ${alert ? 'alert' : ''}"><b>${title}</b><span class="txt">${esc(body)}</span></div>` : '';
  return `<div class="stack">
    <div class="card">
      <div class="result">
        ${r.caution ? sec('⚠️ 조심하세요', r.caution, true) : ''}
        ${sec('📌 무슨 내용이냐면', r.summary)}
        ${r.kind === 'ai' ? sec('✅ 하실 일', r.todo) : ''}
        ${sec('📅 날짜·금액', r.facts)}
        ${r.kind === 'offline' ? `<div class="sec"><b>✍️ 쉬운 말로 바꾼 글</b><span class="txt">${r.html}</span></div>` : ''}
      </div>
    </div>
    <div class="row">
      <button class="btn blue" data-act="speak">🔊 읽어 주기</button>
      <button class="btn" data-act="stop-speak">⏹ 그만</button>
    </div>
    ${p ? `<a class="btn full ${r.scam ? 'red' : ''}" href="${telHref(p.phone)}">📞 ${esc(p.name)}에게 물어보기</a>` : ''}
    <button class="btn full" data-act="easy-reset">↺ 다른 글 풀기</button>
  </div>`;
}

async function runEasy() {
  if (easy.mode === 'text') {
    const t = ($('#easy-text')?.value || '').trim();
    easy.text = t;
    if (!t) { toast('글을 먼저 넣어 주세요'); return; }
  } else if (!easy.image) { toast('사진을 먼저 찍어 주세요'); return; }

  easy.error = '';
  if (!state.apiKey.trim()) {
    if (easy.mode === 'photo') { easy.error = '사진 풀이는 AI를 켜야 해요. 가족에게 설정을 부탁해 주세요.'; render(); return; }
    easy.result = offlineExplain(easy.text);
    easy.status = 'done';
    render();
    return;
  }
  easy.status = 'loading';
  render();
  try {
    easy.result = await aiExplain(easy.mode === 'photo' ? { image: easy.image } : { text: easy.text });
    easy.status = 'done';
  } catch (e) {
    easy.status = 'idle';
    easy.error = e.message || '문제가 생겼어요. 다시 해 주세요.';
    // AI가 안 될 때도 글자는 낱말 풀이라도 보여 드림
    if (easy.mode === 'text') { easy.result = offlineExplain(easy.text); easy.status = 'done'; toast(easy.error); }
  }
  if (route === 'easy') render();
}

function readPhoto(file) {
  if (!file) return;
  const url = URL.createObjectURL(file);
  const img = new Image();
  img.onload = () => {
    easy.image = downscale(img, img.naturalWidth, img.naturalHeight);
    URL.revokeObjectURL(url);
    easy.error = '';
    render();
  };
  img.onerror = () => { URL.revokeObjectURL(url); toast('사진을 열 수 없어요'); };
  img.src = url;
}

/* ---------- 3. 가족에게 연락 (위치 + 전화) ---------- */
const loc = { status: 'idle', to: null, text: '', url: '' };

function viewCall() {
  if (!state.contacts.length) return `${topbar('📍 가족에게 연락')}${needContact()}`;
  const p = primary();
  const target = loc.to || p;
  let panel = '';
  if (loc.status === 'finding') {
    panel = `<div class="card loading">내 위치를 찾고 있어요<span class="dots"></span></div>`;
  } else if (loc.status === 'ready' || loc.status === 'nofix') {
    panel = `<div class="card ${loc.status === 'nofix' ? 'warn' : ''}">
      <h2>${loc.status === 'ready' ? '✅ 위치를 찾았어요' : '위치를 찾지 못했어요'}</h2>
      <p class="muted" style="margin-top:6px">${loc.status === 'ready' ? '문자 앱이 열리면 <b>보내기</b>만 누르세요.' : '위치 없이 연락 부탁 문자를 보낼 수 있어요. 휴대폰 설정에서 위치(GPS)를 켜 보세요.'}</p>
      <div class="stack" style="margin-top:12px">
        <a class="btn green huge full" href="${smsHref(target.phone, loc.text)}">💬 ${esc(target.name)}에게 문자 보내기</a>
        <a class="btn blue huge full" href="${telHref(target.phone)}">📞 ${esc(target.name)}에게 전화 걸기</a>
        ${navigator.share ? `<button class="btn full" data-act="share-loc">카카오톡 등 다른 앱으로 보내기</button>` : ''}
        ${loc.status === 'nofix' ? `<button class="btn full" data-act="send-loc" data-id="${target.id}">↺ 위치 다시 찾기</button>` : ''}
      </div>
    </div>`;
  }

  return `${topbar('📍 가족에게 연락')}
    <div class="stack">
      ${loc.status === 'idle' ? `<button class="btn green huge full" data-act="send-loc" data-id="${p.id}">📍 ${esc(p.name)}에게<br>내 위치 보내기</button>
        <p class="muted">누르면 내 위치를 찾아서 문자 앱을 열어 드려요. <b>보내기</b>만 누르면 돼요.</p>` : panel}
      ${loc.status !== 'idle' ? `<button class="btn full" data-act="loc-reset">↺ 처음부터</button>` : ''}
      <h2 style="margin-top:20px">가족 전화번호</h2>
      ${state.contacts.map((c) => `<div class="card">
        <div class="person"><span class="face">${c.face || '🧑'}</span><div><div class="name">${esc(c.name)}</div><div class="num">${esc(c.phone)}</div></div></div>
        <div class="row" style="margin-top:12px">
          <a class="btn blue" href="${telHref(c.phone)}">📞 전화</a>
          <button class="btn" data-act="send-loc" data-id="${c.id}">📍 위치 보내기</button>
        </div>
      </div>`).join('')}
    </div>`;
}

function findLocation(contactId) {
  const target = state.contacts.find((c) => c.id === contactId) || primary();
  loc.to = target;
  loc.status = 'finding';
  render();
  const nofix = () => {
    loc.status = 'nofix';
    loc.url = '';
    loc.text = `[든든 도우미] ${whoAmI()}예요. 연락 부탁해요. (위치는 찾지 못했어요, ${niceTime(Date.now())})`;
    if (route === 'call') render();
  };
  if (!navigator.geolocation) { nofix(); return; }
  navigator.geolocation.getCurrentPosition((pos) => {
    const { latitude: lat, longitude: lng, accuracy } = pos.coords;
    loc.url = `https://map.kakao.com/link/map/${encodeURIComponent(whoAmI() + ' 위치')},${lat.toFixed(6)},${lng.toFixed(6)}`;
    loc.text = `[든든 도우미] ${whoAmI()}예요. 지금 여기 있어요.\n${loc.url}\n(${niceTime(Date.now())}, 오차 약 ${Math.round(accuracy)}m)`;
    loc.status = 'ready';
    if (route !== 'call') return;
    render();
    // 한 번에 문자 앱까지 열어 드림 (막히면 화면의 버튼으로)
    location.href = smsHref(target.phone, loc.text);
  }, nofix, { enableHighAccuracy: true, timeout: 12000, maximumAge: 60000 });
}

/* ---------- 4. 응급 정보 ---------- */
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

/* ---------- 5. 안부 보내기 ---------- */
const MOODS = {
  good: { face: '😊', label: '좋아요', text: '오늘도 잘 지내고 있어요 😊' },
  soso: { face: '😐', label: '그저 그래요', text: '오늘은 그저 그래요 😐 그래도 괜찮아요.' },
  sick: { face: '😣', label: '좀 아파요', text: '오늘은 몸이 좀 안 좋아요 😣 시간 될 때 전화 한 번 주세요.' },
};
let mood = 'good';

function viewHello() {
  if (!state.contacts.length) return `${topbar('💚 안부 보내기')}${needContact()}`;
  const to = helloTo();
  const body = `[든든 도우미] ${whoAmI()}예요. ${MOODS[mood].text}`;
  const log = [...state.helloLog].reverse().slice(0, 7);
  return `${topbar('💚 안부 보내기')}
    <div class="stack">
      <h2>오늘 기분은 어떠세요?</h2>
      <div class="moods">${Object.entries(MOODS).map(([k, m]) => `<button class="mood ${mood === k ? 'on' : ''}" data-act="mood" data-m="${k}"><span>${m.face}</span>${m.label}</button>`).join('')}</div>
      ${state.contacts.length > 1 ? `<label class="field"><span>누구에게 보낼까요?</span>
        <select data-act="hello-to">${state.contacts.map((c) => `<option value="${c.id}" ${c.id === to.id ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select></label>` : ''}
      <div class="card"><p class="muted">보낼 말</p><p style="font-size:1.1rem;margin-top:4px">${esc(body)}</p></div>
      <a class="btn green huge full" href="${smsHref(to.phone, body)}" data-act="hello-sent">💚 ${esc(to.name)}에게 안부 보내기</a>
      <p class="muted">문자 앱이 열리면 <b>보내기</b>만 누르세요.</p>
      ${mood === 'sick' ? `<a class="btn blue full" href="${telHref(to.phone)}">📞 지금 바로 전화하기</a>` : ''}
      ${log.length ? `<div class="card"><h2>최근에 보낸 안부</h2><ul class="history">${log.map((h) => `<li>${MOODS[h.mood]?.face || '💚'} ${niceTime(h.at)} · ${esc(h.to || '')}</li>`).join('')}</ul></div>` : ''}
    </div>`;
}

/* ---------- 설정 (가족용) ---------- */
let editId = null;

function viewSettings() {
  const e = state.emergency;
  const editing = state.contacts.find((c) => c.id === editId);
  return `${topbar('⚙️ 설정')}
    <div class="stack">
      <p class="muted">가족이 한 번만 설정해 주세요. 모든 내용은 <b>이 폰에만</b> 저장돼요.</p>

      <div class="card">
        <h2>👤 문자에 쓸 이름</h2>
        <label class="field"><span>가족이 알아볼 이름 (예: 엄마, 김순자)</span><input data-bind="me" value="${esc(state.me)}" placeholder="엄마"></label>
        <p class="hint">문자에 "[든든 도우미] 엄마예요."처럼 들어가요.</p>
      </div>

      <div class="card">
        <h2>🔠 글자 크기</h2>
        <div class="size-pick" style="margin-top:10px">${[1, 2, 3].map((n) => `<button class="chip ${state.size === n ? 'on' : ''}" data-act="size" data-n="${n}">${['크게', '더 크게', '아주 크게'][n - 1]}</button>`).join('')}</div>
      </div>

      <div class="card" id="sec-contacts">
        <h2>👨‍👩‍👧 가족 연락처</h2>
        ${state.contacts.length ? state.contacts.map((c) => `<div class="person" style="margin-top:12px">
          <span class="face">${c.face || '🧑'}</span>
          <div style="flex:1;min-width:0"><div class="name">${esc(c.name)} ${c.id === primary()?.id ? '<span class="muted">⭐ 기본</span>' : ''}</div><div class="num">${esc(c.phone)}</div></div>
          <button class="chip" data-act="edit-contact" data-id="${c.id}">고치기</button>
        </div>`).join('') : '<p class="muted" style="margin-top:6px">위치 보내기, 안부, 응급 보호자에 쓰여요.</p>'}
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
          <p class="hint">⭐ 기본 연락처에게 위치와 안부가 먼저 가요. 맨 위 세 명은 응급 화면에 보호자로 나와요.</p>
        </form>
      </div>

      <div class="card" id="sec-emg">
        <h2>🚑 응급 정보</h2>
        ${EMG_FIELDS.map(([k, label]) => `<label class="field"><span>${label}</span>${['disease', 'meds', 'note'].includes(k)
          ? `<textarea data-bind="emergency.${k}" style="min-height:90px" placeholder="${k === 'meds' ? '예: 혈압약(아침), 당뇨약(저녁)' : ''}">${esc(e[k])}</textarea>`
          : `<input data-bind="emergency.${k}" value="${esc(e[k])}" placeholder="${{ birth: '예: 1950년 3월 5일', blood: '예: A형 Rh+', allergy: '예: 페니실린, 땅콩', hospital: '예: ○○내과 02-123-4567' }[k] || ''}">`}</label>`).join('')}
      </div>

      <div class="card">
        <h2>🤖 AI 풀이 켜기 (선택)</h2>
        <p class="muted" style="margin-top:6px">사진 속 글을 읽고 쉬운 말로 풀어 주려면 Anthropic API 키가 필요해요. 키가 없어도 글자로 넣은 문장의 어려운 낱말은 바꿔 드려요.</p>
        <label class="field"><span>API 키</span><input type="password" data-bind="apiKey" value="${esc(state.apiKey)}" placeholder="sk-ant-..." autocomplete="off"></label>
        <p class="hint">한 번 풀 때마다 몇십 원 정도 요금이 나와요. 키는 이 폰에만 저장되니, 이 폰을 남에게 빌려주지 마세요. 사용 한도를 정해 둔 키를 쓰는 걸 권해요.</p>
      </div>

      <div class="card">
        <h2>💾 백업</h2>
        <p class="muted" style="margin-top:6px">폰을 바꾸기 전에 내보내 두고, 새 폰에서 가져오세요. (AI 키는 빠져요)</p>
        <div class="row" style="margin-top:12px">
          <button class="btn" data-act="export">⬇️ 내보내기</button>
          <label class="btn">⬆️ 가져오기<input type="file" accept="application/json,.json" data-act="import" hidden></label>
        </div>
      </div>
    </div>`;
}

/* ---------- 라우팅 ---------- */
const VIEWS = { home: viewHome, magnify: viewMagnify, easy: viewEasy, call: viewCall, emergency: viewEmergency, hello: viewHello, settings: viewSettings };
let route = VIEWS[location.hash.slice(1)] ? location.hash.slice(1) : 'home';

function render() {
  document.documentElement.dataset.size = state.size;
  $('#app').innerHTML = VIEWS[route]();
  if (route === 'magnify') {
    if (cam.stream) { $('#cam').srcObject = cam.stream; $('#cam').play().catch(() => {}); syncCamUI(); }
    else startCamera();
  }
}

// 화면 이동은 주소(#) 기록으로 남겨서, 폰의 '뒤로' 버튼을 누르면 앱 안에서 이전 화면으로 돌아가게 함
let pendingSec = '';
function go(to, sec) {
  pendingSec = sec || '';
  const hash = to === 'home' ? '' : '#' + to;
  if (location.hash === hash || (!hash && !location.hash)) applyRoute();
  else location.hash = hash;
}

function applyRoute() {
  const to = VIEWS[location.hash.slice(1)] ? location.hash.slice(1) : 'home';
  if (route === 'magnify' && to !== 'magnify') stopCamera();
  if (to !== route) stopSpeak();
  if (to === 'call') Object.assign(loc, { status: 'idle', to: null });
  if (to === 'settings') editId = null;
  route = to;
  render();
  const sec = pendingSec;
  pendingSec = '';
  if (sec) $('#sec-' + sec)?.scrollIntoView({ block: 'start' });
  else window.scrollTo(0, 0);
}
window.addEventListener('hashchange', applyRoute);

/* ---------- 이벤트 ---------- */
document.addEventListener('click', (ev) => {
  const el = ev.target.closest('[data-act]');
  if (!el || el.matches('input, select')) return;
  const id = el.dataset.id;
  switch (el.dataset.act) {
    case 'go': return go(el.dataset.to, el.dataset.sec);
    case 'zoom': {
      const step = usingHw() ? Math.max(0.5, (cam.hw.max - cam.hw.min) / 8) : 0.5;
      return setZoom((usingHw() ? cam.hwVal : cam.css) + step * Number(el.dataset.d));
    }
    case 'freeze': return toggleFreeze();
    case 'torch':
      if (!cam.track) return;
      cam.torch = !cam.torch;
      cam.track.applyConstraints({ advanced: [{ torch: cam.torch }] }).catch(() => { cam.torch = false; toast('불을 켤 수 없어요'); syncCamUI(); });
      return syncCamUI();
    case 'filter': cam.filter = el.dataset.f; document.querySelectorAll('[data-act=filter]').forEach((b) => b.classList.toggle('on', b === el)); return applyView();
    case 'still-to-easy':
      Object.assign(easy, { mode: 'photo', image: stillToDataUrl(), status: 'idle', result: null, error: '' });
      return go('easy');
    case 'easy-mode': easy.mode = el.dataset.m; easy.error = ''; return render();
    case 'easy-run': return runEasy();
    case 'easy-reset': Object.assign(easy, { image: '', text: '', status: 'idle', result: null, error: '' }); stopSpeak(); return render();
    case 'speak': if (easy.result) speak(easy.result.speech || easy.result.summary); return;
    case 'stop-speak': return stopSpeak();
    case 'send-loc': return findLocation(id);
    case 'loc-reset': Object.assign(loc, { status: 'idle', to: null }); return render();
    case 'share-loc': navigator.share({ text: loc.text }).catch(() => {}); return;
    case 'print': return window.print();
    case 'mood': mood = el.dataset.m; return render();
    case 'hello-sent': {
      state.helloLog.push({ at: Date.now(), day: todayKey(), mood, to: helloTo().name });
      state.helloLog = state.helloLog.slice(-60);
      save();
      toast('💚 보내기를 누르면 안부가 가요');
      return; // 링크는 그대로 열리게 둠
    }
    case 'size': state.size = Number(el.dataset.n); save(); return render();
    case 'edit-contact': editId = id; render(); $('#sec-contacts')?.scrollIntoView({ block: 'start' }); return;
    case 'cancel-edit': editId = null; return render();
    case 'primary': state.primaryId = id; save(); toast('⭐ 기본 연락처로 정했어요'); return render();
    case 'del-contact':
      if (!confirm('이 연락처를 지울까요?')) return;
      state.contacts = state.contacts.filter((c) => c.id !== id);
      if (state.primaryId === id) state.primaryId = '';
      if (state.helloToId === id) state.helloToId = '';
      editId = null; save(); return render();
    case 'export': return exportData();
    default:
  }
});

document.addEventListener('input', (ev) => {
  const el = ev.target;
  if (el.id === 'zoom') return setZoom(Number(el.value));
  if (el.id === 'easy-text') { easy.text = el.value; return; }
  if (el.dataset.bind) {
    const [a, b] = el.dataset.bind.split('.');
    if (b) state[a][b] = el.value; else state[a] = el.value;
    save();
  }
});

document.addEventListener('change', (ev) => {
  const el = ev.target;
  if (el.dataset.act === 'easy-photo') return readPhoto(el.files[0]);
  if (el.dataset.act === 'hello-to') { state.helloToId = el.value; save(); return render(); }
  if (el.dataset.act === 'import') return importData(el.files[0]);
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
  const data = { ...state, apiKey: '' };
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
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
      const base = defaultState();
      state = { ...base, ...d, emergency: { ...base.emergency, ...(d.emergency || {}) }, apiKey: state.apiKey };
      save();
      render();
      toast('⬆️ 가져왔어요');
    } catch (e) { toast('이 파일은 읽을 수 없어요'); }
  };
  r.readAsText(file);
}

// 다른 앱(문자·전화)에 다녀오면 카메라가 멈춰 있을 수 있어 다시 켬
document.addEventListener('visibilitychange', () => {
  if (document.hidden) { if (route === 'magnify') stopCamera(); }
  else if (route === 'magnify' && !cam.stream) render();
});

render();
