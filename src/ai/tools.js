// The AI's tools: the same changes the buttons make, plus read-only lookups. They run in the app on the
// app's data (so they work with whatever is on this device), and every change is written to the change log
// with by: 'AI'. Ported from the original notebook's tool set.
import { S } from '@/store/state'
import { ORDER_TYPES, TYPE_NAME, STATUS_NAME, PAY, LOG_KINDS } from '@/domain/constants'
import { TODAY, MONTH, DL, addDays, fmt, fmtShort, dayOf } from '@/lib/dates'
import { uid, clone, stable } from '@/lib/util'
import { normCust, normOrder } from '@/domain/normalize'
import { custById, prodById, isX, xId, pName, pShort, locShort, itemsText } from '@/domain/model'
import { pauseDays, orderDayFor } from '@/domain/calendar'
import { isNumB, ensureRouteOrder } from '@/domain/location'
import { orderedStops, sheetFor, itemAgg, stopNotes, aggList, regularFor, applyWeek, dayRec } from '@/domain/stops'
import { logChange, regularText, custDiff, whenText } from '@/domain/log'
import { refreshPerfKey, refreshPerfFrom, perfData } from '@/domain/perf'

const S_ = { type: 'string' }, N_ = { type: 'number' }, B_ = { type: 'boolean' }
const ITEMS = { type: 'array', items: { type: 'object', properties: { product_id: S_, qty: N_ }, required: ['product_id', 'qty'] } }

// ctx: { changed: Set<docName>, action(text) } — collects what to save and the "반영함" lines for the chat bubble
export function makeTools(ctx) {
  const T = (name, description, properties, required, run) => ({ name, description, input_schema: { type: 'object', properties, required }, run })
  const cust = id => { const c = custById(String(id || '')); if (!c) throw new Error('그 id의 고객이 없어요: ' + id); return c }
  const pid = p => { p = String(p || ''); if (isX(p)) { const id = xId(p.slice(2)); if (id.length > 2) return id } if (!prodById(p)) throw new Error('제품 id가 없어요: ' + p + ' (목록에 없는 제품이면 x:제품명)'); return p }
  const day = d => { d = String(d || ''); if (!/^\d{4}-\d\d-\d\d$/.test(d)) throw new Error('날짜는 YYYY-MM-DD 형식이어야 해요: ' + d); return d }
  const done = (txt, ...docs) => { docs.forEach(x => ctx.changed.add(x)); ctx.changed.add('log'); ctx.action(txt); return { ok: true, done: txt } }
  const L = e => logChange({ ...e, by: 'AI' })

  return [
    T('add_order', '주문 넣기. type: fredit=hy 일반주문(프레딧 결제), sample=견본주문(0원), prepaid=(선불)정기배송 한 회차, adhoc=hy 앱에 없는 직접 받은 추가주문, pickup=반품·회수(받아올 것). 제품 목록에 없는 제품(펫쿠르트 등)은 product_id를 "x:원래 제품명"으로 넣어 (발주 안 함). no_buy=true는 따로 결제돼서 발주가 필요 없는 주문. 고객 목록에 있으면 customer_id, 없으면 name·building·unit.', { customer_id: S_, name: S_, building: S_, unit: S_, date: S_, type: { type: 'string', enum: ORDER_TYPES }, items: ITEMS, note: S_, no_buy: B_ }, ['date', 'type', 'items'], i => {
      const c = i.customer_id ? cust(i.customer_id) : null
      const items = (i.items || []).map(x => ({ productId: pid(x.product_id), qty: Math.max(1, Math.round(+x.qty || 1)) }))
      const o = normOrder({ type: i.type, customerId: c?.id || null, name: c ? '' : (i.name || ''), loc: c ? null : { type: 'apt', building: String(i.building || ''), unit: String(i.unit || ''), label: '' }, date: day(i.date), items, note: i.note || '', noBuy: !!i.no_buy })
      S.orders.push(o)
      L({ cid: o.customerId, name: c ? '' : o.name, loc: c ? '' : locShort(o.loc), from: o.date, kind: '주문', text: `${TYPE_NAME[o.type]} 주문 ${itemsText(o.items)}${o.note ? ' · ' + o.note : ''}` })
      if (o.date < TODAY() && refreshPerfKey(o.date, c ? c.id : 'o:' + o.id)) ctx.changed.add('perf')
      if (!c && ensureRouteOrder()) ctx.changed.add('config')
      return done(`${fmt(o.date)} ${c ? c.name : o.name} ${TYPE_NAME[o.type]} 주문 ${itemsText(o.items)}`, 'orders')
    }),
    T('cancel_order', '주문 취소 (order_id는 주문 목록의 id).', { order_id: S_ }, ['order_id'], i => {
      const o = S.orders.find(x => x.id === i.order_id); if (!o) throw new Error('주문이 없어요: ' + i.order_id)
      o.status = 'cancelled'; const c = o.customerId ? custById(o.customerId) : null
      L({ cid: o.customerId, name: c ? '' : o.name, loc: c ? '' : locShort(o.loc), from: o.date, kind: '주문', text: `주문 취소 ${itemsText(o.items)}` })
      if (o.date < TODAY() && refreshPerfKey(o.date, c ? c.id : 'o:' + o.id)) ctx.changed.add('perf')
      return done(`${fmt(o.date)} ${c ? c.name : o.name} 주문 취소`, 'orders')
    }),
    T('set_regular', '앞으로 매주 특정 요일 정기 수량 정하기. qty 0이면 그 요일 그 제품 뺌.', { customer_id: S_, product_id: S_, weekday: N_, qty: N_ }, ['customer_id', 'product_id', 'weekday', 'qty'], i => {
      const c = cust(i.customer_id); const p = pid(i.product_id); const w = Math.round(+i.weekday); if (w < 1 || w > 6) throw new Error('weekday는 1~6')
      const cur = c.regular.filter(r => r.every !== 2 && r.days.includes(w)).map(r => ({ pid: r.productId, qty: r.qty }))
      const list = aggList(cur).filter(x => x.pid !== p); const q = Math.max(0, Math.round(+i.qty)); if (q) list.push({ pid: p, qty: q })
      const before = regularText(c); applyWeek(c, w, list)
      L({ cid: c.id, from: TODAY(), to: '', kind: '정기 변경', text: `매주 ${DL[w]} ${pName(p)} ${q}개 (이전 정기: ${before})` })
      return done(`${c.name} 매주 ${DL[w]}요일 ${pName(p)} ${q}개`, 'customers')
    }),
    T('set_day_items', '특정 날짜 하루만 이 고객의 정기 품목을 이 목록으로 바꾸기. 다른 날은 그대로. 빈 배열이면 그날 정기 없음.', { customer_id: S_, date: S_, items: ITEMS }, ['customer_id', 'date', 'items'], i => {
      const c = cust(i.customer_id); const d = day(i.date)
      const items = aggList((i.items || []).map(x => ({ pid: pid(x.product_id), qty: Math.max(0, Math.round(+x.qty)) }))).filter(x => x.qty > 0)
      const rec = dayRec(d); rec.ov = rec.ov || {}
      if (stable(items) === stable(regularFor(c, d))) delete rec.ov[c.id]; else rec.ov[c.id] = { items, skip: false }
      if (refreshPerfKey(d, c.id)) ctx.changed.add('perf')
      L({ cid: c.id, from: d, kind: '하루 변경', text: `이날만 ${items.map(x => pShort(x.pid) + ' ' + x.qty).join(', ') || '정기 없음'}` })
      return done(`${fmt(d)} ${c.name} 하루만 ${items.map(x => pShort(x.pid) + ' ' + x.qty).join(', ') || '정기 없음'}`, 'days')
    }),
    T('skip_day', '특정 날짜 하루만 정기 배달 빼기(skip=true) 또는 되돌리기(skip=false).', { customer_id: S_, date: S_, skip: B_ }, ['customer_id', 'date', 'skip'], i => {
      const c = cust(i.customer_id); const d = day(i.date); const rec = dayRec(d); rec.ov = rec.ov || {}
      if (i.skip) rec.ov[c.id] = { items: [], skip: true }; else delete rec.ov[c.id]
      if (refreshPerfKey(d, c.id)) ctx.changed.add('perf')
      L({ cid: c.id, from: d, kind: i.skip ? '미전달' : '하루 변경', text: i.skip ? '이날 정기 배달 뺌' : '이날 빼기 취소' })
      return done(`${fmt(d)} ${c.name} ${i.skip ? '정기 배달 뺌' : '빼기 취소'}`, 'days')
    }),
    T('add_pause', '기간 동안 배달 중지 (끝나면 자동 재개). weekdays를 주면 그 요일만 쉼.', { customer_id: S_, from: S_, to: S_, weekdays: { type: 'array', items: N_ }, reason: S_ }, ['customer_id', 'from', 'to'], i => {
      const c = cust(i.customer_id); const f = day(i.from), t = day(i.to); if (t < f) throw new Error('끝 날짜가 시작보다 빨라요')
      const p = { id: uid('p_'), from: f, to: t, reason: i.reason || '', ack: false, days: (i.weekdays || []).map(Number).filter(x => x >= 1 && x <= 6) }
      c.pauses.push(p); L({ cid: c.id, from: f, to: t, kind: '중지', text: `배달 중지${pauseDays(p)}${p.reason ? ' · ' + p.reason : ''}` })
      if (refreshPerfFrom(c.id, f)) ctx.changed.add('perf')
      return done(`${c.name} ${fmtShort(f)}–${fmtShort(t)} 중지${pauseDays(p)}`, 'customers')
    }),
    T('remove_pause', '중지 기간 삭제 (pause_id는 get_customer로 확인).', { customer_id: S_, pause_id: S_ }, ['customer_id', 'pause_id'], i => {
      const c = cust(i.customer_id); const p = c.pauses.find(x => x.id === i.pause_id); if (!p) throw new Error('중지 기간이 없어요')
      c.pauses = c.pauses.filter(x => x.id !== p.id); L({ cid: c.id, from: p.from, to: p.to, kind: '중지', text: '중지 취소' })
      if (refreshPerfFrom(c.id, p.from)) ctx.changed.add('perf')
      return done(`${c.name} ${fmtShort(p.from)}–${fmtShort(p.to)} 중지 취소`, 'customers')
    }),
    T('set_status', '계약 상태: active(배달 중), waiting(시작 대기), stopped(중단), ended(해지), moved(이사). date는 적용 시작일(그 전날까지 배달). 명단에서 지우지 않음.', { customer_id: S_, status: { type: 'string', enum: Object.keys(STATUS_NAME) }, date: S_, note: S_ }, ['customer_id', 'status'], i => {
      const c = cust(i.customer_id); const st = STATUS_NAME[i.status] ? i.status : null; if (!st) throw new Error('상태 값이 틀려요')
      const prev = STATUS_NAME[c.status]; c.status = st; c.active = st === 'active'; c.endDate = st === 'active' ? '' : (i.date ? day(i.date) : ''); if (i.note) c.statusNote = i.note
      if (c.endDate && refreshPerfFrom(c.id, c.endDate)) ctx.changed.add('perf')
      L({ cid: c.id, from: c.endDate || TODAY(), to: '', kind: '상태', text: `${STATUS_NAME[st]}${c.endDate ? ' · ' + fmt(c.endDate) + '부터' : ''}${i.note ? ' · ' + i.note : ''} (이전: ${prev})` })
      return done(`${c.name} ${STATUS_NAME[st]}${c.endDate ? ' ' + fmtShort(c.endDate) + '부터' : ''}`, 'customers')
    }),
    T('update_customer', '고객 정보 고치기. 바꿀 것만 넣어: name, phone, building, unit, label, payment(card|account|cash|prepaid), notes_append, notes_replace, paid_this_month(true/false), holiday_off(공휴일에 쉬는 곳이면 true).', { customer_id: S_, name: S_, phone: S_, building: S_, unit: S_, label: S_, payment: S_, notes_append: S_, notes_replace: S_, paid_this_month: B_, holiday_off: B_ }, ['customer_id'], i => {
      const c = cust(i.customer_id); const a = clone(c)
      if (i.name) c.name = i.name; if (i.phone) c.phone = i.phone; if (i.building) c.loc.building = String(i.building); if (i.unit) c.loc.unit = String(i.unit); if (i.label != null) c.loc.label = i.label
      if (PAY[i.payment]) c.payment = i.payment
      if (typeof i.holiday_off === 'boolean') c.holidayOff = i.holiday_off
      if (i.notes_replace != null) c.notes = i.notes_replace; else if (i.notes_append) c.notes = (c.notes ? c.notes + ' / ' : '') + i.notes_append
      if (i.paid_this_month != null) { c.paidMonth = i.paid_this_month ? MONTH() : ''; L({ cid: c.id, from: TODAY(), kind: '수금', text: `${MONTH().slice(5)}월 현금 ${i.paid_this_month ? '수금 완료' : '미수'}` }) }
      custDiff(a, c).forEach(d => L({ cid: c.id, ...d }))
      if (i.building && ensureRouteOrder()) ctx.changed.add('config')
      return done(`${c.name} 정보 수정`, 'customers')
    }),
    T('add_customer', '새 정기 고객 추가.', { name: S_, building: S_, unit: S_, label: S_, phone: S_, payment: S_, notes: S_, regular: { type: 'array', items: { type: 'object', properties: { product_id: S_, qty: N_, weekdays: { type: 'array', items: N_ } }, required: ['product_id', 'qty', 'weekdays'] } } }, ['name', 'building'], i => {
      const c = normCust({ name: i.name, phone: i.phone || '', loc: { type: isNumB(i.building) ? 'apt' : 'store', building: String(i.building), unit: String(i.unit || ''), label: i.label || '' }, payment: PAY[i.payment] ? i.payment : 'card', notes: i.notes || '', regular: (i.regular || []).map(r => ({ productId: pid(r.product_id), qty: Math.max(1, Math.round(+r.qty)), days: (r.weekdays || []).map(Number) })) })
      S.customers.push(c); ensureRouteOrder()
      L({ cid: c.id, from: TODAY(), to: '', kind: '고객 정보', text: `새 고객 · 정기 ${regularText(c)}` })
      return done(`새 고객 ${c.name} ${locShort(c.loc)}`, 'customers', 'config')
    }),
    T('add_reminder', '홈 화면 “확인할 것”에 넣기 (점장님께 물어볼 것, 나중에 확인할 것). due는 YYYY-MM-DD, 없으면 비워.', { text: S_, due: S_ }, ['text'], i => {
      S.config.todos.push({ id: uid('t_'), text: String(i.text), at: Date.now(), due: i.due ? day(i.due) : '', done: false, doneAt: 0 })
      return done(`확인할 것 추가: ${i.text}`, 'config')
    }),
    T('done_reminder', '“확인할 것” 하나를 확인 완료로', { id: S_ }, ['id'], i => {
      const t = S.config.todos.find(x => x.id === i.id); if (!t) throw new Error('그 id가 없어요: ' + i.id)
      t.done = true; t.doneAt = Date.now(); L({ kind: '메모', from: TODAY(), to: TODAY(), text: '확인 완료: ' + t.text })
      return done(`확인 완료: ${t.text}`, 'config')
    }),
    T('add_log', '데이터는 그대로 두고 기록만 남기기 (지난 날짜 미전달, 고객 요청 메모 등). to 비우면 계속.', { customer_id: S_, name: S_, loc: S_, from: S_, to: S_, kind: { type: 'string', enum: LOG_KINDS }, text: S_ }, ['text'], i => {
      const c = i.customer_id ? cust(i.customer_id) : null
      L({ cid: c?.id || null, name: c ? '' : (i.name || ''), loc: c ? '' : (i.loc || ''), from: i.from ? day(i.from) : '', to: i.to ? day(i.to) : (i.from ? day(i.from) : ''), kind: i.kind || '기타', text: i.text })
      return done(`기록: ${c ? c.name + ' ' : ''}${i.text}`)
    }),
    T('find_customers', '이름·동-호·메모로 고객 찾기.', { query: S_ }, ['query'], i => {
      const q = String(i.query || '').replace(/\s+/g, '').toLowerCase()
      return S.customers.filter(c => (c.name + locShort(c.loc) + c.loc.building + c.loc.unit + c.loc.label + c.notes).replace(/\s+/g, '').toLowerCase().includes(q)).slice(0, 12).map(c => ({ id: c.id, name: c.name, loc: locShort(c.loc), status: STATUS_NAME[c.status] }))
    }),
    T('get_customer', '고객 한 명의 전체 정보: 정기 품목, 중지 기간(id 포함), 상태, 메모, 앞으로 주문, 최근 변경 기록.', { customer_id: S_ }, ['customer_id'], i => {
      const c = cust(i.customer_id)
      return { id: c.id, name: c.name, loc: locShort(c.loc), label: c.loc.label, phone: c.phone, status: STATUS_NAME[c.status], endDate: c.endDate, payment: PAY[c.payment], paidThisMonth: c.paidMonth === MONTH(), notes: c.notes, regular: c.regular.map(r => ({ product: pName(r.productId), qty: r.qty, days: r.days.map(d => DL[d]).join(''), every: r.every === 2 ? '격주' : '매주', anchor: r.anchor })), pauses: c.pauses, orders: S.orders.filter(o => o.customerId === c.id && o.date >= addDays(TODAY(), -14)).map(o => ({ id: o.id, date: o.date, type: TYPE_NAME[o.type], items: itemsText(o.items), status: o.status })), recentLog: S.log.filter(e => e.cid === c.id).slice(0, 10).map(e => `${whenText(e)} ${e.kind}: ${e.text}`) }
    }),
    T('get_day', '특정 날짜 배달 목록 (순서, 동-호, 이름, 제품, 메모, 완료 여부).', { date: S_ }, ['date'], i => {
      const d = day(i.date); const dn = S.days[d]?.done || {}
      const st = orderedStops(d).filter(s => !s.skipped)
      return { date: d, count: st.length, stops: st.map((s, k) => `${k + 1}. ${locShort(s.loc)} ${s.name}: ${itemAgg(s).map(x => pShort(x.pid) + ' ' + x.q + (x.ty === 'regular' ? '' : '(' + TYPE_NAME[x.ty] + ')')).join(', ')}${dn[s.key] ? ' ✓' : ''}${stopNotes(s) ? ' / ' + stopNotes(s) : ''}`) }
    }),
    T('get_order_sheet', '특정 배달일 발주표: 출고신청 이름별 필요·재고·발주 수량.', { date: S_ }, ['date'], i => {
      const d = day(i.date)
      return { date: d, orderDay: orderDayFor(d), rows: sheetFor(d).filter(r => r.need || r.excl).map(r => ({ name: r.p.orderName || r.p.name, need: r.need, stock: r.stock, buy: r.buy, excluded: r.excl })) }
    }),
    T('get_performance', '월 실적. month=YYYY-MM. customer_id 주면 그 고객의 제품별 수량과 날짜별 내역.', { month: S_, customer_id: S_ }, ['month'], i => {
      const m = String(i.month || MONTH()).slice(0, 7); const data = perfData(m, false)
      if (i.customer_id) { const r = data.get(String(i.customer_id)); if (!r) return { month: m, none: true }; return { month: m, name: r.name, products: Object.fromEntries(Object.entries(r.prod).map(([p, n]) => [pName(p), n])), total: r.total, days: r.dates.map(d => `${d.date} ${d.items.map(x => pShort(x.pid) + ' ' + x.qty).join(', ')}`) } }
      return { month: m, customers: [...data.values()].map(r => `${r.name} ${r.loc}: ${r.total}개`) }
    }),
    T('get_log', '변경 기록 검색 (최근 순).', { query: S_, limit: N_ }, [], i => {
      const q = String(i.query || '').replace(/\s+/g, '').toLowerCase()
      return S.log.filter(e => !q || (e.name + e.loc + e.text + e.kind).replace(/\s+/g, '').toLowerCase().includes(q)).slice(0, Math.min(40, +i.limit || 20)).map(e => `[기록 ${dayOf(e.at)}] ${whenText(e)} ${e.name} ${e.loc} ${e.kind}: ${e.text}`)
    }),
  ]
}

// Tool definitions as sent to the AI (same order every time, so the AI side can cache them)
export const toolSchemas = tools => tools.map(t => ({ name: t.name, description: t.description, input_schema: t.input_schema }))
