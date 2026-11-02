// App configuration defaults and fixed vocabularies (not records).

// name: delivery-sheet name · short: route chip name · orderName: exact name in hy's ordering app (출고신청)
export const DEFAULT_PRODUCTS = [
  { id: 'ykl', name: '야쿠르트 라이트', short: '야쿠르트', orderName: '야쿠르트라이트', cat: '발효유(영업)', hue: 205 },
  { id: 'ykpl', name: '야쿠르트 프리미엄 라이트', short: '프리미엄', orderName: '야쿠르트프리미엄라이트', cat: '발효유(영업)', hue: 190 },
  { id: 'multi', name: '멀티비타', short: '멀티비타', orderName: '멀티비타프로바이오틱스', cat: '발효유(영업)', hue: 45 },
  { id: 'will', name: '윌', short: '윌', orderName: '윌', cat: '발효유(영업)', hue: 125 },
  { id: 'will_lf', name: '윌 (저지방)', short: '윌저', orderName: '윌 저지방', cat: '발효유(영업)', hue: 150 },
  { id: 'mpro', name: '엠프로 (면역)', short: '엠프로', orderName: 'MPRO(엠프로) 장&면역', cat: '발효유(영업)', hue: 265 },
  { id: 'kup_f', name: '쿠퍼스 (피로케어)', short: '피로케어', orderName: '피로케어 쿠퍼스', cat: '발효유(영업)', hue: 20 },
  { id: 'will_bal', name: '윌 (당밸런스)', short: '윌당', orderName: '윌 당밸런스', cat: '발효유(영업)', hue: 95 },
  { id: 'will_jy', name: '윌 (작약)', short: '윌작약', orderName: '윌 작약', cat: '발효유(영업)', hue: 340 },
  { id: 'ykxo', name: '야쿠르트 XO', short: 'XO', orderName: '야쿠르트 XO', cat: '발효유(영업)', hue: 230 },
  { id: 's100_st', name: '슈퍼100 딸기', short: '딸기', orderName: '슈퍼100 딸기(2025)', cat: '발효유(영업)', hue: 355 },
  { id: 's100_pc', name: '슈퍼100 복숭아', short: '복숭아', orderName: '슈퍼100 복숭아(2025)', cat: '발효유(영업)', hue: 15 },
  { id: 's100_pl', name: '슈퍼100 플레인', short: '100플레인', orderName: '슈퍼100 플레인(2025)', cat: '발효유(영업)', hue: 60 },
  { id: 's100_bb', name: '슈퍼100 블루베리', short: '블루베리', orderName: '슈퍼100 블루베리(2025)', cat: '발효유(영업)', hue: 250 },
  { id: 's100_ap', name: '슈퍼100 사과', short: '사과', orderName: '슈퍼100 사과(2025)', cat: '발효유(영업)', hue: 0 },
  { id: 'greekd', name: '그릭드링크 플레인', short: '그릭드링크', orderName: '슈퍼100 그릭드링크 플레인', cat: '발효유(영업)', hue: 180 },
  { id: 'greeky', name: '그릭요거트', short: '그릭요거트', orderName: '슈퍼100 그릭요거트', cat: '발효유(영업)', hue: 200 },
  { id: 'kup_b', name: '쿠퍼스 (혈행케어)', short: '혈행케어', orderName: '쿠퍼스 블러드케어', cat: '발효유(영업)', hue: 350 },
  { id: 'milk_s', name: '일반우유 (소)', short: '우유小', orderName: '(내)클래식200', cat: '우유', hue: 210 },
  { id: 'milk_l', name: '일반우유 (대)', short: '우유大', orderName: '(내)클래식930', cat: '우유', hue: 215 },
  { id: 'lfm_s', name: '저지방우유 (소)', short: '저지방小', orderName: '(내)클래식저지방200', cat: '우유', hue: 170 },
  { id: 'calc', name: '소화 고칼슘 우유 (930)', short: '고칼슘', orderName: '소화가 잘되는 고칼슘 우유(930)', cat: '우유', hue: 40 },
  { id: 'lfm_l', name: '저지방우유 (대)', short: '저지방大', orderName: '(내)클래식저지방930', cat: '우유', hue: 175 },
  { id: 'haru', name: '하루야채 오리지널', short: '하루', orderName: '하루야채 오리지널', cat: '영업음료', hue: 30 },
  { id: 'haru_pp', name: '하루야채 퍼플', short: '퍼플', orderName: '하루야채 퍼플', cat: '영업음료', hue: 285 },
  { id: 'haru_yl', name: '하루야채 옐로우', short: '옐로우', orderName: '하루야채 옐로우', cat: '영업음료', hue: 50 },
  { id: 'haru_lt', name: '하루야채 라이트', short: '하루라이트', orderName: '하루야채 라이트', cat: '영업음료', hue: 80 },
  { id: 'haru_kg', name: '하루야채키즈 포도', short: '키즈포도', orderName: '하루야채 유기농 포도비트', cat: '영업음료', hue: 300 },
  { id: 'haru_ko', name: '하루야채키즈 오렌지', short: '키즈오렌지', orderName: '하루야채 유기농 오렌지당근', cat: '영업음료', hue: 28 },
  { id: 'haru_bb', name: '하루야채 (BB)', short: 'BB', orderName: '하루야채 BB', cat: '영업음료', hue: 110 },
  { id: 'egg', name: '무항생제 신선란 10구', short: '신선란', orderName: '무항생제 신선란 10구', cat: '신선간편식(후불)', hue: 38 },
  { id: 'eo_salad', name: '이츠온 폴드포크 크리스피 어니언 샐러드', short: '이츠온샐러드', orderName: '이츠온 폴드포크 크리스피 어니언 샐러드', cat: '기타(Fredit 등)', hue: 140 },
  { id: 'eo_tofu', name: '이츠온 하루연두부', short: '연두부', orderName: '이츠온 하루연두부', cat: '기타(Fredit 등)', hue: 65 },
  { id: 'yk_upside', name: '거꾸로 먹는 야쿠르트', short: '거꾸로야쿠르트', orderName: '거꾸로 먹는 야쿠르트', cat: '기타(Fredit 등)', hue: 220 },
]
export const DEFAULT_ROUTE = ['405', '403', '404', '411', '413', '418', '417', '414', '410', '경로당', '402', '406', '401', '407', '408', '409', '415', '주민센터', '204', '205', '203', '206', '202', '209', '211', '216', '215', '212', '214', '213', '2보안실', '상가B']
export const DEFAULT_CONFIG = {
  products: DEFAULT_PRODUCTS, routeOrder: DEFAULT_ROUTE, leadDays: 2, leadMode: 'business',
  deliveryDays: [1, 2, 3, 4, 5], holidays: [], floorDir: 'desc',
  purchase: { regular: true, prepaid: false, fredit: false, sample: false, adhoc: false, pickup: false },
  stock: {}, baseSeq: null, v: 1,
}
// hy 주문구분 → app type: 후불정기=regular(고객 정기), (선불)정기=prepaid, 일반=fredit, 견본=sample,
// hy 앱 밖에서 직접 받은 주문=adhoc, 반품·회수=pickup (가져올 것, 발주·실적 제외)
export const TYPES = ['regular', 'prepaid', 'fredit', 'sample', 'adhoc', 'pickup']
export const ORDER_TYPES = ['fredit', 'sample', 'prepaid', 'adhoc', 'pickup']
export const TYPE_NAME = { regular: '정기', prepaid: '선불정기', fredit: '일반', sample: '견본', adhoc: '추가', pickup: '회수' }
export const TYPE_LONG = { regular: '후불정기 (고객 정기)', prepaid: '(선불)정기 · 프레딧', fredit: '일반주문 · 프레딧', sample: '견본주문 (0원 샘플)', adhoc: '추가주문 (직접 받음)', pickup: '반품·회수' }
export const TYPE_HINT = {
  fredit: 'hy 앱 “일반”. 고객이 프레딧에서 카드로 결제한 1회 배달이에요. 물건은 자동 발주돼요.',
  sample: 'hy 앱 “견본”. 0원 샘플이에요. 지점에서 받아와서 배달해요.',
  prepaid: 'hy 앱 “(선불)정기”의 한 회차예요. 매번 오는 고객이면 고객 정보에서 수금을 “선불정기”로 두고 정기 품목으로 넣으면 자동으로 들어가요.',
  adhoc: 'hy 앱에 없는 주문이에요. 포스트잇·전화·문자로 직접 받은 추가 주문.',
  pickup: '반품·빈 병 등 받아올 것이에요. 동선에는 뜨지만 발주와 실적에는 안 들어가요.',
}
export const isSched = t => t === 'regular' || t === 'prepaid'
export const PAY = { card: '카드자동이체', account: '계좌자동이체', cash: '현금', prepaid: '선불정기 (프레딧)' }
export const LOC_TYPES = { apt: '아파트 세대', office: '관리·미화실', security: '보안실', store: '상가', community: '주민센터·경로당' }
export const STATUS_NAME = { active: '배달 중', waiting: '시작 대기', stopped: '중단', ended: '해지', moved: '이사' }
// full = 모든 정기 배달 쉼 / partial = 공휴일: 아파트는 배달, 공휴일에 쉬는 곳(상가·주민센터·미화/관리)만 빠짐
export const HOL_OFF_TYPES = ['office', 'security', 'store']
export const LOG_KINDS = ['주문', '정기 변경', '하루 변경', '중지', '상태', '수금', '미전달', '메모', '고객 정보', '배달 완료', '기타']
export const TY_CODE = { regular: 'r', adhoc: 'a', sample: 's', fredit: 'f', prepaid: 'p', pickup: 'k' }
export const CODE_TY = { r: 'regular', a: 'adhoc', s: 'sample', f: 'fredit', p: 'prepaid', k: 'pickup' }
export const DOC_NAME = { customers: '고객', orders: '주문', config: '설정·재고', days: '배달 체크·순서', log: '변경 기록', perf: '실적' }
export const DOCS = ['customers', 'orders', 'config', 'days', 'log', 'perf']
// AI level chosen in 설정 > AI (the server maps each level to a model; the app never names it)
export const AI_TIERS = ['fast', 'balanced', 'best']
