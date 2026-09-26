/* 약 봉투·복약안내문 사진 → 약 목록 (폰 안에서만 처리, 사진은 밖으로 나가지 않음) */

const OCR_URL = 'https://cdn.jsdelivr.net/npm/tesseract.js@7.0.0/dist/tesseract.min.js';

/* ---------- 글자 인식 ---------- */
let workerP = null;
function loadScript(src) {
  return new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = src;
    s.onload = res;
    s.onerror = () => { s.remove(); rej(new Error('load')); };
    document.head.appendChild(s);
  });
}

let onProgress = () => {};
function getWorker() {
  return (workerP ||= (async () => {
    if (!window.Tesseract) await loadScript(OCR_URL);
    return window.Tesseract.createWorker('kor', 1, { logger: (m) => onProgress(m) });
  })().catch((e) => { workerP = null; throw e; }));
}

// 사진을 돌리고, 글자가 잘 보이게 흑백·대비를 높여서 캔버스로
function prepare(img, deg, max = 2200) {
  const w = img.naturalWidth || img.width, h = img.naturalHeight || img.height;
  const k = Math.min(2.5, max / Math.max(w, h));
  const sw = Math.round(w * k), sh = Math.round(h * k);
  const c = document.createElement('canvas');
  const side = deg % 180 !== 0;
  c.width = side ? sh : sw;
  c.height = side ? sw : sh;
  const g = c.getContext('2d');
  g.filter = 'grayscale(1) contrast(1.35)';
  g.translate(c.width / 2, c.height / 2);
  g.rotate((deg * Math.PI) / 180);
  g.drawImage(img, -sw / 2, -sh / 2, sw, sh);
  return c;
}

// 한글이 얼마나 또렷하게 읽혔는지 점수 (방향이 맞으면 높음)
function score(data) {
  let s = 0;
  const words = (data.blocks || []).flatMap((b) => b.paragraphs || []).flatMap((p) => p.lines || []).flatMap((l) => l.words || []);
  for (const w of words) {
    const n = (w.text.match(/[가-힣]/g) || []).length;
    if (w.confidence > 60) s += n;
  }
  return s;
}

/**
 * 사진(Image)을 읽어서 글자를 돌려줌. 옆으로 눕거나 거꾸로 찍힌 사진도 방향을 찾아 읽음.
 * progress(0~1)로 진행 상황을 알려줌.
 */
export async function readImage(img, progress = () => {}) {
  let phase = 0;
  const phases = 2;
  onProgress = (m) => {
    if (m.status === 'recognizing text') progress(Math.min(0.99, (phase + (m.progress || 0)) / phases));
  };
  progress(0.02);
  const worker = await getWorker();
  // 1) 작게 줄여서 네 방향을 빠르게 비교
  let best = { deg: 0, s: -1 };
  const tried = [];
  for (const deg of [0, 90, 270, 180]) {
    const { data } = await worker.recognize(prepare(img, deg, 1100), {}, { text: true, blocks: true });
    const s = score(data);
    tried.push([deg, s]);
    if (s > best.s) best = { deg, s };
    progress(Math.min(0.45, 0.1 + 0.1 * tried.length));
    if (deg === 0 && s > 150) break; // 똑바로 찍힌 사진이 확실하면 바로 넘어감
  }
  window.__scanTried = tried;
  phase = 1;
  // 2) 맞는 방향으로 크게 읽기
  const { data } = await worker.recognize(prepare(img, best.deg));
  progress(1);
  return { text: data.text || '', deg: best.deg };
}

/* ---------- 글자 → 약 목록 ---------- */
const FORMS = '서방정|장용정|필름코팅정|구강붕해정|츄어블정|연질캡슐|경질캡슐|캡슐|시럽|현탁액|점안액|주사|패치|연고|크림|과립|액|산|정';
const UNIT = '밀리그램|마이크로그램|밀리리터|그램|mg|㎎|mcg|㎍|μg|g|ml|mL|㎖';
// 약 이름 + (용량). 이름 뒤에 한글이 바로 붙으면 약이 아님 (예: "정신", "액체")
const DRUG_RE = new RegExp(`([가-힣A-Za-z][가-힣A-Za-z0-9\\-·]{1,30}?(?:${FORMS}))(?![가-힣])\\s*(\\d[\\d.,]*\\s*(?:${UNIT}))?`, 'g');

// 글자 인식이 자주 틀리는 부분 바로잡기
function fixOcr(t) {
  return t
    .replace(/캡[슬술쑬솔글긁]|캅[슐슬]|갭[슐슬]/g, '캡슐')
    .replace(/밀리그(?!램)|밀리그럼|밀리그랩/g, '밀리그램')
    .replace(/마이크로그(?!램)/g, '마이크로그램')
    .replace(/서방[징점]/g, '서방정')
    .replace(/(\d)\s*[mM][gG]/g, '$1mg');
}
// 약 이름처럼 보여도 약이 아닌 말
const NOT_DRUG = /(약국|약사|약품명|약품사진|복약|안내|주의|조제|처방|의원|병원|교부|본인|부담|환자|성명|주소|전화|보험|금액|수납|약효|용법|용량|번호)/;

function tidy(text) {
  return fixOcr(text).split('\n')
    .map((l) => l.replace(/[|｜¦]/g, ' ').replace(/(?<=[가-힣]) (?=[가-힣](?:[ \n]|$))/g, '').replace(/\s{2,}/g, ' ').trim())
    .filter(Boolean);
}

// "…캡슐" / "25밀리그램" 처럼 두 줄로 나뉜 약 이름을 붙임
function joinBroken(lines) {
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    let l = lines[i];
    const next = lines[i + 1] || '';
    const endsForm = new RegExp(`(?:${FORMS})$`).test(l);
    const endsNum = /\d$/.test(l);
    if ((endsForm && new RegExp(`^\\d[\\d.,]*\\s*(?:${UNIT})`).test(next)) || (endsNum && new RegExp(`^(?:${UNIT})`).test(next))) {
      l += next;
      i++;
    }
    out.push(l);
  }
  return out;
}

const unitKo = (s) => s.replace(/밀리그램/g, 'mg').replace(/마이크로그램/g, 'mcg').replace(/밀리리터/g, 'mL').replace(/그램/g, 'g').replace(/\s+/g, '');

function cleanName(name) {
  return name
    .replace(/^[@#*※•·\-\s]+/, '')
    .replace(/^\([가-힣]{1,4}\)/, '') // 앞에 붙은 "(캡슐)" 같은 표시
    .replace(/^[@#*※•·\-\s]+/, '')
    .trim();
}


/**
 * 인식한 글자에서 약 이름, 병원, 날짜, 하루 몇 번, 며칠 치를 찾음.
 * 못 찾은 값은 비워 둠 (사람이 확인·수정).
 */
export function parseBag(text) {
  const lines = joinBroken(tidy(text));
  const all = lines.join('\n');
  const seen = new Set();
  const drugs = [];
  for (const line of lines) {
    for (const m of line.matchAll(DRUG_RE)) {
      const base = cleanName(m[1]);
      if (base.length < 3 || NOT_DRUG.test(base)) continue;
      // 용량이 없고 이름이 짧으면 일반 낱말일 가능성이 커서 뺌 (예: "안정")
      if (!m[2] && base.length < 4) continue;
      const name = m[2] ? `${base} ${unitKo(m[2])}` : base;
      const key = base.replace(/\s/g, '');
      if (seen.has(key)) continue;
      seen.add(key);
      drugs.push({ name, raw: line });
    }
  }

  const hosp = all.match(/([가-힣A-Za-z0-9]{2,20}(?:의원|병원|의료원|클리닉|보건소|한의원))/);
  const times = all.match(/1\s*일\s*([1-4])\s*회/);
  const days = all.match(/(\d{1,3})\s*일\s*분/) || all.match(/총\s*(\d{1,3})\s*일/);
  // 날짜: 조제일자 2026.09.17 / 2026-09-17 / 교부번호 20260917-0107
  let date = '';
  const d1 = all.match(/(20\d{2})\s*[.\-/년]\s*(\d{1,2})\s*[.\-/월]\s*(\d{1,2})/);
  const d2 = all.match(/(20\d{2})(\d{2})(\d{2})\s*-\s*\d{2,5}/);
  const d = d1 || d2;
  if (d) {
    const [y, mo, da] = [d[1], d[2].padStart(2, '0'), d[3].padStart(2, '0')];
    if (Number(mo) >= 1 && Number(mo) <= 12 && Number(da) >= 1 && Number(da) <= 31) date = `${y}-${mo}-${da}`;
  }

  return {
    drugs,
    hospital: hosp ? hosp[1] : '',
    date,
    perDay: times ? times[1] : '',   // "1일 3회" → '3'
    days: days ? String(Number(days[1])) : '',
    lines,
  };
}
