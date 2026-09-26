/* 진료실 도우미 — 병원에서 보여 줄 약·병력·물어볼 것을 폰 한 화면에. 서버·요금 없음 */

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
      <button class="btn green huge full" data-act="med-new">＋ 약 넣기</button>
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
  results: [], memo: '', next: '', nextPick: false, photos: [],
});

function viewVisit() {
  if (!wiz) wiz = newWiz();
  const w = wiz;
  const bar = `<div class="step-bar">${[1, 2, 3, 4].map((n) => `<i class="${n <= w.step ? 'on' : ''}"></i>`).join('')}</div>`;
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
        <label class="pick">다른 날<input type="date" data-act="w-date-pick" max="${today()}" style="position:absolute;opacity:0;width:1px;height:1px"></label>
      </div>`;
  } else if (w.step === 2) {
    body = `<p class="q-title">2. 의사 선생님이 뭐라고 하셨어요?</p><p class="muted" style="margin:-8px 0 12px">여러 개 골라도 돼요.</p>
      <div class="picks">${RESULTS.map((r) => `<button class="pick big ${w.results.includes(r) ? 'on' : ''}" data-act="w-result" data-v="${r}">${r}</button>`).join('')}</div>
      <label class="field"><span>한 줄 메모 (안 적어도 돼요)</span><input id="w-memo" value="${esc(w.memo)}" placeholder="예: 짜게 먹지 말래요" autocomplete="off"></label>`;
  } else if (w.step === 3) {
    body = `<p class="q-title">3. 다음에 언제 오래요?</p>
      <div class="picks">${NEXTS.map(([label, n]) => { const d = addDays(w.date, n); return `<button class="pick big ${w.next === d && !w.nextPick ? 'on' : ''}" data-act="w-next" data-v="${d}">${label}</button>`; }).join('')}
        <button class="pick big ${w.next === 'none' ? 'on' : ''}" data-act="w-next" data-v="none">안 와도 된대요</button>
        <label class="pick big ${w.nextPick ? 'on' : ''}" style="position:relative">${w.nextPick && w.next ? niceDate(w.next) : '날짜 고르기'}<input type="date" data-act="w-next-pick" min="${today()}" style="position:absolute;opacity:0;width:1px;height:1px"></label>
      </div>
      ${w.next && w.next !== 'none' ? `<p class="muted" style="margin-top:12px">📅 ${fullDate(w.next)}로 적어 둘게요.</p>` : ''}`;
  } else {
    body = `<p class="q-title">4. 받아 온 종이가 있으면 찍어 주세요</p><p class="muted" style="margin:-8px 0 12px">없으면 그냥 <b>저장</b>을 누르세요.</p>
      <div class="picks">${Object.entries(PHOTO_KINDS).slice(0, 3).map(([k, label]) => `<label class="pick big">${label}${photoInput('w-photo', `data-kind="${k}"`)}</label>`).join('')}</div>
      ${w.photos.length ? `<div class="thumbs" style="margin-top:12px">${w.photos.map((p) => `<img class="thumb" data-photo="${p.id}" data-act="view" data-id="${p.id}" alt="${PHOTO_KINDS[p.kind]}">`).join('')}</div>` : ''}`;
  }
  const canNext = w.step === 1 ? w.hospitalId && (w.hospitalId !== '__new' || w.newHospital.trim()) : w.step === 2 ? w.results.length > 0 : w.step === 3 ? !!w.next : true;
  return `${topbar('📋 병원 다녀왔어요')}
    <div class="card">${bar}${body}
      <div class="wizard-nav">
        ${w.step > 1 ? '<button class="btn" data-act="w-back">← 이전</button>' : ''}
        ${w.step < 4 ? `<button class="btn blue" data-act="w-next-step" ${canNext ? '' : 'disabled'}>다음 →</button>` : '<button class="btn green" data-act="w-save">저장</button>'}
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
        <button class="btn green full" style="margin-top:12px" data-act="med-from-visit">💊 새 약 넣기</button>
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
        <button class="btn full" style="margin-top:10px" data-act="surg-add">＋ 넣기</button></div>
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
        ${state.docs.length ? `<div class="thumbs">${state.docs.map((d) => `<div style="text-align:center"><img class="thumb" data-photo="${d.photoId}" data-act="view" data-id="${d.photoId}" alt="${esc(d.label)}"><div class="muted" style="font-size:.75rem">${d.date.slice(2).replace(/-/g, '.')}</div></div>`).join('')}</div>` : '<p class="muted" style="margin-top:6px">건강검진 결과, 피검사 결과지 등을 찍어 두세요.</p>'}
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
      <div class="card"><h2>📲 앱처럼 설치하기</h2>${installView()}</div>
      <div class="card"><h2>🔠 글자 크기</h2>
        <div class="size-pick">${[1, 2, 3].map((n) => `<button class="pick ${state.size === n ? 'on' : ''}" data-act="size" data-n="${n}">${['크게', '더 크게', '아주 크게'][n - 1]}</button>`).join('')}</div></div>
      <div class="card"><h2>💾 백업</h2>
        <p class="muted" style="margin-top:6px">기록은 이 폰에만 저장돼요. 가끔 내보내서 가족 폰이나 카톡에 보관해 두세요. 폰을 바꾸면 새 폰에서 가져오기를 누르세요. (사진도 함께 들어가요)</p>
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
const VIEWS = { home: viewHome, show: viewShow, meds: viewMeds, med: viewMedEdit, ask: viewAsk, visit: viewVisit, done: viewVisitDone, records: viewRecords, history: viewHistory, settings: viewSettings };
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
  if ((to === 'med' && !medDraft) || (to === 'done' && !lastVisit)) to = 'home'; // 새로고침하면 작성 중 화면은 처음으로
  if (to === 'visit' && !wiz) wiz = newWiz();
  route = to;
  render();
  window.scrollTo(0, 0);
}
window.addEventListener('hashchange', applyRoute);

/* ---------- 이벤트 ---------- */
document.addEventListener('click', async (ev) => {
  // 버튼처럼 생긴 '날짜 고르기'를 누르면 달력이 바로 열리게
  const dateLabel = ev.target.closest('label.pick');
  const dateInput = dateLabel?.querySelector('input[type=date]');
  if (dateInput && ev.target !== dateInput) { ev.preventDefault(); try { dateInput.showPicker(); } catch (e) { dateInput.focus(); } return; }
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
    case 'w-date': wiz.date = el.dataset.v; return render();
    case 'w-result': { const r = el.dataset.v; wiz.results = wiz.results.includes(r) ? wiz.results.filter((x) => x !== r) : [...wiz.results, r]; wiz.memo = $('#w-memo')?.value || wiz.memo; return render(); }
    case 'w-next': wiz.next = el.dataset.v; wiz.nextPick = false; return render();
    case 'w-back': if ($('#w-memo')) wiz.memo = $('#w-memo').value; wiz.step -= 1; return render();
    case 'w-next-step':
      if ($('#w-memo')) wiz.memo = $('#w-memo').value;
      if ($('#w-new-hosp')) wiz.newHospital = $('#w-new-hosp').value;
      wiz.step += 1; return render();
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
  if (el.id === 'w-new-hosp') { wiz.newHospital = el.value; const btn = $('[data-act=w-next-step]'); if (btn) btn.disabled = !el.value.trim(); }
});

document.addEventListener('change', async (ev) => {
  const el = ev.target;
  const act = el.dataset.act;
  if (el.dataset.bind && el.tagName === 'SELECT') { const [a, b] = el.dataset.bind.split('.'); state[a][b] = el.value; save(); return; }
  if (el.id === 'm-hosp') { $('#m-hosp-new').hidden = el.value !== '__new'; if (el.value === '__new') $('#m-hosp-new').focus(); return; }
  if (el.id === 'ap-hosp') { $('#ap-hosp-new').hidden = el.value !== '__new'; return; }
  if (act === 'w-date-pick' && el.value) { wiz.date = el.value; return render(); }
  if (act === 'w-next-pick' && el.value) { wiz.next = el.value; wiz.nextPick = true; return render(); }
  if (act === 'import') return importData(el.files[0]);
  if (['med-photo', 'w-photo', 'doc-photo'].includes(act) && el.files[0]) {
    try {
      toast('사진을 저장하고 있어요…');
      const pid = await fileToPhoto(el.files[0]);
      if (act === 'med-photo') { readMedForm(); medDraft.photoId = pid; }
      if (act === 'w-photo') wiz.photos.push({ id: pid, kind: el.dataset.kind });
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

/* ---------- 백업 (사진 포함) ---------- */
const blobToDataUrl = (b) => new Promise((res) => { const r = new FileReader(); r.onload = () => res(r.result); r.readAsDataURL(b); });

async function exportData() {
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
