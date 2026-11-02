// Who gets what on a given day, the route order, and the T-2 ordering sheet.
import { S } from '@/store/state'
import { TYPES } from './constants'
import { dow } from '@/lib/dates'
import { custById, prodById, isOn, isX, pName } from './model'
import { isHoliday, isPartHol, pauseOn, onCycle } from './calendar'
import { sortAuto, mergeSeq } from './location'

export function dayRec(date) { return S.days[date] || (S.days[date] = {}) }

export function stopsFor(date) {
  const map = new Map(); const w = dow(date)
  const regularDay = S.config.deliveryDays.includes(w) && !isHoliday(date); const partHol = isPartHol(date)
  const ovs = S.days[date]?.ov || {}
  for (const c of S.customers) {
    const ov = ovs[c.id]
    if (ov) { map.set(c.id, { key: c.id, cust: c, items: ov.skip ? [] : (ov.items || []).filter(i => i.qty > 0).map(i => ({ pid: i.pid, qty: i.qty, type: c.payment === 'prepaid' ? 'prepaid' : 'regular' })), orders: [], ov: true }); continue }
    if (!regularDay || !isOn(c, date) || pauseOn(c, date)) continue
    if (partHol && c.holidayOff) continue
    const items = c.regular.filter(r => r.qty > 0 && r.days.includes(w) && onCycle(r, date))
    if (items.length) map.set(c.id, { key: c.id, cust: c, items: items.map(r => ({ pid: r.productId, qty: r.qty, type: c.payment === 'prepaid' ? 'prepaid' : 'regular' })), orders: [] })
  }
  for (const o of S.orders) {
    if (o.date !== date || o.status === 'cancelled') continue
    const c = o.customerId ? custById(o.customerId) : null
    const key = c ? c.id : 'o:' + o.id
    let st = map.get(key)
    if (!st) { st = { key, cust: c, items: [], orders: [] }; map.set(key, st) }
    st.orders.push(o)
    o.items.forEach(it => st.items.push({ pid: it.productId, qty: it.qty, type: o.type, nb: !!o.noBuy || isX(it.productId) }))
  }
  return [...map.values()].map(st => ({ ...st, skipped: st.items.length === 0, loc: st.cust ? st.cust.loc : (st.orders[0]?.loc || { building: '', unit: '' }), name: st.cust ? st.cust.name : (st.orders[0]?.name || '이름 없음') }))
}

// building rank → entrance → floor, then the saved base order, then that day's drag changes
export function orderedStops(date) {
  let ref = sortAuto(stopsFor(date))
  if (S.config.baseSeq) ref = mergeSeq(ref, S.config.baseSeq)
  const day = S.days[date]; if (day?.seq) ref = mergeSeq(ref, day.seq)
  return ref
}

export function demand(date) {
  const res = {}
  for (const st of stopsFor(date)) for (const it of st.items) {
    if (it.type === 'pickup' || it.nb) continue
    const r = res[it.pid] || (res[it.pid] = { ...Object.fromEntries(TYPES.map(t => [t, 0])), rows: [] })
    r[it.type] += it.qty; r.rows.push({ name: st.name, loc: st.loc, qty: it.qty, type: it.type })
  }
  return res
}

export function sheetFor(date) {
  const d = demand(date), P = S.config.purchase
  const rows = S.config.products.map(p => {
    const r = d[p.id] || { ...Object.fromEntries(TYPES.map(t => [t, 0])), rows: [] }
    const need = TYPES.reduce((s, t) => s + (P[t] ? r[t] : 0), 0)
    const stock = Math.max(0, +(S.config.stock[p.id] || 0))
    return { p, r, need, stock, buy: Math.max(0, need - stock), excl: TYPES.reduce((s, t) => s + (!P[t] ? r[t] : 0), 0) }
  })
  // products that appear in orders but are no longer in the catalog
  for (const pid of Object.keys(d)) if (!prodById(pid)) { const r = d[pid]; const need = TYPES.reduce((s, t) => s + (P[t] ? r[t] : 0), 0); rows.push({ p: { id: pid, name: pid, short: pid, orderName: pid, hue: 0 }, r, need, stock: 0, buy: need, excl: 0 }) }
  return rows
}

export function confirmDiff(date, rows) {
  const conf = S.days[date]?.confirmed; if (!conf) return null
  const out = []; const seen = new Set()
  for (const r of rows) { seen.add(r.p.id); const c = +conf[r.p.id] || 0; if (r.buy !== c) out.push({ id: r.p.id, name: r.p.name, d: r.buy - c }) }
  for (const pid of Object.keys(conf)) if (!seen.has(pid) && +conf[pid]) out.push({ id: pid, name: pName(pid), d: -conf[pid] })
  return out
}

// items of a stop merged per product and order type
export function itemAgg(st) {
  const agg = new Map()
  st.items.forEach(it => { const k = it.pid + '|' + it.type; agg.set(k, (agg.get(k) || 0) + it.qty) })
  return [...agg].map(([k, q]) => { const i = k.lastIndexOf('|'); return { pid: k.slice(0, i), ty: k.slice(i + 1), q } })
}
export const stopNotes = st => [st.cust?.notes, ...st.orders.map(o => o.note)].filter(Boolean).join(' / ')

export function aggList(list) { const m = new Map(); list.forEach(i => m.set(i.pid, (m.get(i.pid) || 0) + i.qty)); return [...m].map(([pid, qty]) => ({ pid, qty })) }
export function regularFor(c, date) { const w = dow(date); return aggList(c.regular.filter(r => r.qty > 0 && r.days.includes(w) && onCycle(r, date)).map(r => ({ pid: r.productId, qty: r.qty }))) }
// set the weekly (not every-other-week) quantities for one weekday
export function applyWeek(c, w, list) {
  const want = Object.fromEntries(list.map(i => [i.pid, i.qty]))
  const pids = new Set([...c.regular.filter(r => r.every !== 2 && r.days.includes(w)).map(r => r.productId), ...Object.keys(want)])
  for (const pid of pids) {
    const cur = c.regular.filter(r => r.every !== 2 && r.productId === pid && r.days.includes(w)).reduce((s, r) => s + r.qty, 0)
    const nq = want[pid] || 0; if (cur === nq) continue
    c.regular.forEach(r => { if (r.every !== 2 && r.productId === pid && r.days.includes(w)) r.days = r.days.filter(d => d !== w) })
    c.regular = c.regular.filter(r => r.days.length)
    if (nq > 0) { const same = c.regular.find(r => r.every !== 2 && r.productId === pid && r.qty === nq); if (same) same.days = [...same.days, w].sort(); else c.regular.push({ productId: pid, qty: nq, days: [w], every: 1, anchor: '' }) }
  }
}

export const isDelivered = o => { const c = o.customerId ? custById(o.customerId) : null; return !!S.days[o.date]?.done?.[c ? c.id : 'o:' + o.id] }
