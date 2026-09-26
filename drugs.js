/* 함께 먹을 때 주의할 약 — 폰 안에서만 확인 (참고용)
 *
 * 널리 알려진 위험 조합과 같은 성분·같은 종류 중복만 담았습니다.
 * 공식 병용금기 목록 전체가 아니므로, 경고가 없다고 안전하다는 뜻이 아닙니다.
 */

// 성분: 한글 이름, 종류(여러 개 가능), 상품명·다른 이름
// 종류: nsaid 소염진통제, anticoag 항응고제, antiplatelet 항혈소판제, benzo 신경안정제, zdrug 수면제,
//       opioid 마약성 진통제, nitrate 질산염 협심증약, pde5 발기부전약, acei, arb, ksparing 칼륨 보존 이뇨제,
//       ppi_c19 위산억제제(클로피도그렐 방해), ssri, snri, triptan 편두통약, statin3a, cyp3a_strong,
//       cyp2d6_strong, acet 아세트아미노펜
const INGREDIENTS = {
  // 진통·해열
  acetaminophen: { ko: '아세트아미노펜', kind: '해열진통제', cls: ['acet'], names: ['아세트아미노펜', '타이레놀', '타세놀', '게보린', '펜잘'] },
  ibuprofen: { ko: '이부프로펜', kind: '소염진통제', cls: ['nsaid'], names: ['이부프로펜', '부루펜', '애드빌', '이지엔'] },
  dexibuprofen: { ko: '덱시부프로펜', kind: '소염진통제', cls: ['nsaid'], names: ['덱시부프로펜', '맥시부펜'] },
  naproxen: { ko: '나프록센', kind: '소염진통제', cls: ['nsaid'], names: ['나프록센', '낙센'] },
  celecoxib: { ko: '셀레콕시브', kind: '소염진통제', cls: ['nsaid'], names: ['셀레콕시브', '쎄레브렉스', '세레브렉스'] },
  aceclofenac: { ko: '아세클로페낙', kind: '소염진통제', cls: ['nsaid'], names: ['아세클로페낙', '에어탈'] },
  meloxicam: { ko: '멜록시캄', kind: '소염진통제', cls: ['nsaid'], names: ['멜록시캄', '모빅'] },
  diclofenac: { ko: '디클로페낙', kind: '소염진통제', cls: ['nsaid'], names: ['디클로페낙', '볼타렌'] },
  loxoprofen: { ko: '록소프로펜', kind: '소염진통제', cls: ['nsaid'], names: ['록소프로펜', '록소닌'] },
  tramadol: { ko: '트라마돌', kind: '마약성 진통제', cls: ['opioid', 'serotonergic'], names: ['트라마돌', '트리돌'] },
  oxycodone: { ko: '옥시코돈', kind: '마약성 진통제', cls: ['opioid'], names: ['옥시코돈', '옥시콘틴', '타진'] },
  fentanyl: { ko: '펜타닐', kind: '마약성 진통제', cls: ['opioid'], names: ['펜타닐', '듀로제식'] },
  codeine: { ko: '코데인', kind: '마약성 진통·기침약', cls: ['opioid'], names: ['코데인'] },
  // 혈전
  aspirin: { ko: '아스피린', kind: '항혈소판제', cls: ['antiplatelet'], names: ['아스피린', '아스트릭스'] },
  clopidogrel: { ko: '클로피도그렐', kind: '항혈소판제', cls: ['antiplatelet', 'clopidogrel'], names: ['클로피도그렐', '플라빅스', '플래리스'] },
  ticagrelor: { ko: '티카그렐러', kind: '항혈소판제', cls: ['antiplatelet'], names: ['티카그렐러', '브릴린타'] },
  cilostazol: { ko: '실로스타졸', kind: '항혈소판제', cls: ['antiplatelet'], names: ['실로스타졸', '프레탈'] },
  warfarin: { ko: '와파린', kind: '항응고제', cls: ['anticoag'], names: ['와파린', '쿠마딘'] },
  rivaroxaban: { ko: '리바록사반', kind: '항응고제', cls: ['anticoag'], names: ['리바록사반', '자렐토'] },
  apixaban: { ko: '아픽사반', kind: '항응고제', cls: ['anticoag'], names: ['아픽사반', '엘리퀴스'] },
  edoxaban: { ko: '에독사반', kind: '항응고제', cls: ['anticoag'], names: ['에독사반', '릭시아나'] },
  dabigatran: { ko: '다비가트란', kind: '항응고제', cls: ['anticoag'], names: ['다비가트란', '프라닥사'] },
  // 혈압·심장
  amlodipine: { ko: '암로디핀', kind: '혈압약', cls: [], names: ['암로디핀', '노바스크', '오로디핀', '암로스타'] },
  losartan: { ko: '로사르탄', kind: '혈압약(ARB)', cls: ['arb'], names: ['로사르탄', '코자'] },
  valsartan: { ko: '발사르탄', kind: '혈압약(ARB)', cls: ['arb'], names: ['발사르탄', '디오반'] },
  telmisartan: { ko: '텔미사르탄', kind: '혈압약(ARB)', cls: ['arb'], names: ['텔미사르탄', '미카르디스'] },
  olmesartan: { ko: '올메사르탄', kind: '혈압약(ARB)', cls: ['arb'], names: ['올메사르탄', '올메텍'] },
  candesartan: { ko: '칸데사르탄', kind: '혈압약(ARB)', cls: ['arb'], names: ['칸데사르탄', '아타칸'] },
  irbesartan: { ko: '이르베사르탄', kind: '혈압약(ARB)', cls: ['arb'], names: ['이르베사르탄', '아프로벨'] },
  ramipril: { ko: '라미프릴', kind: '혈압약(ACE억제제)', cls: ['acei'], names: ['라미프릴', '트리테이스'] },
  enalapril: { ko: '에날라프릴', kind: '혈압약(ACE억제제)', cls: ['acei'], names: ['에날라프릴', '레니텍'] },
  perindopril: { ko: '페린도프릴', kind: '혈압약(ACE억제제)', cls: ['acei'], names: ['페린도프릴', '아서틸'] },
  spironolactone: { ko: '스피로노락톤', kind: '이뇨제(칼륨 보존)', cls: ['ksparing'], names: ['스피로노락톤', '알닥톤'] },
  nitroglycerin: { ko: '니트로글리세린', kind: '협심증약(질산염)', cls: ['nitrate'], names: ['니트로글리세린', '니트로링구알'] },
  isosorbide: { ko: '질산이소소르비드', kind: '협심증약(질산염)', cls: ['nitrate'], names: ['이소소르비드', '이소켓', '이소딜', '니소르딜'] },
  sildenafil: { ko: '실데나필', kind: '발기부전약', cls: ['pde5'], names: ['실데나필', '비아그라', '팔팔'] },
  tadalafil: { ko: '타다라필', kind: '발기부전·전립선약', cls: ['pde5'], names: ['타다라필', '시알리스'] },
  // 콜레스테롤
  simvastatin: { ko: '심바스타틴', kind: '고지혈증약', cls: ['statin3a'], names: ['심바스타틴', '조코'] },
  lovastatin: { ko: '로바스타틴', kind: '고지혈증약', cls: ['statin3a'], names: ['로바스타틴', '메바코'] },
  atorvastatin: { ko: '아토르바스타틴', kind: '고지혈증약', cls: [], names: ['아토르바스타틴', '리피토'] },
  rosuvastatin: { ko: '로수바스타틴', kind: '고지혈증약', cls: [], names: ['로수바스타틴', '크레스토'] },
  // 당뇨
  metformin: { ko: '메트포르민', kind: '당뇨약', cls: [], names: ['메트포르민', '다이아벡스', '글루코파지'] },
  sitagliptin: { ko: '시타글립틴', kind: '당뇨약', cls: [], names: ['시타글립틴', '자누비아'] },
  glimepiride: { ko: '글리메피리드', kind: '당뇨약', cls: [], names: ['글리메피리드', '아마릴'] },
  // 위장
  omeprazole: { ko: '오메프라졸', kind: '위산억제제', cls: ['ppi_c19'], names: ['오메프라졸', '로섹'] },
  esomeprazole: { ko: '에스오메프라졸', kind: '위산억제제', cls: ['ppi_c19'], names: ['에스오메프라졸', '넥시움', '에소메졸'] },
  // 수면·안정
  alprazolam: { ko: '알프라졸람', kind: '신경안정제', cls: ['benzo'], names: ['알프라졸람', '자낙스'] },
  lorazepam: { ko: '로라제팜', kind: '신경안정제', cls: ['benzo'], names: ['로라제팜', '아티반'] },
  diazepam: { ko: '디아제팜', kind: '신경안정제', cls: ['benzo'], names: ['디아제팜', '바리움'] },
  clonazepam: { ko: '클로나제팜', kind: '신경안정제', cls: ['benzo'], names: ['클로나제팜', '리보트릴'] },
  etizolam: { ko: '에티졸람', kind: '신경안정제', cls: ['benzo'], names: ['에티졸람', '데파스'] },
  zolpidem: { ko: '졸피뎀', kind: '수면제', cls: ['zdrug'], names: ['졸피뎀', '스틸녹스', '졸피드'] },
  // 우울·불안·편두통
  fluoxetine: { ko: '플루옥세틴', kind: '항우울제(SSRI)', cls: ['ssri', 'serotonergic', 'cyp2d6_strong'], names: ['플루옥세틴', '프로작'] },
  paroxetine: { ko: '파록세틴', kind: '항우울제(SSRI)', cls: ['ssri', 'serotonergic', 'cyp2d6_strong'], names: ['파록세틴', '팍실'] },
  escitalopram: { ko: '에스시탈로프람', kind: '항우울제(SSRI)', cls: ['ssri', 'serotonergic'], names: ['에스시탈로프람', '렉사프로'] },
  sertraline: { ko: '설트랄린', kind: '항우울제(SSRI)', cls: ['ssri', 'serotonergic'], names: ['설트랄린', '졸로프트'] },
  duloxetine: { ko: '둘록세틴', kind: '항우울제(SNRI)', cls: ['snri', 'serotonergic'], names: ['둘록세틴', '심발타'] },
  venlafaxine: { ko: '벤라팍신', kind: '항우울제(SNRI)', cls: ['snri', 'serotonergic'], names: ['벤라팍신', '이펙사'] },
  sumatriptan: { ko: '수마트립탄', kind: '편두통약', cls: ['triptan', 'serotonergic'], names: ['수마트립탄', '이미그란'] },
  zolmitriptan: { ko: '졸미트립탄', kind: '편두통약', cls: ['triptan', 'serotonergic'], names: ['졸미트립탄', '조믹'] },
  // 정신건강
  aripiprazole: { ko: '아리피프라졸', kind: '조현병·조울증약', cls: ['aripiprazole'], names: ['아리피프라졸', '아빌리파이'] },
  lamotrigine: { ko: '라모트리진', kind: '뇌전증·조울증약', cls: ['lamotrigine'], names: ['라모트리진', '라믹탈', '라모스탈'] },
  valproate: { ko: '발프로산', kind: '뇌전증·조울증약', cls: ['valproate'], names: ['발프로', '데파코트', '오르필'] },
  atomoxetine: { ko: '아토목세틴', kind: 'ADHD약', cls: ['atomoxetine'], names: ['아토목세틴', '스트라테라'] },
  methylphenidate: { ko: '메틸페니데이트', kind: 'ADHD약', cls: [], names: ['메틸페니데이트', '콘서타', '메디키넷', '페니드'] },
  // 항생제·항진균제
  clarithromycin: { ko: '클래리스로마이신', kind: '항생제', cls: ['cyp3a_strong'], names: ['클래리스로마이신', '클라리스로마이신', '클래리시드'] },
  itraconazole: { ko: '이트라코나졸', kind: '무좀·곰팡이약', cls: ['cyp3a_strong'], names: ['이트라코나졸', '스포라녹스'] },
  ketoconazole: { ko: '케토코나졸', kind: '곰팡이약', cls: ['cyp3a_strong'], names: ['케토코나졸'] },
  trimethoprim: { ko: '트리메토프림', kind: '항생제', cls: ['trimethoprim'], names: ['트리메토프림', '셉트린', '박트림'] },
  // 기타
  methotrexate: { ko: '메토트렉세이트', kind: '류마티스약', cls: ['methotrexate'], names: ['메토트렉세이트', 'MTX'] },
  allopurinol: { ko: '알로푸리놀', kind: '통풍약', cls: ['allopurinol'], names: ['알로푸리놀', '자이로릭'] },
  azathioprine: { ko: '아자티오프린', kind: '면역억제제', cls: ['azathioprine'], names: ['아자티오프린', '이뮤란'] },
};

// 여러 성분이 섞인 복합제
const COMBOS = [
  [['울트라셋', '파라마셋'], ['tramadol', 'acetaminophen']],
  [['트윈스타'], ['telmisartan', 'amlodipine']],
  [['엑스포지'], ['valsartan', 'amlodipine']],
  [['아모잘탄'], ['losartan', 'amlodipine']],
  [['세비카'], ['olmesartan', 'amlodipine']],
  [['자누메트'], ['sitagliptin', 'metformin']],
  [['코자플러스', '코자엑스큐'], ['losartan']],
];

// 이름에서 성분 찾기 (띄어쓰기·대소문자 무시)
const norm = (s) => String(s || '').replace(/\s/g, '').toLowerCase();
const NAME_INDEX = [];
for (const [id, ing] of Object.entries(INGREDIENTS)) for (const n of ing.names) NAME_INDEX.push([norm(n), [id]]);
for (const [names, ids] of COMBOS) for (const n of names) NAME_INDEX.push([norm(n), ids]);
NAME_INDEX.sort((a, b) => b[0].length - a[0].length); // 긴 이름부터 (복합제 먼저)

export function ingredientsOf(name) {
  const n = norm(name);
  const found = new Set();
  let rest = n;
  for (const [key, ids] of NAME_INDEX) {
    if (key.length >= 2 && rest.includes(key)) { ids.forEach((i) => found.add(i)); rest = rest.split(key).join('|'); }
  }
  return [...found];
}

export const describe = (id) => INGREDIENTS[id] && `${INGREDIENTS[id].ko} (${INGREDIENTS[id].kind})`;

// 주의 조합 규칙: [종류 A, 종류 B, 수준, 쉬운 설명]
// level: 'high' 같이 먹으면 위험 / 'mid' 확인 필요
const RULES = [
  ['nitrate', 'pde5', 'high', '혈압이 갑자기 크게 떨어질 수 있어요. 함께 먹으면 안 되는 조합으로 알려져 있어요.'],
  ['anticoag', 'nsaid', 'high', '피가 잘 멈추지 않거나 위장 출혈이 생길 위험이 커져요.'],
  ['opioid', 'benzo', 'high', '숨이 약해지고 심하게 졸릴 수 있어요.'],
  ['opioid', 'zdrug', 'high', '숨이 약해지고 심하게 졸릴 수 있어요.'],
  ['statin3a', 'cyp3a_strong', 'high', '근육이 상하는 부작용(근육통·소변 색 변화) 위험이 커져요.'],
  ['methotrexate', 'nsaid', 'high', '메토트렉세이트 부작용(피 수치 감소 등)이 심해질 수 있어요.'],
  ['methotrexate', 'trimethoprim', 'high', '피 수치가 크게 떨어질 수 있어요.'],
  ['allopurinol', 'azathioprine', 'high', '면역억제제 농도가 올라가 피 수치가 크게 떨어질 수 있어요.'],
  ['anticoag', 'antiplatelet', 'mid', '피가 잘 멈추지 않을 수 있어요. 의사가 일부러 함께 처방했을 수도 있으니 꼭 확인하세요.'],
  ['antiplatelet', 'nsaid', 'mid', '위장 출혈 위험이 커질 수 있어요.'],
  ['benzo', 'zdrug', 'mid', '너무 졸리거나 어지러워 넘어질 수 있어요.'],
  ['acei', 'ksparing', 'mid', '몸속 칼륨이 너무 높아질 수 있어요.'],
  ['arb', 'ksparing', 'mid', '몸속 칼륨이 너무 높아질 수 있어요.'],
  ['acei', 'arb', 'mid', '두 종류의 혈압약을 함께 쓰면 신장·칼륨 문제가 생길 수 있어 보통 같이 쓰지 않아요.'],
  ['clopidogrel', 'ppi_c19', 'mid', '클로피도그렐(피를 묽게 하는 약)의 효과가 약해질 수 있어요.'],
  ['ssri', 'nsaid', 'mid', '출혈(멍, 위장 출혈) 위험이 커질 수 있어요.'],
  ['ssri', 'anticoag', 'mid', '출혈 위험이 커질 수 있어요.'],
  ['ssri', 'antiplatelet', 'mid', '출혈 위험이 커질 수 있어요.'],
  ['snri', 'nsaid', 'mid', '출혈 위험이 커질 수 있어요.'],
  ['serotonergic', 'serotonergic', 'mid', '세로토닌이 너무 많아지는 부작용(떨림, 열, 초조함)이 생길 수 있어요.'],
  ['lamotrigine', 'valproate', 'mid', '라모트리진 농도가 올라가 피부 발진 등 부작용 위험이 커져요. 용량 조절이 필요할 수 있어요.'],
  ['atomoxetine', 'cyp2d6_strong', 'mid', '아토목세틴 농도가 올라갈 수 있어 용량 조절이 필요할 수 있어요.'],
  ['aripiprazole', 'cyp2d6_strong', 'mid', '아리피프라졸 농도가 올라갈 수 있어 용량 조절이 필요할 수 있어요.'],
];

// 같은 종류를 두 가지 먹을 때(중복) 알릴 종류
const DUP_CLASSES = {
  nsaid: '소염진통제를 두 가지 먹으면 위장 출혈·콩팥 부담이 커져요.',
  benzo: '신경안정제를 두 가지 먹으면 너무 졸리고 넘어질 위험이 커져요.',
  ssri: '같은 종류 항우울제를 두 가지 먹고 있어요.',
  anticoag: '피를 묽게 하는 약(항응고제)을 두 가지 먹고 있어요.',
  arb: '같은 종류 혈압약(ARB)을 두 가지 먹고 있어요.',
  acei: '같은 종류 혈압약(ACE억제제)을 두 가지 먹고 있어요.',
  opioid: '마약성 진통제를 두 가지 먹고 있어요.',
};

/**
 * 약 목록에서 주의할 조합을 찾음.
 * meds: [{id, name}] → { warnings: [{level, a, b, why, kind}], known: Map(id→[성분]), unknown: [med] }
 */
export function checkMeds(meds) {
  const info = meds.map((m) => {
    const ings = ingredientsOf(m.name);
    const cls = new Set(ings.flatMap((i) => INGREDIENTS[i].cls));
    return { m, ings, cls };
  });
  const warnings = [];
  const seen = new Set();
  const push = (w) => { const k = [w.a.id, w.b.id].sort().join('|') + w.why; if (!seen.has(k)) { seen.add(k); warnings.push(w); } };

  for (let i = 0; i < info.length; i++) {
    for (let j = i + 1; j < info.length; j++) {
      const A = info[i], B = info[j];
      // 같은 성분 중복
      const same = A.ings.filter((x) => B.ings.includes(x));
      if (same.length) {
        push({ level: same.includes('acetaminophen') ? 'high' : 'mid', kind: 'dup', a: A.m, b: B.m,
          why: `같은 성분(${same.map((x) => INGREDIENTS[x].ko).join(', ')})이 두 약에 들어 있어요. 한꺼번에 너무 많이 먹게 될 수 있어요${same.includes('acetaminophen') ? '(간 손상 위험)' : ''}.` });
        continue;
      }
      // 같은 종류 중복
      for (const [c, why] of Object.entries(DUP_CLASSES)) if (A.cls.has(c) && B.cls.has(c)) push({ level: 'mid', kind: 'dup', a: A.m, b: B.m, why });
      // 조합 규칙
      for (const [x, y, level, why] of RULES) {
        if ((A.cls.has(x) && B.cls.has(y)) || (A.cls.has(y) && B.cls.has(x))) {
          if (x === 'serotonergic' && A.cls.has('ssri') && B.cls.has('ssri')) continue; // SSRI 두 가지는 위의 '같은 종류 중복'으로 이미 알림
          push({ level, kind: 'combo', a: A.m, b: B.m, why });
        }
      }
    }
  }
  warnings.sort((a, b) => (a.level === b.level ? 0 : a.level === 'high' ? -1 : 1));
  return {
    warnings,
    known: new Map(info.filter((x) => x.ings.length).map((x) => [x.m.id, x.ings])),
    unknown: info.filter((x) => !x.ings.length).map((x) => x.m),
  };
}
