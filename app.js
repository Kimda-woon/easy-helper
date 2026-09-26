/* 진료실 도우미 — 병원에서 보여 줄 약·병력·물어볼 것을 폰 한 화면에. 서버·요금 없음 */

import { readImage, parseBag } from './scan.js';

const KEY = 'clinic-helper-v1';
const OLD_KEY = 'easy-helper-v1'; // 예전 '든든 도우미'의 응급 정보를 한 번 옮겨 옴

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uid = () => Math.random().toString(36).slice(2, 10);
const pad = (n) => String(n).padStart(2, '0');
const DAYS = ['일', '월', '화', '수', '목', '금', '토'];
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const today = () => ymd(new Date());
const parse = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const addDays = (s, n) => { const d = parse(s); d.setDate(d.getDate() + n); return ymd(d); };
const diffDays = (a, b) => Math.round((parse(a) - parse(b)) / 864e5); // a - b
const niceDate = (s) => { const d = parse(s); return `${d.getMonth() + 1}월 ${d.getDate()}일(${DAYS[d.getDay()]})`; };
const fullDate = (s) => `${s.slice(0, 4)}년 ${niceDate(s)}`;
const cleanPhone = (p) => String(p || '').replace(/[^\d+]/g, '');
const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

const TIMES = ['아침', '점심', '저녁', '자기 전', '아플 때만'];
const TIMING = ['', '밥 먹기 전', '밥 먹고 바로', '밥 먹고 30분 뒤', '상관없음'];
const QUESTIONS = {
  '💊 약': ['이 약 언제까지 먹어요?', '밥 먹기 전에 먹어요, 먹고 나서 먹어요?', '다른 약이랑 같이 먹어도 돼요?', '약 먹고 어지러워요', '약 먹고 속이 쓰려요', '약을 깜빡하면 어떻게 해요?', '약을 줄일 수 있어요?'],
  '🤕 몸 상태': ['이거 심각한 거예요?', '운동해도 돼요?', '먹으면 안 되는 음식 있어요?', '술·담배 괜찮아요?', '잠을 잘 못 자요', '자꾸 깜빡깜빡해요', '변비·설사가 있어요'],
  '🔬 검사': ['검사 결과 어때요?', '검사 또 해야 해요?', '큰 병원 가야 해요?'],
  '🧾 서류·비용': ['진단서가 필요해요', '소견서가 필요해요', '보험 서류 떼 주세요', '비용이 얼마나 나와요?'],
};
const RESULTS = ['괜찮대요 😊', '약 그대로 먹으래요', '약이 바뀌었어요', '검사 받으래요', '큰 병원 가래요', '조심하래요'];
const NEXTS = [['1주 뒤', 7], ['2주 뒤', 14], ['한 달 뒤', 30], ['3달 뒤', 91]];
const PHOTO_KINDS = { bag: '💊 약 봉투', paper: '🧾 처방전·영수증', doc: '🔬 검사 결과지', etc: '📷 기타' };

/* ---------- 저장 (글자는 localStorage, 사진은 IndexedDB) ---------- */
const defaultState = () => ({
  v: 1, size: 1,
  profile: { name: '', birthYear: '', sex: '', blood: '' },
  conditions: [], allergies: [],
  surgeries: [], hospitals: [], meds: [], asks: [], visits: [], appts: [], docs: [],
});

function hydrate(d) {
  const base = defaultState();
  return { ...base, ...d, profile: { ...base.profile, ...(d.profile || {}) } };
}

function migrateOld() {
  // 든든 도우미를 쓰던 폰이면 응급 정보를 가져와 첫 설정을 줄여 줌
  try {
    const old = JSON.parse(localStorage.getItem(OLD_KEY) || 'null');
    const e = old && old.emergency;
    if (!e) return null;
    const s = defaultState();
    s.size = old.size || 1;
    s.profile.name = e.name || '';
    const y = String(e.birth || '').match(/(19|20)\d{2}/);
    if (y) s.profile.birthYear = y[0];
    s.profile.blood = e.blood || '';
    const split = (t) => String(t || '').split(/[,，\n]/).map((x) => x.trim()).filter(Boolean);
    s.conditions = split(e.disease);
    s.allergies = split(e.allergy);
    s.meds = split(e.meds).map((name) => ({ id: uid(), name, dose: '', times: [], timing: '', hospitalId: '', start: '', days: '', photoId: '', stopped: false }));
    if (e.hospital) s.hospitals.push({ id: uid(), name: e.hospital, dept: '', phone: '' });
    return s;
  } catch (err) { return null; }
}

function load() {
  try { const raw = localStorage.getItem(KEY); if (raw) return hydrate(JSON.parse(raw)); } catch (e) { /* 저장소를 못 쓰는 환경 */ }
  return migrateOld() || defaultState();
}
let state = load();
function save() {
  try { localStorage.setItem(KEY, JSON.stringify(state)); }
  catch (e) { toast('저장이 안 돼요. 폰 저장 공간을 확인해 주세요.'); }
}
save();

let dbp = null;
function db() {
  return dbp ||= new Promise((res, rej) => {
    const r = indexedDB.open('clinic-helper', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('photos');
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}
const tx = async (mode, fn) => { const d = await db(); return new Promise((res, rej) => { const t = d.transaction('photos', mode); const out = fn(t.objectStore('photos')); t.oncomplete = () => res(out && out.result); t.onerror = () => rej(t.error); }); };
const putPhoto = async (blob) => { const id = 'p' + uid(); await tx('readwrite', (s) => s.put(blob, id)); return id; };
const getPhoto = (id) => tx('readonly', (s) => s.get(id));
const delPhoto = (id) => id && tx('readwrite', (s) => s.delete(id)).catch(() => {});
const urlCache = new Map();
async function photoUrl(id) {
  if (!urlCache.has(id)) { const b = await getPhoto(id); urlCache.set(id, b ? URL.createObjectURL(b) : ''); }
  return urlCache.get(id);
}
// 화면에 그린 뒤 <img data-photo="id"> 에 사진을 채움
function fillPhotos() {
  $$('img[data-photo]').forEach(async (img) => { const u = await photoUrl(img.dataset.photo); if (u) img.src = u; else img.remove(); });
}

// 사진을 적당한 크기로 줄여서 저장 (폰 용량 절약)
function fileToPhoto(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const k = Math.min(1, 1600 / Math.max(img.naturalWidth, img.naturalHeight));
      const c = document.createElement('canvas');
      c.width = Math.round(img.naturalWidth * k);
      c.height = Math.round(img.naturalHeight * k);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      c.toBlob(async (b) => { try { resolve(await putPhoto(b)); } catch (e) { reject(e); } }, 'image/jpeg', 0.82);
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('img')); };
    img.src = url;
  });
}

/* ---------- 공통 ---------- */
let toastTimer;
function toast(msg) {
  const el = $('#toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2600);
}
const topbar = (title) => `<div class="topbar no-print"><button class="back" data-act="go" data-to="home">← 처음으로</button><h1>${title}</h1></div>`;
const hospital = (id) => state.hospitals.find((h) => h.id === id);
const hospitalName = (id) => hospital(id)?.name || '';
const activeMeds = () => state.meds.filter((m) => !m.stopped);
const medLeft = (m) => (m.start && Number(m.days) > 0 ? diffDays(addDays(m.start, Number(m.days)), today()) : null);
const photoInput = (act, extra = '') => `<input type="file" accept="image/*" capture="environment" data-act="${act}" ${extra} hidden>`;

function upcomingAppt() {
  return state.appts.filter((a) => a.status === 'planned' && a.date >= today()).sort((a, b) => a.date.localeCompare(b.date))[0];
}
// 예약일이 지났는데 기록이 없는 진료 (지난 2주 안)
function pendingAppt() {
  return state.appts.filter((a) => a.status === 'planned' && a.date < today() && diffDays(today(), a.date) <= 14).sort((a, b) => b.date.localeCompare(a.date))[0];
}
const dday = (s) => { const n = diffDays(s, today()); return n === 0 ? '오늘' : n === 1 ? '내일' : n === 2 ? '모레' : `${n}일 뒤`; };

/* ---------- 홈 ---------- */
function viewHome() {
  const d = new Date();
  const next = upcomingAppt();
  const pend = pendingAppt();
  const meds = activeMeds();
  const low = meds.map((m) => [m, medLeft(m)]).filter(([, n]) => n !== null && n <= 5).sort((a, b) => a[1] - b[1]);
  const setup = !state.profile.name && !meds.length;
  return `<div class="hello"><h1>🩺 진료실 도우미</h1><p>${d.getMonth() + 1}월 ${d.getDate()}일 ${DAYS[d.getDay()]}요일</p></div>
    <div class="stack">
      ${setup ? `<div class="card warn"><h2>처음 쓰시나요?</h2><p class="muted" style="margin-top:6px">가족이 <b>🗂️ 내 병력</b>과 <b>💊 내 약</b>을 먼저 채워 주세요.</p>
        <button class="btn full" style="margin-top:12px" data-act="go" data-to="history">🗂️ 내 병력 채우기</button></div>` : ''}
      ${pend ? `<div class="card info"><div class="banner"><span class="ico">📋</span><div><h2>${niceDate(pend.date)} ${esc(hospitalName(pend.hospitalId))}<br>다녀오셨어요?</h2><p class="muted">버튼 몇 번이면 기록돼요.</p></div></div>
        <div class="row" style="margin-top:12px"><button class="btn blue" data-act="visit-from-appt" data-id="${pend.id}">네, 기록할게요</button><button class="btn" data-act="appt-missed" data-id="${pend.id}">못 갔어요</button></div></div>` : ''}
      ${next ? `<div class="card"><div class="banner"><span class="ico">📅</span><div><h2>${dday(next.date)} ${esc(hospitalName(next.hospitalId))}</h2><p class="muted">${fullDate(next.date)}</p></div></div></div>` : ''}
      ${low.length ? `<div class="card warn"><div class="banner"><span class="ico">⚠️</span><div>${low.map(([m, n]) => `<h2>${esc(m.name)} ${n <= 0 ? '다 드셨어요' : `${n}일 뒤 떨어져요`}</h2>`).join('')}<p class="muted">병원에 가서 더 받아 오세요.</p></div></div></div>` : ''}
      <div class="home-grid">
        <button class="big-btn hero b-blue" data-act="go" data-to="show"><span class="ico">🩺</span><span>의사 선생님께 보여 주기<small>진료실에서 이 화면을 보여 드려요</small></span></button>
        <button class="big-btn b-green" data-act="go" data-to="meds"><span class="ico">💊</span><span>내 약<small>${meds.length ? `${meds.length}가지 먹고 있어요` : '먹는 약을 넣어 주세요'}</small></span></button>
        <button class="big-btn b-purple" data-act="go" data-to="ask"><span class="ico">❓</span><span>물어볼 것<small>${state.asks.length ? `${state.asks.length}개 골랐어요` : '눌러서 고르기만 하면 돼요'}</small></span></button>
        <button class="big-btn b-orange" data-act="visit-new"><span class="ico">📋</span><span>병원 다녀왔어요<small>버튼 몇 번으로 기록해요</small></span></button>
      </div>
      <div class="sub-links">
        <button data-act="go" data-to="records"><span>🗓️</span>진료 기록</button>
        <button data-act="go" data-to="history"><span>🗂️</span>내 병력</button>
        <button data-act="go" data-to="settings"><span>⚙️</span>설정</button>
      </div>
      <div class="privacy">🔒 기록은 <b>이 폰에만</b> 저장돼요. 어디에도 보내지 않아요.</div>
      <p class="notice">기록을 보여 주는 도구예요. 진단이나 처방을 대신하지 않아요.</p>
    </div>`;
}

/* ---------- 🩺 의사 선생님께 보여 주기 ---------- */
function viewShow() {
  const p = state.profile;
  const meds = activeMeds();
  const age = p.birthYear ? new Date().getFullYear() - Number(p.birthYear) : '';
  const lastVisits = [...state.visits].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 3);
  const medPhotos = meds.filter((m) => m.photoId);
  const who = [p.name, p.birthYear && `${p.birthYear}년생${age ? ` (${age}세)` : ''}`, p.sex, p.blood && `혈액형 ${p.blood}`].filter(Boolean).join(' · ');
  return `${topbar('🩺 보여 드리기')}
    <div class="stack">
      <div class="show-head"><h1>${esc(p.name || '환자')}님 진료 정보</h1><p>${esc(who.replace(p.name + ' · ', '')) || '의사 선생님, 이 화면을 봐 주세요.'}</p></div>
      ${state.allergies.length ? `<div class="card show-sec alert"><h2>⚠️ 알레르기</h2><p class="big-text">${state.allergies.map(esc).join(', ')}</p></div>` : ''}
      ${state.conditions.length ? `<div class="card show-sec"><h2>앓고 있는 병</h2><p class="big-text">${state.conditions.map(esc).join(', ')}</p></div>` : ''}
      <div class="card show-sec"><h2>먹고 있는 약 (${meds.length})</h2>
        ${meds.length ? `<table class="meds"><thead><tr><th>약 이름</th><th>얼마나·언제</th><th>처방</th></tr></thead><tbody>
          ${meds.map((m) => `<tr><td>${esc(m.name)}</td><td>${esc([m.dose, m.times.join('·'), m.timing].filter(Boolean).join(', ')) || '-'}</td><td>${esc([hospitalName(m.hospitalId), m.start && niceDate(m.start)].filter(Boolean).join('\n')) || '-'}</td></tr>`).join('')}
        </tbody></table>` : '<p class="muted">적어 둔 약이 없어요.</p>'}
        ${medPhotos.length ? `<p class="muted no-print" style="margin-top:10px">약 봉투 사진 (눌러서 크게)</p><div class="thumbs no-print">${medPhotos.map((m) => `<img class="thumb" data-photo="${m.photoId}" data-act="view" data-id="${m.photoId}" alt="${esc(m.name)} 약 봉투">`).join('')}</div>` : ''}
      </div>
      ${state.asks.length ? `<div class="card show-sec"><h2>오늘 여쭤보고 싶은 것</h2>
        ${state.asks.map((a) => `<label class="ask-item ${a.answered ? 'done' : ''}"><input type="checkbox" data-act="ask-answered" data-id="${a.id}" ${a.answered ? 'checked' : ''}><span>${esc(a.text)}</span></label>`).join('')}
        <p class="hint no-print">답을 들으면 눌러서 ✓ 표시하세요.</p></div>` : ''}
      ${state.surgeries.length ? `<div class="card show-sec"><h2>수술·시술 이력</h2><ul class="list">${state.surgeries.map((s) => `<li><b>${esc(s.year)}</b> ${esc(s.what)} ${s.hospital ? `<span class="muted">(${esc(s.hospital)})</span>` : ''}</li>`).join('')}</ul></div>` : ''}
      ${lastVisits.length ? `<div class="card show-sec"><h2>최근 진료</h2><ul class="list">${lastVisits.map((v) => `<li><div class="grow"><b>${niceDate(v.date)}</b> ${esc(hospitalName(v.hospitalId))}<div class="muted">${esc(v.results.join(', '))}${v.memo ? ` · ${esc(v.memo)}` : ''}</div></div></li>`).join('')}</ul></div>` : ''}
      <button class="btn full no-print" data-act="print">🖨️ 종이로 뽑기</button>
    </div>`;
}

/* ---------- 💊 내 약 ---------- */
function viewMeds() {
  const meds = activeMeds();
  const stopped = state.meds.filter((m) => m.stopped);
  const medRow = (m) => {
    const n = medLeft(m);
    return `<div class="med">
      ${m.photoId ? `<img class="thumb" data-photo="${m.photoId}" data-act="view" data-id="${m.photoId}" alt="약 봉투">` : ''}
      <div class="grow">
        <div class="name">${esc(m.name)}</div>
        <div class="meta">${esc([m.dose, m.times.join('·'), m.timing].filter(Boolean).join(' · ')) || '먹는 때를 아직 안 적었어요'}</div>
        ${hospitalName(m.hospitalId) || m.start ? `<div class="meta">${esc(hospitalName(m.hospitalId))} ${m.start ? `· ${niceDate(m.start)} 처방` : ''}</div>` : ''}
        ${n !== null ? `<div class="left-days ${n <= 5 ? 'low' : ''}">${n <= 0 ? '다 드셨어요' : `${n}일 치 남았어요`}</div>` : ''}
      </div>
      <button class="btn sm" data-act="med-edit" data-id="${m.id}">고치기</button>
    </div>`;
  };
  return `${topbar('💊 내 약')}
    <div class="stack">
      <label class="btn green huge full">📷 약 봉투 찍어서 넣기${photoInput('scan-photo')}</label>
      <button class="btn full" data-act="med-new">✏️ 직접 적어서 넣기</button>
      <div class="card">${meds.length ? meds.map(medRow).join('') : '<p class="muted">아직 넣은 약이 없어요. 약 봉투를 보면서 넣어 주세요.</p>'}</div>
      ${stopped.length ? `<details class="card"><summary><b>그만 먹는 약 (${stopped.length})</b></summary><div style="margin-top:12px">${stopped.map(medRow).join('')}</div></details>` : ''}
      <div class="card info"><h2>💡 약 목록을 처음 만들 때</h2>
        <p class="muted" style="margin-top:6px">건강보험심사평가원의 <b>"내가 먹는 약! 한눈에"</b> 서비스에서 최근 1년 동안 처방받은 약을 볼 수 있어요(본인 인증 필요). 가족이 그 목록을 보면서 넣으면 빠뜨리지 않아요.</p></div>
    </div>`;
}

let medDraft = null;
function viewMedEdit() {
  const m = medDraft;
  if (!m) return viewMeds();
  const isNew = !state.meds.some((x) => x.id === m.id);
  return `${topbar(isNew ? '💊 약 넣기' : '💊 약 고치기')}
    <div class="stack"><div class="card">
      <p class="muted">약 봉투를 보면서 적어 주세요. 약 이름만 적어도 괜찮아요.</p>
      <div style="margin-top:12px">
        ${m.photoId ? `<img class="thumb" style="width:120px;height:120px" data-photo="${m.photoId}" data-act="view" data-id="${m.photoId}" alt="약 봉투">` : ''}
        <label class="btn full" style="margin-top:8px">📷 약 봉투 ${m.photoId ? '다시 찍기' : '사진 찍기'}${photoInput('med-photo')}</label>
      </div>
      <label class="field"><span>약 이름 (필수)</span><input id="m-name" value="${esc(m.name)}" placeholder="예: 노바스크정 5mg" autocomplete="off"></label>
      <label class="field"><span>한 번에 얼마나</span><input id="m-dose" value="${esc(m.dose)}" placeholder="예: 1알" autocomplete="off"></label>
      <div class="field"><span style="display:block;font-weight:700;font-size:.9rem;margin-bottom:6px">언제 먹어요? (여러 개 골라도 돼요)</span>
        <div class="picks">${TIMES.map((t) => `<button class="pick ${m.times.includes(t) ? 'on' : ''}" data-act="med-time" data-v="${t}">${t}</button>`).join('')}</div></div>
      <label class="field"><span>밥이랑</span><select id="m-timing">${TIMING.map((t) => `<option value="${t}" ${m.timing === t ? 'selected' : ''}>${t || '고르지 않음'}</option>`).join('')}</select></label>
      <label class="field"><span>처방받은 병원</span><select id="m-hosp"><option value="">고르지 않음</option>${state.hospitals.map((h) => `<option value="${h.id}" ${m.hospitalId === h.id ? 'selected' : ''}>${esc(h.name)}</option>`).join('')}<option value="__new">＋ 새 병원 적기</option></select></label>
      <input id="m-hosp-new" placeholder="병원 이름" style="margin-top:8px" hidden>
      <div class="row" style="margin-top:0">
        <label class="field" style="flex:1;min-width:140px"><span>처방받은 날</span><input type="date" id="m-start" value="${esc(m.start)}" max="${today()}"></label>
        <label class="field" style="flex:1;min-width:120px"><span>며칠 치</span><input type="number" id="m-days" value="${esc(m.days)}" min="1" max="365" inputmode="numeric" placeholder="예: 30"></label>
      </div>
      <p class="hint">받은 날과 며칠 치를 적으면 약이 떨어지기 전에 첫 화면에서 알려 드려요.</p>
      <button class="btn green huge full" style="margin-top:16px" data-act="med-save">저장</button>
      ${isNew ? '' : `<div class="row" style="margin-top:10px">
        <button class="btn" data-act="med-stop">${m.stopped ? '다시 먹는 약으로' : '그만 먹는 약으로'}</button>
        <button class="btn danger" data-act="med-del">지우기</button></div>`}
    </div></div>`;
}

function readMedForm() {
  const m = medDraft;
  m.name = $('#m-name').value.trim();
  m.dose = $('#m-dose').value.trim();
  m.timing = $('#m-timing').value;
  let h = $('#m-hosp').value;
  if (h === '__new') {
    const name = $('#m-hosp-new').value.trim();
    h = name ? addHospital(name) : '';
  }
  m.hospitalId = h;
  m.start = $('#m-start').value;
  m.days = $('#m-days').value ? String(Math.max(1, Number($('#m-days').value))) : '';
}

function addHospital(name) {
  const found = state.hospitals.find((h) => h.name === name);
  if (found) return found.id;
  const h = { id: uid(), name, dept: '', phone: '' };
  state.hospitals.push(h);
  return h.id;
}

/* ---------- 📷 약 봉투 찍어서 넣기 ---------- */
const scan = { status: '', progress: 0, photoId: '', r: null, error: '' };

function blobToImage(blob) {
  return new Promise((res, rej) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); res(img); };
    img.onerror = () => { URL.revokeObjectURL(url); rej(new Error('img')); };
    img.src = url;
  });
}

async function startScan(blob, photoId = '') {
  Object.assign(scan, { status: 'working', progress: 0, photoId, r: null, error: '' });
  go('scan');
  try {
    if (!scan.photoId) scan.photoId = await fileToPhoto(blob);
    const img = await blobToImage(blob); // 원본 해상도로 읽어야 정확함
    const { text } = await readImage(img, (p) => {
      scan.progress = p;
      const bar = $('#scan-bar');
      if (bar) bar.style.width = Math.round(p * 100) + '%';
    });
    const r = parseBag(text);
    scan.r = {
      drugs: r.drugs.map((d) => ({ name: d.name, on: true })),
      hospital: r.hospital, date: r.date && r.date <= today() ? r.date : today(),
      times: r.times, days: r.days, timing: r.timing, lines: r.lines,
    };
    scan.status = r.drugs.length ? 'review' : 'fail';
  } catch (e) {
    scan.status = 'fail';
    scan.error = e.message === 'load' ? '처음 한 번은 글자 읽기 도구를 받아야 해서 인터넷이 필요해요. 와이파이나 데이터를 켜고 다시 해 주세요.' : '사진을 읽지 못했어요.';
  }
  if (route === 'scan') render();
}

function viewScan() {
  if (scan.status === 'working') {
    return `${topbar('📷 약 봉투 읽기')}<div class="card loading-card"><p class="big-emoji">🔎</p><h2>약 이름을 읽고 있어요</h2>
      <div class="bar"><i id="scan-bar" style="width:${Math.round(scan.progress * 100)}%"></i></div>
      <p class="muted" style="margin-top:10px">사진은 폰 밖으로 나가지 않아요. 처음 한 번은 30초쯤 걸려요.</p></div>`;
  }
  if (scan.status === 'fail' || !scan.r) {
    return `${topbar('📷 약 봉투 읽기')}<div class="stack">
      <div class="card warn"><h2>약 이름을 찾지 못했어요</h2>
        <p class="muted" style="margin-top:6px">${esc(scan.error || '글씨가 흐리거나 멀리서 찍히면 잘 못 읽어요.')}</p>
        <ul class="steps-ko"><li>밝은 곳에서 찍어 주세요.</li><li>약 이름이 있는 부분이 화면에 꽉 차게 가까이 찍어 주세요.</li><li>종이가 구겨지지 않게 펴 주세요.</li></ul></div>
      <label class="btn green huge full">📷 다시 찍기${photoInput('scan-photo')}</label>
      <button class="btn full" data-act="scan-manual">✏️ 직접 적기 (찍은 사진은 붙여 둘게요)</button></div>`;
  }
  const r = scan.r;
  const n = r.drugs.filter((d) => d.on && d.name.trim()).length;
  return `${topbar('📷 이렇게 읽었어요')}
    <div class="stack">
      <div class="card info"><p><b>맞는지 한번 봐 주세요.</b> 약이 아닌 줄은 체크를 빼고, 틀린 글자는 눌러서 고쳐 주세요.</p></div>
      <div class="card">
        <div class="row between"><h2>💊 찾은 약</h2>${scan.photoId ? `<img class="thumb" data-photo="${scan.photoId}" data-act="view" data-id="${scan.photoId}" alt="찍은 사진">` : ''}</div>
        ${r.drugs.map((d, i) => `<div class="scan-drug ${d.on ? '' : 'off'}">
          <input type="checkbox" data-act="scan-on" data-i="${i}" ${d.on ? 'checked' : ''} aria-label="넣기">
          <input data-scan-name="${i}" value="${esc(d.name)}" aria-label="약 이름">
        </div>`).join('')}
        <div class="inline-add"><input id="scan-add" placeholder="빠진 약이 있으면 적어 주세요" autocomplete="off"><button class="btn" data-act="scan-add">넣기</button></div>
      </div>
      <div class="card">
        <h2>🕘 먹는 법 (모든 약에 똑같이 들어가요)</h2>
        <div class="picks" style="margin-top:10px">${TIMES.map((t) => `<button class="pick ${r.times.includes(t) ? 'on' : ''}" data-act="scan-time" data-v="${t}">${t}</button>`).join('')}</div>
        <label class="field"><span>밥이랑</span><select data-scan-field="timing">${TIMING.map((t) => `<option value="${t}" ${r.timing === t ? 'selected' : ''}>${t || '고르지 않음'}</option>`).join('')}</select></label>
        <div class="row" style="margin-top:0">
          <label class="field" style="flex:1;min-width:140px"><span>처방받은 날</span><input type="date" data-scan-field="date" value="${esc(r.date)}" max="${today()}"></label>
          <label class="field" style="flex:1;min-width:120px"><span>며칠 치</span><input type="number" data-scan-field="days" value="${esc(r.days)}" min="1" max="365" inputmode="numeric" placeholder="예: 30"></label>
        </div>
        <label class="field"><span>병원</span><input data-scan-field="hospital" value="${esc(r.hospital)}" placeholder="예: 튼튼내과의원" autocomplete="off"></label>
        <p class="hint">약마다 먹는 법이 다르면, 저장한 뒤 💊 내 약에서 약별로 고칠 수 있어요.</p>
      </div>
      <button class="btn green huge full" data-act="scan-save" ${n ? '' : 'disabled'}>✅ 맞아요, ${n}개 저장</button>
      <label class="btn full">📷 다시 찍기${photoInput('scan-photo')}</label>
      <details class="card"><summary><b>읽은 글 전체 보기</b></summary><p class="muted" style="white-space:pre-wrap;margin-top:8px">${esc(r.lines.join('\n'))}</p></details>
    </div>`;
}

const normName = (n) => n.replace(/\s/g, '').toLowerCase();

function saveScan() {
  const r = scan.r;
  const hospitalId = r.hospital.trim() ? addHospital(r.hospital.trim()) : '';
  let added = 0, updated = 0;
  for (const d of r.drugs) {
    const name = d.name.trim();
    if (!d.on || !name) continue;
    const fields = { times: [...r.times], timing: r.timing, hospitalId, start: r.date, days: r.days, photoId: scan.photoId, stopped: false };
    // 같은 약을 다시 받아 온 것이면 새로 만들지 않고 날짜·사진만 새로
    const same = state.meds.find((m) => normName(m.name) === normName(name));
    if (same) { Object.assign(same, fields, { times: r.times.length ? fields.times : same.times, timing: r.timing || same.timing }); updated++; }
    else { state.meds.push({ id: uid(), name, dose: '', ...fields }); added++; }
  }
  save();
  return [added, updated];
}

/* ---------- ❓ 물어볼 것 ---------- */
function viewAsk() {
  const chosen = new Set(state.asks.map((a) => a.text));
  const custom = state.asks.filter((a) => !Object.values(QUESTIONS).flat().includes(a.text));
  return `${topbar('❓ 물어볼 것')}
    <div class="stack">
      <p class="muted">여쭤보고 싶은 것을 눌러 주세요. 다시 누르면 빠져요.</p>
      <div class="card">
        ${Object.entries(QUESTIONS).map(([cat, qs]) => `<p class="cat-title">${cat}</p><div class="picks">${qs.map((q) => `<button class="pick ${chosen.has(q) ? 'on' : ''}" data-act="ask-toggle" data-q="${esc(q)}">${esc(q)}</button>`).join('')}</div>`).join('')}
        <p class="cat-title">✏️ 직접 적기</p>
        ${custom.length ? `<div class="picks">${custom.map((a) => `<button class="pick on" data-act="ask-toggle" data-q="${esc(a.text)}">${esc(a.text)}</button>`).join('')}</div>` : ''}
        <div class="inline-add"><input id="ask-custom" placeholder="예: 무릎 주사 맞아도 돼요?" autocomplete="off"><button class="btn" data-act="ask-add">넣기</button></div>
      </div>
      ${state.asks.length ? `<button class="btn blue huge full" data-act="go" data-to="show">🩺 ${state.asks.length}개 골랐어요 · 보여 드리기</button>
        <button class="btn full" data-act="ask-clear">모두 지우기</button>` : ''}
    </div>`;
}

/* ---------- 📋 병원 다녀왔어요 (버튼 4번) ---------- */
let wiz = null;
const newWiz = (appt) => ({
  step: 1, apptId: appt?.id || '', date: appt?.date || today(), hospitalId: appt?.hospitalId || '', newHospital: '',
  results: [], memo: '', next: '', nextPick: false, photos: [], cal: null,
});

// 큰 글씨 달력 (폰 기본 날짜 창이 안 뜨는 경우가 있어 직접 그림)
function calendar(cal, selected, min, max) {
  const [y, m] = cal.month.split('-').map(Number);
  const startDow = new Date(y, m - 1, 1).getDay();
  const last = new Date(y, m, 0).getDate();
  const prevOk = !min || cal.month > min.slice(0, 7);
  const nextOk = !max || cal.month < max.slice(0, 7);
  const cells = [];
  for (let i = 0; i < startDow; i++) cells.push('<span></span>');
  for (let d = 1; d <= last; d++) {
    const v = `${y}-${pad(m)}-${pad(d)}`;
    const off = (min && v < min) || (max && v > max);
    const dow = (startDow + d - 1) % 7;
    cells.push(`<button class="cal-day ${v === selected ? 'sel' : ''} ${v === today() ? 'today' : ''} ${dow === 0 ? 'sun' : ''}" data-act="cal-day" data-v="${v}" ${off ? 'disabled' : ''}>${d}</button>`);
  }
  return `<div class="calendar">
    <div class="cal-head">
      <button class="btn sm" data-act="cal-nav" data-d="-1" ${prevOk ? '' : 'disabled'} aria-label="이전 달">◀</button>
      <b>${y}년 ${m}월</b>
      <button class="btn sm" data-act="cal-nav" data-d="1" ${nextOk ? '' : 'disabled'} aria-label="다음 달">▶</button>
    </div>
    <div class="cal-grid">${DAYS.map((d, i) => `<span class="cal-dow ${i === 0 ? 'sun' : ''}">${d}</span>`).join('')}${cells.join('')}</div>
    <button class="btn full sm" style="margin-top:8px" data-act="cal-close">닫기</button>
  </div>`;
}

function viewVisit() {
  if (!wiz) wiz = newWiz();
  const w = wiz;
  const bar = `<div class="step-bar">${[1, 2, 3].map((n) => `<i class="${n <= w.step ? 'on' : ''}"></i>`).join('')}</div>`;
  let body = '';
  if (w.step === 1) {
    const yest = addDays(today(), -1);
    body = `<p class="q-title">1. 어느 병원 다녀오셨어요?</p>
      <div class="picks">${state.hospitals.map((h) => `<button class="pick big ${w.hospitalId === h.id ? 'on' : ''}" data-act="w-hosp" data-id="${h.id}">${esc(h.name)}</button>`).join('')}
        <button class="pick big ${w.hospitalId === '__new' ? 'on' : ''}" data-act="w-hosp" data-id="__new">다른 곳</button></div>
      ${w.hospitalId === '__new' ? `<input id="w-new-hosp" style="margin-top:10px" value="${esc(w.newHospital)}" placeholder="병원 이름 (예: 튼튼정형외과)" autocomplete="off">` : ''}
      <p class="cat-title">언제요?</p>
      <div class="picks">
        <button class="pick ${w.date === today() ? 'on' : ''}" data-act="w-date" data-v="${today()}">오늘</button>
        <button class="pick ${w.date === yest ? 'on' : ''}" data-act="w-date" data-v="${yest}">어제</button>
        ${w.date !== today() && w.date !== yest ? `<button class="pick on">${niceDate(w.date)}</button>` : ''}
        <button class="pick" data-act="cal-open" data-for="date">📅 다른 날</button>
      </div>
      ${w.cal?.for === 'date' ? calendar(w.cal, w.date, addDays(today(), -365 * 2), today()) : ''}`;
  } else if (w.step === 2) {
    body = `<p class="q-title">2. 의사 선생님이 뭐라고 하셨어요?</p><p class="muted" style="margin:-8px 0 12px">여러 개 골라도 돼요.</p>
      <div class="picks">${RESULTS.map((r) => `<button class="pick big ${w.results.includes(r) ? 'on' : ''}" data-act="w-result" data-v="${r}">${r}</button>`).join('')}</div>
      <label class="field"><span>한 줄 메모 (안 적어도 돼요)</span><input id="w-memo" value="${esc(w.memo)}" placeholder="예: 짜게 먹지 말래요" autocomplete="off"></label>`;
  } else if (w.step === 3) {
    body = `<p class="q-title">3. 다음에 언제 오래요?</p>
      <div class="picks">${NEXTS.map(([label, n]) => { const d = addDays(w.date, n); return `<button class="pick big ${w.next === d && !w.nextPick ? 'on' : ''}" data-act="w-next" data-v="${d}">${label}</button>`; }).join('')}
        <button class="pick big ${w.next === 'none' ? 'on' : ''}" data-act="w-next" data-v="none">안 와도 된대요</button>
        <button class="pick big ${w.nextPick ? 'on' : ''}" data-act="cal-open" data-for="next">📅 ${w.nextPick && w.next ? niceDate(w.next) : '날짜 고르기'}</button>
      </div>
      ${w.cal?.for === 'next' ? calendar(w.cal, w.nextPick ? w.next : '', today(), addDays(today(), 365 * 2)) : ''}
      ${w.next && w.next !== 'none' ? `<p class="muted" style="margin-top:12px">📅 ${fullDate(w.next)}로 적어 둘게요.</p>` : ''}`;
  }
  const canNext = w.step === 1 ? w.hospitalId && (w.hospitalId !== '__new' || w.newHospital.trim()) : w.step === 2 ? w.results.length > 0 : !!w.next;
  return `${topbar('📋 병원 다녀왔어요')}
    <div class="card">${bar}${body}
      <div class="wizard-nav">
        ${w.step > 1 ? '<button class="btn" data-act="w-back">← 이전</button>' : ''}
        ${w.step < 3 ? `<button class="btn blue" data-act="w-next-step" ${canNext ? '' : 'disabled'}>다음 →</button>` : `<button class="btn green" data-act="w-save" ${canNext ? '' : 'disabled'}>저장</button>`}
      </div>
    </div>`;
}

function saveVisit() {
  const w = wiz;
  const hospitalId = w.hospitalId === '__new' ? addHospital(w.newHospital.trim()) : w.hospitalId;
  const visit = {
    id: uid(), date: w.date, hospitalId, results: w.results, memo: w.memo.trim(),
    next: w.next === 'none' ? '' : w.next, photos: w.photos,
    asked: state.asks.map((a) => a.text),
  };
  state.visits.push(visit);
  if (w.apptId) { const a = state.appts.find((x) => x.id === w.apptId); if (a) a.status = 'done'; }
  // 같은 병원의 지난 예약은 다녀온 것으로
  state.appts.forEach((a) => { if (a.status === 'planned' && a.hospitalId === hospitalId && a.date <= w.date) a.status = 'done'; });
  if (visit.next) state.appts.push({ id: uid(), date: visit.next, hospitalId, status: 'planned' });
  state.asks = []; // 오늘 물어볼 것은 기록으로 옮기고 비움
  save();
  return visit;
}

let lastVisit = null;
function viewVisitDone() {
  const v = lastVisit;
  if (!v) return viewHome();
  const changed = v.results.includes('약이 바뀌었어요');
  return `${topbar('📋 기록했어요')}
    <div class="stack">
      <div class="card ok"><p style="font-size:3rem;line-height:1.1">✅</p><h2>진료 기록을 저장했어요</h2>
        <p class="muted" style="margin-top:6px">${niceDate(v.date)} ${esc(hospitalName(v.hospitalId))}${v.next ? `<br>다음 진료: <b>${fullDate(v.next)}</b>` : ''}</p></div>
      ${changed ? `<div class="card warn"><h2>약이 바뀌었나요?</h2><p class="muted" style="margin-top:6px">내 약을 새로 정리해 두면 다음 진료 때 정확하게 보여 드릴 수 있어요.</p>
        ${v.photos.some((p) => p.kind === 'bag') ? '<button class="btn green full" style="margin-top:12px" data-act="scan-visit-bag">📷 찍어 둔 약 봉투로 자동 넣기</button>' : '<label class="btn green full" style="margin-top:12px">📷 약 봉투 찍어서 넣기' + photoInput('scan-photo') + '</label>'}
        <button class="btn full" style="margin-top:10px" data-act="med-from-visit">✏️ 직접 적어서 넣기</button>
        <button class="btn full" style="margin-top:10px" data-act="go" data-to="meds">안 먹는 약 정리하기</button></div>` : ''}
      <button class="btn huge full" data-act="go" data-to="home">처음으로</button>
    </div>`;
}

/* ---------- 🗓️ 진료 기록 ---------- */
function viewRecords() {
  const visits = [...state.visits].sort((a, b) => b.date.localeCompare(a.date));
  const appts = state.appts.filter((a) => a.status === 'planned').sort((a, b) => a.date.localeCompare(b.date));
  return `${topbar('🗓️ 진료 기록')}
    <div class="stack">
      <div class="card"><div class="card-head"><h2>📅 다음 진료 예약</h2></div>
        ${appts.length ? `<ul class="list">${appts.map((a) => `<li><div class="grow"><b>${niceDate(a.date)}</b> ${esc(hospitalName(a.hospitalId))}<div class="muted">${a.date >= today() ? dday(a.date) : '지난 예약'}</div></div><button class="btn sm danger" data-act="appt-del" data-id="${a.id}">지우기</button></li>`).join('')}</ul>` : '<p class="muted">잡힌 예약이 없어요.</p>'}
        <details style="margin-top:10px"><summary><b>＋ 예약 직접 넣기</b></summary>
          <label class="field"><span>병원</span><select id="ap-hosp">${state.hospitals.map((h) => `<option value="${h.id}">${esc(h.name)}</option>`).join('')}<option value="__new">＋ 새 병원</option></select></label>
          <input id="ap-hosp-new" placeholder="병원 이름" style="margin-top:8px" ${state.hospitals.length ? 'hidden' : ''}>
          <label class="field"><span>날짜</span><input type="date" id="ap-date" min="${today()}"></label>
          <button class="btn blue full" style="margin-top:12px" data-act="appt-add">예약 넣기</button>
        </details>
      </div>
      <button class="btn blue full" data-act="visit-new">📋 병원 다녀온 것 기록하기</button>
      <div class="card"><div class="card-head"><h2>지난 진료</h2></div>
        ${visits.length ? visits.map((v) => `<div class="visit">
          <div class="when">${fullDate(v.date)}</div>
          <div class="sub">${esc(hospitalName(v.hospitalId))}${v.next ? ` · 다음 ${niceDate(v.next)}` : ''}</div>
          <div class="tags" style="margin-top:6px">${v.results.map((r) => `<span class="tag blue">${esc(r)}</span>`).join('')}</div>
          ${v.memo ? `<p style="margin-top:6px">📝 ${esc(v.memo)}</p>` : ''}
          ${v.asked?.length ? `<p class="muted" style="margin-top:6px">여쭤본 것: ${v.asked.map(esc).join(' / ')}</p>` : ''}
          ${v.photos?.length ? `<div class="thumbs">${v.photos.map((p) => `<img class="thumb" data-photo="${p.id}" data-act="view" data-id="${p.id}" alt="${PHOTO_KINDS[p.kind] || '사진'}">`).join('')}</div>` : ''}
          <button class="btn sm danger" style="margin-top:8px" data-act="visit-del" data-id="${v.id}">이 기록 지우기</button>
        </div>`).join('') : '<p class="muted">아직 기록이 없어요. 병원에 다녀오면 <b>📋 병원 다녀왔어요</b>를 눌러 주세요.</p>'}
      </div>
    </div>`;
}

/* ---------- 🗂️ 내 병력 ---------- */
function viewHistory() {
  const p = state.profile;
  const tagList = (key, cls) => `<div class="tags" style="margin-top:8px">${state[key].map((t, i) => `<span class="tag ${cls}">${esc(t)}<button data-act="tag-del" data-key="${key}" data-i="${i}" aria-label="지우기">✕</button></span>`).join('') || '<span class="muted">없음</span>'}</div>`;
  return `${topbar('🗂️ 내 병력')}
    <div class="stack">
      <p class="muted">가족이 한 번 채워 두면 진료실 화면에 자동으로 나와요. 적는 즉시 저장돼요.</p>
      <div class="card"><h2>👤 기본 정보</h2>
        <label class="field"><span>이름</span><input data-bind="profile.name" value="${esc(p.name)}" placeholder="예: 김순자" autocomplete="off"></label>
        <div class="row">
          <label class="field" style="flex:1;min-width:130px"><span>태어난 해</span><input type="number" data-bind="profile.birthYear" value="${esc(p.birthYear)}" placeholder="예: 1950" inputmode="numeric"></label>
          <label class="field" style="flex:1;min-width:110px"><span>성별</span><select data-bind="profile.sex">${['', '여', '남'].map((s) => `<option value="${s}" ${p.sex === s ? 'selected' : ''}>${s || '고르지 않음'}</option>`).join('')}</select></label>
        </div>
        <label class="field"><span>혈액형</span><input data-bind="profile.blood" value="${esc(p.blood)}" placeholder="예: A형 Rh+" autocomplete="off"></label>
      </div>
      <div class="card"><h2>⚠️ 알레르기</h2>${tagList('allergies', 'red')}
        <div class="inline-add"><input id="add-allergies" placeholder="예: 페니실린, 조영제" autocomplete="off"><button class="btn" data-act="tag-add" data-key="allergies">넣기</button></div></div>
      <div class="card"><h2>🩺 앓고 있는 병</h2>${tagList('conditions', 'blue')}
        <div class="inline-add"><input id="add-conditions" placeholder="예: 고혈압, 당뇨" autocomplete="off"><button class="btn" data-act="tag-add" data-key="conditions">넣기</button></div></div>
      <div class="card"><h2>🏥 수술·시술 이력</h2>
        ${state.surgeries.length ? `<ul class="list">${state.surgeries.map((s) => `<li><div class="grow"><b>${esc(s.year)}</b> ${esc(s.what)} <span class="muted">${esc(s.hospital)}</span></div><button class="btn sm danger" data-act="surg-del" data-id="${s.id}">지우기</button></li>`).join('')}</ul>` : '<p class="muted" style="margin-top:6px">없음</p>'}
        <div class="row" style="margin-top:10px">
          <input id="s-year" type="number" inputmode="numeric" placeholder="연도 (예: 2019)" style="flex:1;min-width:120px">
          <input id="s-what" placeholder="무엇 (예: 백내장 수술)" style="flex:2;min-width:160px">
        </div>
        <input id="s-hosp" placeholder="병원 (안 적어도 돼요)" style="margin-top:8px">
        <button class="btn full" style="margin-top:10px" data-act="surg-add">＋ 넣기</button>
        <details class="find-help"><summary>🔍 수술 이력이 기억나지 않으면 어디서 찾나요?</summary>
          <ul class="steps-ko">
            <li><b>수술받은 병원 원무과</b>: "진료기록 사본"이나 "수술기록지"를 떼 달라고 하면 돼요. 본인은 신분증만, 가족이 대신 갈 때는 위임장과 가족관계증명서가 필요해요.</li>
            <li><b>국민건강보험공단 "The건강보험" 앱·누리집</b>: 본인 인증 후 진료 내역을 보면, 언제 어느 병원에 입원·진료했는지 나와요.</li>
            <li><b>건강보험심사평가원 "건강e음" 앱·누리집</b>: "내 진료정보 열람"에서 진료 받은 병원과 받은 약을 볼 수 있어요.</li>
            <li><b>실손보험 청구 내역</b>: 보험사 앱에서 예전에 청구한 수술·입원 기록을 볼 수 있어요.</li>
          </ul>
          <p class="hint">앱 메뉴 이름은 바뀔 수 있어요. 막히면 공단 고객센터(1577-1000)에 전화로 물어보세요.</p>
        </details></div>
      <div class="card"><h2>🏥 자주 가는 병원</h2>
        ${state.hospitals.length ? `<ul class="list">${state.hospitals.map((h) => `<li><div class="grow"><b>${esc(h.name)}</b> <span class="muted">${esc(h.dept)}</span>${h.phone ? `<div><a href="tel:${cleanPhone(h.phone)}">📞 ${esc(h.phone)}</a></div>` : ''}</div><button class="btn sm danger" data-act="hosp-del" data-id="${h.id}">지우기</button></li>`).join('')}</ul>` : '<p class="muted" style="margin-top:6px">없음</p>'}
        <div class="row" style="margin-top:10px">
          <input id="h-name" placeholder="병원 이름" style="flex:2;min-width:160px">
          <input id="h-dept" placeholder="과 (예: 내과)" style="flex:1;min-width:110px">
        </div>
        <input id="h-phone" type="tel" placeholder="전화번호 (안 적어도 돼요)" style="margin-top:8px">
        <button class="btn full" style="margin-top:10px" data-act="hosp-add">＋ 넣기</button>
        <p class="hint">여기 넣은 병원이 "병원 다녀왔어요"에서 버튼으로 나와요.</p></div>
      <div class="card"><h2>🔬 검사 결과지·서류 사진</h2>
        ${state.docs.length ? `<div class="thumbs">${state.docs.map((d) => `<div class="doc-item"><img class="thumb" data-photo="${d.photoId}" data-act="view" data-id="${d.photoId}" alt="${esc(d.label)}"><div class="muted" style="font-size:.75rem">${d.date.slice(2).replace(/-/g, '.')}</div><button class="btn sm danger" data-act="doc-del" data-id="${d.id}">지우기</button></div>`).join('')}</div>` : '<p class="muted" style="margin-top:6px">건강검진 결과, 피검사 결과지 등을 찍어 두세요.</p>'}
        <label class="btn full" style="margin-top:10px">📷 서류 찍기${photoInput('doc-photo')}</label></div>
    </div>`;
}

/* ---------- ⚙️ 설정 ---------- */
let installPrompt = null;
window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); installPrompt = e; if (route === 'settings') render(); });
window.addEventListener('appinstalled', () => { installPrompt = null; toast('📲 홈 화면에 설치됐어요'); if (route === 'settings') render(); });
const isStandalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;

function installView() {
  if (isStandalone()) return '<p class="muted" style="margin-top:6px">✅ 앱으로 설치돼 있어요.</p>';
  if (installPrompt) return `<p class="muted" style="margin-top:6px">홈 화면에 아이콘이 생기고 앱처럼 열려요.</p><button class="btn green huge full" style="margin-top:12px" data-act="install">📲 홈 화면에 설치</button>`;
  if (isIOS) return `<p class="muted" style="margin-top:6px"><b>아이폰은 꼭 설치해 주세요.</b> 설치하지 않으면 한동안 안 쓸 때 기록이 지워질 수 있어요.</p>
    <ol class="steps-ko"><li>사파리 아래 <b>공유 버튼</b>(네모에 위 화살표)</li><li><b>홈 화면에 추가</b></li><li>오른쪽 위 <b>추가</b></li></ol>`;
  return '<p class="muted" style="margin-top:6px">크롬 오른쪽 위 <b>⋮ 메뉴</b> → <b>앱 설치</b> 또는 <b>홈 화면에 추가</b>를 눌러 주세요.</p>';
}

function viewSettings() {
  return `${topbar('⚙️ 설정')}
    <div class="stack">
      <div class="card privacy-card"><h2>🔒 내 정보는 어디에 있나요?</h2>
        <ul class="steps-ko">
          <li>약, 병력, 사진은 <b>이 폰 안에만</b> 저장돼요.</li>
          <li>인터넷으로 어디에도 보내지 않아요. 만든 사람도 볼 수 없어요.</li>
          <li>약 봉투 글자 읽기도 <b>폰 안에서</b> 해요. 처음 한 번만 글자 읽기 도구를 인터넷에서 받아요. 사진은 보내지 않아요.</li>
          <li>이 앱 주소를 다른 사람에게 알려 줘도, 그 사람에게는 <b>빈 앱</b>이 열려요.</li>
          <li>폰을 잃어버리면 보일 수 있으니 <b>폰 화면 잠금</b>을 꼭 걸어 두세요.</li>
        </ul></div>
      <div class="card"><h2>📲 앱처럼 설치하기</h2>${installView()}</div>
      <div class="card"><h2>🔠 글자 크기</h2>
        <div class="size-pick">${[1, 2, 3].map((n) => `<button class="pick ${state.size === n ? 'on' : ''}" data-act="size" data-n="${n}">${['크게', '더 크게', '아주 크게'][n - 1]}</button>`).join('')}</div></div>
      <div class="card"><h2>💾 백업</h2>
        <p class="muted" style="margin-top:6px">기록은 이 폰에만 저장돼요. 가끔 내보내서 가족 폰이나 카톡에 보관해 두세요. 폰을 바꾸면 새 폰에서 가져오기를 누르세요. (사진도 함께 들어가요)</p>
        <p class="warn-line">⚠️ 백업 파일에는 건강 정보가 모두 들어 있어요. <b>가족에게만</b> 보내세요.</p>
        <div class="row" style="margin-top:12px">
          <button class="btn" data-act="export">⬇️ 내보내기</button>
          <label class="btn">⬆️ 가져오기<input type="file" accept="application/json,.json" data-act="import" hidden></label>
        </div></div>
      <div class="card"><h2>🧹 모두 지우기</h2><p class="muted" style="margin-top:6px">모든 기록과 사진을 지워요. 되돌릴 수 없어요.</p>
        <button class="btn danger" style="margin-top:10px" data-act="reset">모두 지우기</button></div>
      <p class="notice">진료실 도우미는 기록을 보여 주는 도구예요. 진단이나 처방을 대신하지 않아요. 모든 기록은 이 폰에만 있어요.</p>
    </div>`;
}

/* ---------- 사진 크게 보기 ---------- */
async function openViewer(id) {
  const u = await photoUrl(id);
  if (!u) return;
  const v = document.createElement('div');
  v.id = 'viewer';
  v.innerHTML = `<div class="v-bar"><button class="btn" data-act="v-zoom">🔍 크게/작게</button><button class="btn" data-act="v-close">✕ 닫기</button></div><div class="v-img"><img src="${u}" alt="사진"></div>`;
  document.body.appendChild(v);
}

/* ---------- 라우팅 ---------- */
const VIEWS = { home: viewHome, show: viewShow, meds: viewMeds, med: viewMedEdit, scan: viewScan, ask: viewAsk, visit: viewVisit, done: viewVisitDone, records: viewRecords, history: viewHistory, settings: viewSettings };
let route = 'home';

function render() {
  document.documentElement.dataset.size = state.size;
  $('#app').innerHTML = VIEWS[route]();
  fillPhotos();
}

// 주소(#)로 화면을 바꿔서 폰의 '뒤로' 버튼이 앱 안에서 동작하게 함
function go(to) {
  const hash = to === 'home' ? '' : '#' + to;
  if (location.hash === hash || (!hash && !location.hash)) applyRoute();
  else location.hash = hash;
}
function applyRoute() {
  let to = location.hash.slice(1);
  if (!VIEWS[to]) to = 'home';
  if ((to === 'med' && !medDraft) || (to === 'done' && !lastVisit) || (to === 'scan' && !scan.status)) to = 'home'; // 새로고침하면 작성 중 화면은 처음으로
  if (to === 'visit' && !wiz) wiz = newWiz();
  route = to;
  render();
  window.scrollTo(0, 0);
}
window.addEventListener('hashchange', applyRoute);

/* ---------- 이벤트 ---------- */
document.addEventListener('click', async (ev) => {
  const el = ev.target.closest('[data-act]');
  if (!el || (el.matches('input, select') && el.type !== 'checkbox')) return;
  const id = el.dataset.id;
  switch (el.dataset.act) {
    case 'go': return go(el.dataset.to);
    case 'print': return window.print();
    case 'view': return openViewer(id);
    case 'v-close': return $('#viewer')?.remove();
    case 'v-zoom': return $('#viewer')?.classList.toggle('zoom');

    // 약
    case 'med-new': medDraft = { id: uid(), name: '', dose: '', times: [], timing: '', hospitalId: '', start: today(), days: '', photoId: '', stopped: false }; return go('med');
    case 'med-edit': medDraft = structuredClone(state.meds.find((m) => m.id === id)); return go('med');
    case 'med-time': {
      readMedForm();
      const t = el.dataset.v;
      medDraft.times = medDraft.times.includes(t) ? medDraft.times.filter((x) => x !== t) : [...medDraft.times, t];
      return render();
    }
    case 'med-save': {
      readMedForm();
      if (!medDraft.name) { toast('약 이름을 적어 주세요'); $('#m-name').focus(); return; }
      const i = state.meds.findIndex((m) => m.id === medDraft.id);
      if (i >= 0) state.meds[i] = medDraft; else state.meds.push(medDraft);
      save(); medDraft = null; toast('💊 저장했어요');
      return history.back();
    }
    case 'med-stop': readMedForm(); medDraft.stopped = !medDraft.stopped; { const i = state.meds.findIndex((m) => m.id === medDraft.id); state.meds[i] = medDraft; } save(); toast(medDraft.stopped ? '그만 먹는 약으로 옮겼어요' : '다시 먹는 약으로 옮겼어요'); medDraft = null; return history.back();
    case 'med-del':
      if (!confirm('이 약을 지울까요?')) return;
      if (!state.visits.some((v) => v.photos?.some((p) => p.id === medDraft.photoId))) delPhoto(medDraft.photoId);
      state.meds = state.meds.filter((m) => m.id !== medDraft.id); save(); medDraft = null; return history.back();
    case 'med-from-visit': {
      const v = lastVisit;
      const bag = v.photos.find((p) => p.kind === 'bag');
      medDraft = { id: uid(), name: '', dose: '', times: [], timing: '', hospitalId: v.hospitalId, start: v.date, days: '', photoId: bag?.id || '', stopped: false };
      return go('med');
    }

    // 약 봉투 읽기
    case 'scan-on': readScanForm(); scan.r.drugs[Number(el.dataset.i)].on = el.checked; return render();
    case 'scan-time': { readScanForm(); const t = el.dataset.v; const r = scan.r; r.times = r.times.includes(t) ? r.times.filter((x) => x !== t) : [...r.times, t]; return render(); }
    case 'scan-add': { readScanForm(); const t = $('#scan-add').value.trim(); if (!t) return; scan.r.drugs.push({ name: t, on: true }); return render(); }
    case 'scan-save': {
      readScanForm();
      const [a, u] = saveScan();
      scan.status = '';
      toast(`💊 ${a ? `${a}개 넣었어요` : ''}${a && u ? ', ' : ''}${u ? `${u}개는 새로 받은 걸로 바꿨어요` : ''}`);
      location.replace('#meds');
      return;
    }
    case 'scan-manual':
      medDraft = { id: uid(), name: '', dose: '', times: [], timing: '', hospitalId: '', start: today(), days: '', photoId: scan.photoId, stopped: false };
      scan.status = '';
      return go('med');
    case 'scan-visit-bag': {
      const bag = lastVisit?.photos.find((p) => p.kind === 'bag');
      const blob = bag && await getPhoto(bag.id);
      if (!blob) return;
      await startScan(blob, bag.id);
      if (scan.r) { if (!scan.r.hospital) scan.r.hospital = hospitalName(lastVisit.hospitalId); scan.r.date = lastVisit.date; render(); }
      return;
    }

    // 물어볼 것
    case 'ask-toggle': {
      const q = el.dataset.q;
      if (state.asks.some((a) => a.text === q)) state.asks = state.asks.filter((a) => a.text !== q);
      else state.asks.push({ id: uid(), text: q, answered: false });
      save(); return render();
    }
    case 'ask-add': {
      const t = $('#ask-custom').value.trim();
      if (!t) return;
      if (!state.asks.some((a) => a.text === t)) state.asks.push({ id: uid(), text: t, answered: false });
      save(); return render();
    }
    case 'ask-clear': if (!confirm('고른 질문을 모두 지울까요?')) return; state.asks = []; save(); return render();
    case 'ask-answered': { const a = state.asks.find((x) => x.id === id); if (a) { a.answered = el.checked; save(); el.closest('.ask-item').classList.toggle('done', a.answered); } return; }

    // 병원 다녀왔어요
    case 'visit-new': wiz = newWiz(); return go('visit');
    case 'visit-from-appt': wiz = newWiz(state.appts.find((a) => a.id === id)); return go('visit');
    case 'appt-missed': {
      const a = state.appts.find((x) => x.id === id);
      if (a) a.status = 'missed';
      save(); render();
      const h = hospital(a?.hospitalId);
      toast(h?.phone ? '병원에 전화해서 다시 예약해 주세요' : '다시 예약하면 진료 기록에서 넣어 주세요');
      return;
    }
    case 'w-hosp': wiz.hospitalId = id; render(); if (id === '__new') $('#w-new-hosp')?.focus(); return;
    case 'w-date': wiz.date = el.dataset.v; wiz.cal = null; return render();
    case 'cal-open': {
      if ($('#w-memo')) wiz.memo = $('#w-memo').value;
      const f = el.dataset.for;
      if (wiz.cal?.for === f) { wiz.cal = null; return render(); }
      const base = f === 'date' ? wiz.date : (wiz.nextPick && wiz.next) || addDays(today(), 7);
      wiz.cal = { for: f, month: base.slice(0, 7) };
      render();
      $('.calendar')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      return;
    }
    case 'cal-nav': {
      const [y, m] = wiz.cal.month.split('-').map(Number);
      const d = new Date(y, m - 1 + Number(el.dataset.d), 1);
      wiz.cal.month = `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
      return render();
    }
    case 'cal-day':
      if (wiz.cal.for === 'date') wiz.date = el.dataset.v;
      else { wiz.next = el.dataset.v; wiz.nextPick = true; }
      wiz.cal = null;
      return render();
    case 'cal-close': wiz.cal = null; return render();
    case 'w-result': { const r = el.dataset.v; wiz.results = wiz.results.includes(r) ? wiz.results.filter((x) => x !== r) : [...wiz.results, r]; wiz.memo = $('#w-memo')?.value || wiz.memo; return render(); }
    case 'w-next': wiz.next = el.dataset.v; wiz.nextPick = false; wiz.cal = null; return render();
    case 'w-back': if ($('#w-memo')) wiz.memo = $('#w-memo').value; wiz.step -= 1; wiz.cal = null; return render();
    case 'w-next-step':
      if ($('#w-memo')) wiz.memo = $('#w-memo').value;
      if ($('#w-new-hosp')) wiz.newHospital = $('#w-new-hosp').value;
      wiz.step += 1; wiz.cal = null; return render();
    case 'w-save': lastVisit = saveVisit(); wiz = null; toast('📋 저장했어요'); return go('done');

    // 진료 기록
    case 'appt-add': {
      let h = $('#ap-hosp')?.value || '__new';
      const date = $('#ap-date').value;
      if (h === '__new') { const n = $('#ap-hosp-new').value.trim(); if (!n) { toast('병원 이름을 적어 주세요'); return; } h = addHospital(n); }
      if (!date) { toast('날짜를 골라 주세요'); return; }
      state.appts.push({ id: uid(), date, hospitalId: h, status: 'planned' }); save(); toast('📅 예약을 넣었어요'); return render();
    }
    case 'appt-del': state.appts = state.appts.filter((a) => a.id !== id); save(); return render();
    case 'visit-del': {
      if (!confirm('이 진료 기록을 지울까요? 사진도 함께 지워져요.')) return;
      const v = state.visits.find((x) => x.id === id);
      v?.photos?.forEach((p) => { if (!state.meds.some((m) => m.photoId === p.id)) delPhoto(p.id); });
      state.visits = state.visits.filter((x) => x.id !== id); save(); return render();
    }

    // 내 병력
    case 'tag-add': {
      const key = el.dataset.key;
      const input = $('#add-' + key);
      const vals = input.value.split(/[,，]/).map((x) => x.trim()).filter(Boolean);
      if (!vals.length) return;
      vals.forEach((x) => { if (!state[key].includes(x)) state[key].push(x); });
      save(); render(); $('#add-' + key)?.focus(); return;
    }
    case 'tag-del': state[el.dataset.key].splice(Number(el.dataset.i), 1); save(); return render();
    case 'surg-add': {
      const what = $('#s-what').value.trim();
      if (!what) { toast('무슨 수술인지 적어 주세요'); return; }
      state.surgeries.push({ id: uid(), year: $('#s-year').value.trim(), what, hospital: $('#s-hosp').value.trim() });
      state.surgeries.sort((a, b) => String(a.year).localeCompare(String(b.year)));
      save(); return render();
    }
    case 'doc-del': {
      if (!confirm('이 사진을 지울까요?')) return;
      const d = state.docs.find((x) => x.id === id);
      if (d) { delPhoto(d.photoId); urlCache.delete(d.photoId); }
      state.docs = state.docs.filter((x) => x.id !== id);
      save(); toast('지웠어요'); return render();
    }
    case 'surg-del': state.surgeries = state.surgeries.filter((s) => s.id !== id); save(); return render();
    case 'hosp-add': {
      const name = $('#h-name').value.trim();
      if (!name) { toast('병원 이름을 적어 주세요'); return; }
      state.hospitals.push({ id: uid(), name, dept: $('#h-dept').value.trim(), phone: $('#h-phone').value.trim() });
      save(); return render();
    }
    case 'hosp-del': if (!confirm('이 병원을 목록에서 지울까요?')) return; state.hospitals = state.hospitals.filter((h) => h.id !== id); save(); return render();

    // 설정
    case 'size': state.size = Number(el.dataset.n); save(); return render();
    case 'install': if (!installPrompt) return; installPrompt.prompt(); await installPrompt.userChoice.catch(() => {}); installPrompt = null; return render();
    case 'export': return exportData();
    case 'reset':
      if (!confirm('정말 모든 기록과 사진을 지울까요? 되돌릴 수 없어요.')) return;
      state = defaultState(); save();
      await tx('readwrite', (s) => s.clear()).catch(() => {});
      urlCache.clear(); toast('모두 지웠어요'); return go('home');
    default:
  }
});

document.addEventListener('input', (ev) => {
  const el = ev.target;
  if (el.dataset.bind) {
    const [a, b] = el.dataset.bind.split('.');
    state[a][b] = el.value;
    save();
  }
  if (el.dataset.scanName !== undefined) {
    readScanForm();
    const n = scan.r.drugs.filter((d) => d.on && d.name.trim()).length;
    const btn = $('[data-act=scan-save]');
    if (btn) { btn.textContent = `✅ 맞아요, ${n}개 저장`; btn.disabled = !n; }
  }
  if (el.id === 'w-new-hosp') { wiz.newHospital = el.value; const btn = $('[data-act=w-next-step]'); if (btn) btn.disabled = !el.value.trim(); }
});

document.addEventListener('change', async (ev) => {
  const el = ev.target;
  const act = el.dataset.act;
  if (el.dataset.bind && el.tagName === 'SELECT') { const [a, b] = el.dataset.bind.split('.'); state[a][b] = el.value; save(); return; }
  if (el.id === 'm-hosp') { $('#m-hosp-new').hidden = el.value !== '__new'; if (el.value === '__new') $('#m-hosp-new').focus(); return; }
  if (el.id === 'ap-hosp') { $('#ap-hosp-new').hidden = el.value !== '__new'; return; }
  if (act === 'import') return importData(el.files[0]);
  if (act === 'scan-photo' && el.files[0]) return startScan(el.files[0]);
  if (['med-photo', 'doc-photo'].includes(act) && el.files[0]) {
    try {
      toast('사진을 저장하고 있어요…');
      const pid = await fileToPhoto(el.files[0]);
      if (act === 'med-photo') { readMedForm(); medDraft.photoId = pid; }
      if (act === 'doc-photo') { state.docs.push({ id: uid(), photoId: pid, label: '검사·서류', date: today() }); save(); }
      toast('📷 저장했어요');
      render();
    } catch (e) { toast('사진을 저장하지 못했어요. 폰 저장 공간을 확인해 주세요.'); }
  }
});

document.addEventListener('keydown', (ev) => {
  if (ev.key !== 'Enter' || ev.isComposing) return;
  const map = { 'ask-custom': 'ask-add', 'add-allergies': 'tag-add', 'add-conditions': 'tag-add' };
  const act = map[ev.target.id];
  if (act) { ev.preventDefault(); $(`[data-act="${act}"]${act === 'tag-add' ? `[data-key="${ev.target.id.slice(4)}"]` : ''}`)?.click(); }
});

// 확인 화면에서 고친 내용을 다시 그리기 전에 받아 둠
function readScanForm() {
  if (!scan.r) return;
  $$('[data-scan-name]').forEach((el) => { scan.r.drugs[Number(el.dataset.scanName)].name = el.value; });
  $$('[data-scan-field]').forEach((el) => { scan.r[el.dataset.scanField] = el.value; });
}

/* ---------- 백업 (사진 포함) ---------- */
const blobToDataUrl = (b) => new Promise((res) => { const r = new FileReader(); r.onload = () => res(r.result); r.readAsDataURL(b); });

async function exportData() {
  if (!confirm('이 백업 파일에는 약, 병력, 사진 등 건강 정보가 모두 들어 있어요.\n\n가족에게만 보내고, 단체방이나 모르는 사람에게는 보내지 마세요.\n\n내보낼까요?')) return;
  toast('백업 파일을 만들고 있어요…');
  const ids = new Set([...state.meds.map((m) => m.photoId), ...state.docs.map((d) => d.photoId), ...state.visits.flatMap((v) => (v.photos || []).map((p) => p.id))].filter(Boolean));
  const photos = {};
  for (const id of ids) { const b = await getPhoto(id).catch(() => null); if (b) photos[id] = await blobToDataUrl(b); }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([JSON.stringify({ app: 'clinic-helper', state, photos })], { type: 'application/json' }));
  a.download = `진료실도우미-백업-${today()}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

function importData(file) {
  if (!file) return;
  const r = new FileReader();
  r.onload = async () => {
    try {
      const d = JSON.parse(r.result);
      if (!d || d.app !== 'clinic-helper' || !d.state) throw new Error('bad');
      if (!confirm('지금 기록을 백업 파일 내용으로 바꿀까요?')) return;
      for (const [id, url] of Object.entries(d.photos || {})) {
        const blob = await (await fetch(url)).blob();
        await tx('readwrite', (s) => s.put(blob, id));
      }
      state = hydrate(d.state);
      save(); urlCache.clear(); render();
      toast('⬆️ 가져왔어요');
    } catch (e) { toast('이 파일은 읽을 수 없어요'); }
  };
  r.readAsText(file);
}

applyRoute();

// 오프라인에서도 열리도록 (https에서만 동작)
if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
