// Demo data for trying the app: made-up customers in Helio City buildings, every order type, pauses,
// status changes, holidays, paper bills, finished past days with check times and a month of 실적.
// Everything is tagged '예시' (config.demo remembers the settings it added) so clearDemo() removes it all.
// No real person or customer data is in here.
import { S } from '@/store/state'
import { save } from '@/store/sync'
import { normCust, normOrder } from '@/domain/normalize'
import { TODAY, addDays, dow, pad } from '@/lib/dates'
import { uid } from '@/lib/util'
import { isDeliveryDay, nextDeliveryDay, prevDeliveryDay, orderTarget } from '@/domain/calendar'
import { ensureRouteOrder } from '@/domain/location'
import { orderedStops, sheetFor } from '@/domain/stops'
import { maybeFreeze } from '@/domain/perf'

const TAG = '예시'
export const hasDemo = () => S.customers.some(c => c.tags.includes(TAG)) || S.orders.some(o => o.tags.includes(TAG)) || !!S.config.demo

// small seeded random, so the demo looks the same every time
function rng(seed) { return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296 } }

const SURNAMES = ['김', '이', '박', '최', '정', '강', '조', '윤', '장', '임', '한', '오', '서', '신', '권', '황', '안', '송', '류', '전', '홍', '고', '문', '양', '손', '배', '백', '허', '유', '남']
const GIVEN = ['하늘', '서준', '지민', '유나', '민호', '수진', '은비', '도현', '미경', '재현', '지우', '세훈', '예린', '동욱', '나연', '보람', '성민', '하은', '지호', '미란', '길순', '은영', '태호', '소희', '주원', '수빈', '지훈', '민정', '채원', '현우', '영숙', '정희', '순자', '경민', '다은', '시우', '연경', '상철', '혜진', '우진']
const NOTES = ['문 앞 우유 투입구', '경비실에 맡기기', '강아지 있음 · 벨 누르지 않기', '주말 부재', '보냉백 문고리', '7시 전 배달 원함', '현관 앞 상자에', '엘리베이터 점검 날 계단', '']
// [productId, qty, days, every]
const PLANS = [
  [['ykl', 1, [1, 2, 3, 4, 5]]],
  [['ykl', 2, [1, 2, 3, 4, 5]]],
  [['will', 1, [1, 2, 3, 4, 5]]],
  [['will_lf', 1, [1, 3, 5]], ['ykl', 1, [1, 3, 5]]],
  [['mpro', 1, [1, 2, 3, 4, 5]]],
  [['kup_f', 1, [1, 3, 5]]],
  [['ykpl', 1, [1, 2, 3, 4, 5]], ['s100_st', 1, [2, 4]]],
  [['s100_bb', 2, [1, 3, 5]]],
  [['will_bal', 1, [1, 2, 3, 4, 5]]],
  [['multi', 1, [1, 2, 3, 4, 5]], ['greekd', 1, [2, 4]]],
  [['milk_s', 2, [1, 3, 5]], ['ykl', 1, [1, 2, 3, 4, 5]]],
  [['milk_l', 1, [2, 4], 2]],
  [['lfm_l', 1, [1], 2], ['will', 1, [1, 2, 3, 4, 5]]],
  [['calc', 1, [3]]],
  [['ykxo', 1, [1, 2, 3, 4, 5]]],
  [['haru', 1, [1, 2, 3, 4, 5]]],
  [['haru_pp', 1, [1, 3, 5]], ['s100_pl', 1, [1, 3, 5]]],
  [['will_jy', 1, [2, 4]], ['kup_b', 1, [2, 4]]],
  [['greeky', 2, [1, 4]]],
  [['s100_pc', 1, [1, 2, 3, 4, 5]], ['s100_ap', 1, [1, 2, 3, 4, 5]]],
  [['ykl', 1, [1, 2, 3, 4, 5]], ['mpro', 1, [1, 2, 3, 4, 5]]],
  [['lfm_s', 2, [1, 2, 3, 4, 5]]],
  [['egg', 1, [3]], ['ykl', 1, [1, 2, 3, 4, 5]]],
]
const APT = ['405', '403', '404', '411', '413', '418', '417', '414', '410', '402', '406', '401', '407', '408', '409', '415', '204', '205', '203', '206', '202', '209', '211', '216', '215', '212', '214', '213']

// a timestamp for date d at hh:mm Korea time
const kstAt = (d, h, mi) => { const [y, m, dd] = d.split('-').map(Number); return Date.UTC(y, m - 1, dd, h, mi) - 9 * 3600 * 1000 }

export function loadDemo() {
  const r = rng(913)
  const pick = a => a[Math.floor(r() * a.length)]
  const t = TODAY()
  const used = new Set()
  const customers = []
  const plan = i => PLANS[i % PLANS.length].map(([productId, qty, days, every]) => ({ productId, qty, days, every: every || 1, anchor: every === 2 ? t : '' }))
  for (let i = 0; i < 56; i++) {
    let b, u
    do { b = pick(APT); const floor = 2 + Math.floor(r() * 30); const line = 1 + Math.floor(r() * (r() < 0.12 ? 5 : 4)); u = `${floor}${pad(line)}` } while (used.has(b + '-' + u))
    used.add(b + '-' + u)
    const payRoll = r()
    customers.push({
      name: pick(SURNAMES) + pick(GIVEN), loc: { type: 'apt', building: b, unit: u, label: '' },
      phone: `010-0000-${pad(Math.floor(r() * 99))}${pad(Math.floor(r() * 99))}`, // obviously fake numbers
      regular: plan(i), payment: payRoll < 0.1 ? 'cash' : payRoll < 0.25 ? 'account' : payRoll < 0.29 ? 'prepaid' : 'card',
      ice: r() < 0.7, bag: r() < 0.25, member: r() < 0.4, bill: r() < 0.12 ? 'paper' : 'mobile', notes: pick(NOTES),
      contractNo: String(30000000 + Math.floor(r() * 9999999)), course: 3,
    })
  }
  // places that are not apartments
  customers.push(
    { name: '4단지 경로당', loc: { type: 'community', building: '경로당', unit: '1층', label: '4단지 경로당' }, regular: [{ productId: 'ykl', qty: 10, days: [1, 2, 3, 4, 5] }], payment: 'account', holidayOff: true, notes: '오전 9시 이후 문 열림' },
    { name: '가락1동 주민센터', loc: { type: 'community', building: '주민센터', unit: '2층', label: '민원실 냉장고' }, regular: [{ productId: 'will', qty: 3, days: [1, 3, 5] }, { productId: 'ykl', qty: 5, days: [1, 2, 3, 4, 5] }], payment: 'account', holidayOff: true },
    { name: '상가 2보안실', loc: { type: 'security', building: '2보안실', unit: '', label: '상가 2보안실' }, regular: [{ productId: 'kup_f', qty: 2, days: [1, 2, 3, 4, 5] }], payment: 'cash' },
    { name: 'B동 꽃집', loc: { type: 'store', building: '상가B', unit: '108', label: '상가 B동 108호 꽃집' }, regular: [{ productId: 'haru', qty: 2, days: [1, 3, 5] }], payment: 'card' },
    { name: '403동 미화휴게실', loc: { type: 'office', building: '403', unit: 'B3', label: '403동 지하3층 미화휴게실' }, regular: [{ productId: 'ykl', qty: 6, days: [1, 2, 3, 4, 5] }], payment: 'account', notes: '미화 반장님께 전달' },
  )
  const C = customers.map(c => normCust({ ...c, tags: [TAG] }))
  const by = i => C[i]
  // statuses and pauses
  const next = nextDeliveryDay(t)
  by(3).pauses.push({ id: uid('p_'), from: addDays(t, -1), to: addDays(t, 4), reason: '여행', ack: false, days: [] })
  by(7).pauses.push({ id: uid('p_'), from: addDays(t, 2), to: addDays(t, 8), reason: '병원 입원', ack: false, days: [] })
  by(12).pauses.push({ id: uid('p_'), from: addDays(t, -10), to: addDays(t, 30), reason: '수요일은 집에 없음', ack: false, days: [3] })
  by(15).pauses.push({ id: uid('p_'), from: addDays(t, -7), to: prevDeliveryDay(t), reason: '명절 귀성', ack: false, days: [] })
  Object.assign(by(20), { status: 'ended', endDate: addDays(t, 2), statusNote: '이사 예정이라 해지', active: false })
  Object.assign(by(25), { status: 'moved', endDate: addDays(t, -6), statusNote: '송파로 이사', active: false })
  Object.assign(by(30), { status: 'waiting', endDate: '', statusNote: '다음 주부터 시작', active: false })
  Object.assign(by(33), { status: 'stopped', endDate: addDays(t, -3), statusNote: '당분간 쉼', active: false })
  C.filter(c => c.payment === 'cash').forEach((c, i) => { if (i % 2) c.paidMonth = t.slice(0, 7) })

  // orders: every type, around today
  const later = nextDeliveryDay(next)
  const O = [
    { type: 'fredit', customerId: by(1).id, date: next, items: [{ productId: 'greeky', qty: 2 }], note: '프레딧 주문' },
    { type: 'fredit', customerId: null, name: '정다은', loc: { type: 'apt', building: '409', unit: '1702', label: '' }, date: next, items: [{ productId: 's100_st', qty: 4 }], note: '처음 주문 · 문 앞' },
    { type: 'sample', customerId: by(9).id, date: next, items: [{ productId: 'will_jy', qty: 1 }], note: '견본 · 지점 수령' },
    { type: 'sample', customerId: by(18).id, date: next, items: [{ productId: 'mpro', qty: 1 }] },
    { type: 'prepaid', customerId: by(22).id, date: later, items: [{ productId: 'milk_l', qty: 1 }] },
    { type: 'adhoc', customerId: by(5).id, date: next, items: [{ productId: 'ykl', qty: 5 }], note: '손주 방문 · 전화로 받음' },
    { type: 'adhoc', customerId: by(10).id, date: later, items: [{ productId: 'x:펫쿠르트 영양트릿 치킨', qty: 2 }], note: '앱 결제 완료', noBuy: true },
    { type: 'pickup', customerId: by(14).id, date: next, items: [{ productId: 'calc', qty: 1 }], note: '유통기한 지난 것 회수' },
    { type: 'fredit', customerId: by(27).id, date: next, items: [{ productId: 's100_pc', qty: 2 }], status: 'cancelled', note: '고객 취소' },
  ]
  // past orders for 실적
  for (let k = 1, d = t; k <= 8; k++) { d = prevDeliveryDay(d); O.push({ type: k % 3 ? 'fredit' : 'adhoc', customerId: by((k * 7) % 50).id, date: d, items: [{ productId: pick(['greeky', 's100_bb', 'ykpl', 'will']), qty: 1 + (k % 3) }] }) }
  const orders = O.map(o => normOrder({ ...o, tags: [TAG] }))

  S.customers.push(...C)
  S.orders.push(...orders)
  ensureRouteOrder()

  // settings the demo adds (remembered in config.demo so they can be removed)
  const demo = { holidays: [], todos: [], bills: !S.config.bills, stock: Object.keys(S.config.stock).length === 0, perfSince: !S.perf.since }
  let hol = addDays(t, 9); while (dow(hol) === 0 || dow(hol) === 6) hol = addDays(hol, 1)
  if (!S.config.holidays.some(h => h.date === hol)) { S.config.holidays.push({ date: hol, name: '예시 공휴일', mode: 'partial' }); demo.holidays.push(hol) }
  for (const text of ['점장님께 411동 해지 고객 수금 확인', 'B동 꽃집 하루야채 단가 물어보기']) { const id = uid('t_'); S.config.todos.push({ id, text, at: Date.now() - 3600e3, due: text.startsWith('점장') ? addDays(t, 1) : '', done: false, doneAt: 0 }); demo.todos.push(id) }
  if (demo.bills) {
    const ids = C.filter(c => c.bill === 'paper').map(c => c.id).concat([by(2).id, by(6).id]).slice(0, 7)
    S.config.bills = { label: `${Number(t.slice(5, 7))}월 종이 청구서`, since: t.slice(0, 8) + '01', ids, given: Object.fromEntries(ids.slice(0, 2).map(id => [id, prevDeliveryDay(t)])) }
  }
  if (demo.stock) S.config.stock = { ykl: 4, will: 2, mpro: 1 }
  if (demo.perfSince) { const [y, m] = t.split('-').map(Number); S.perf.since = m === 1 ? `${y - 1}-12-01` : `${y}-${pad(m - 1)}-01` }
  S.config.demo = demo

  // one-day changes for the next delivery day
  const ovDay = S.days[next] || (S.days[next] = {})
  ovDay.ov = { ...(ovDay.ov || {}), [by(0).id]: { items: [{ pid: 'ykl', qty: 3 }], skip: false }, [by(2).id]: { items: [], skip: true } }

  // finished past days with check times, today partly done
  let d = t
  for (let k = 0; k < 12; k++) {
    d = prevDeliveryDay(d)
    const stops = orderedStops(d).filter(s => !s.skipped)
    const rec = S.days[d] || (S.days[d] = {})
    rec.done = {}
    stops.forEach((s, i) => { rec.done[s.key] = kstAt(d, 7, 25) + i * 175000 + Math.floor(r() * 60000) })
    if (stops.length) rec.completedAt = Math.max(...Object.values(rec.done))
  }
  if (isDeliveryDay(t)) {
    const stops = orderedStops(t).filter(s => !s.skipped)
    const rec = S.days[t] || (S.days[t] = {})
    rec.done = rec.done || {}
    const n = Math.floor(stops.length * 0.35)
    stops.slice(0, n).forEach((s, i) => { const ts = kstAt(t, 7, 25) + i * 175000; if (ts < Date.now()) rec.done[s.key] = ts })
  }
  // ordering sheet confirmed earlier, then a change came in (shows the red +1)
  const tgt = orderTarget()
  const conf = Object.fromEntries(sheetFor(tgt).map(row => [row.p.id, row.buy]))
  if (conf.ykl > 0) conf.ykl -= 1
  const tr = S.days[tgt] || (S.days[tgt] = {}); tr.confirmed = conf; tr.confirmedAt = Date.now() - 2 * 3600e3

  // change log entries over the last two weeks
  const L = (daysAgo, h, e) => S.log.push({ id: uid('l_'), at: kstAt(addDays(t, -daysAgo), h, 10 + Math.floor(r() * 40)), cid: e.c?.id || null, name: e.c?.name || e.name || '', loc: e.c ? `${e.c.loc.building}${e.c.loc.unit ? '-' + e.c.loc.unit : ''}` : '', from: e.from || '', to: e.to ?? (e.from || ''), kind: e.kind, text: e.text, by: e.by || '직접', tags: [TAG] })
  L(0, 6, { c: by(3), from: addDays(t, -1), to: addDays(t, 4), kind: '중지', text: '배달 중지 · 여행' })
  L(1, 20, { c: by(7), from: addDays(t, 2), to: addDays(t, 8), kind: '중지', text: '배달 중지 · 병원 입원', by: 'AI' })
  L(2, 9, { c: by(20), from: addDays(t, 2), to: '', kind: '상태', text: '해지 · 이사 예정이라 해지 (이전: 배달 중)' })
  L(3, 13, { c: by(5), from: next, kind: '주문', text: '추가 주문 야쿠르트 5 · 손주 방문 · 전화로 받음' })
  L(4, 8, { c: by(0), from: next, kind: '하루 변경', text: '이날만 야쿠르트 3', by: 'AI' })
  L(6, 18, { c: by(25), from: addDays(t, -6), to: '', kind: '상태', text: '이사 · 송파로 이사 (이전: 배달 중)' })
  L(8, 11, { c: by(11), from: addDays(t, -8), to: '', kind: '정기 변경', text: '정기 품목: 격주 화목 우유大 1 (이전: 화목 우유大 1)' })
  L(10, 15, { c: by(16), kind: '수금', from: addDays(t, -10), text: '현금 수금 완료' })
  L(12, 7, { c: by(14), from: addDays(t, -12), kind: '미전달', text: '고칼슘 우유 미전달 · 다음 날 전달' })
  S.log.sort((a, b) => b.at - a.at)

  save('customers', 'orders', 'config', 'days', 'log', 'perf')
  setTimeout(() => maybeFreeze(), 1500)
  return C.length
}

export function clearDemo() {
  const ex = new Set(S.customers.filter(c => c.tags.includes(TAG)).map(c => c.id))
  const exOrders = new Set(S.orders.filter(o => o.tags.includes(TAG) || ex.has(o.customerId)).map(o => o.id))
  const gone = k => ex.has(k) || (k.startsWith('o:') && exOrders.has(k.slice(2)))
  S.customers = S.customers.filter(c => !ex.has(c.id))
  S.orders = S.orders.filter(o => !exOrders.has(o.id))
  S.log = S.log.filter(e => !(e.tags || []).includes(TAG) && !ex.has(e.cid))
  for (const [d, day] of Object.entries(S.perf.days)) {
    for (const k of Object.keys(day.s || {})) if (gone(k)) { delete day.s[k]; if (day.n) delete day.n[k]; if (day.dt) delete day.dt[k] }
    if (!Object.keys(day.s || {}).length) delete S.perf.days[d]
  }
  for (const [d, day] of Object.entries(S.days)) {
    for (const f of ['ov', 'done']) if (day[f]) for (const k of Object.keys(day[f])) if (gone(k)) delete day[f][k]
    if (day.seq) day.seq = day.seq.filter(k => !gone(k))
    delete day.confirmed; delete day.confirmedAt
    if (!Object.keys(day.done || {}).length) delete day.completedAt
    if (!Object.keys(day.ov || {}).length && !Object.keys(day.done || {}).length && !(day.seq || []).length) delete S.days[d]
  }
  const demo = S.config.demo
  if (demo) {
    S.config.holidays = S.config.holidays.filter(h => !demo.holidays.includes(h.date))
    S.config.todos = S.config.todos.filter(x => !demo.todos.includes(x.id))
    if (demo.bills) S.config.bills = null
    if (demo.stock) S.config.stock = {}
    if (demo.perfSince) S.perf.since = ''
    delete S.config.demo
  }
  if (S.config.bills) { S.config.bills.ids = S.config.bills.ids.filter(id => !ex.has(id)); for (const id of Object.keys(S.config.bills.given)) if (ex.has(id)) delete S.config.bills.given[id] }
  S.config.baseSeq = null
  save('customers', 'orders', 'config', 'days', 'log', 'perf')
}
