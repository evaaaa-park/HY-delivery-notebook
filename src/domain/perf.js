// 실적 (monthly performance). Each finished delivery day is frozen as a compact snapshot so later edits
// do not rewrite past months; back-dated changes recompute only the affected days.
import { S } from '@/store/state'
import { TY_CODE, CODE_TY, isSched } from './constants'
import { TODAY, addDays, daysBetween, pad, hm, minutesOfDay } from '@/lib/dates'
import { uid, stable } from '@/lib/util'
import { custById, locShort } from './model'
import { isDeliveryDay, isHoliday } from './calendar'
import { stopsFor } from './stops'
import { save, perfWindowStart, freezeReady } from '@/store/sync'

export function liveDay(date) {
  return stopsFor(date).filter(s => !s.skipped).map(s => ({ key: s.key, name: s.name, loc: locShort(s.loc), items: s.items.filter(i => i.type !== 'pickup').map(i => ({ pid: i.pid, qty: i.qty, ty: i.type })) })).filter(e => e.items.length)
}
export function encodeDay(date) {
  const day = { s: {}, n: {}, at: Date.now() }
  liveDay(date).forEach(e => {
    const agg = new Map(); e.items.forEach(i => { const k = i.pid + '*' + TY_CODE[i.ty]; agg.set(k, (agg.get(k) || 0) + i.qty) })
    day.s[e.key] = [...agg].map(([k, q]) => { const j = k.lastIndexOf('*'); return `${k.slice(0, j)}*${q}*${k.slice(j + 1)}` }).join(';')
    if (e.key.startsWith('o:')) day.n[e.key] = `${e.name}|${e.loc}`
  })
  if (daysBetween(date, TODAY()) > 1) day.e = 1 // frozen after the fact: estimated from the list at that time
  if (S.days[date]) { const info = doneInfo(date); day.dt = info.dt; day.cat = info.at }
  return day
}
export function decodeDay(day) {
  return Object.entries(day.s || {}).map(([key, str]) => {
    const c = key.startsWith('o:') ? null : custById(key)
    const nn = (day.n && day.n[key] || '').split('|')
    return {
      key, name: c ? c.name : (nn[0] || '주문'), loc: c ? locShort(c.loc) : (nn[1] || ''),
      items: str ? str.split(';').map(x => { const [pid, q, t] = x.split('*'); return { pid, qty: +q, ty: CODE_TY[t] || 'regular' } }) : [],
    }
  })
}

// past delivery days get a fixed copy so later changes do not rewrite what was delivered
export function maybeFreeze() {
  if (!freezeReady()) return
  if (!S.customers.length) return
  const t = TODAY()
  let changed = false
  if (!S.perf.since) { S.perf.since = t.slice(0, 8) + '01'; changed = true }
  // only inside the loaded window: older days are never re-created from today's data
  const start = [S.perf.since, perfWindowStart()].sort()[1]
  for (let d = start; d < t; d = addDays(d, 1)) {
    if (S.perf.days[d]) { if (S.perf.days[d].dt === undefined && S.days[d] && stampDone(d)) changed = true; continue }
    if (!isDeliveryDay(d) && !S.orders.some(o => o.date === d && o.status === 'open')) continue
    S.perf.days[d] = encodeDay(d); changed = true
  }
  // days finished before completion records existed: stamp the time of the last check
  let logged = false
  Object.keys(S.days).filter(d => d < t && S.days[d].done && !S.days[d].completedAt).forEach(d => {
    const st = dayStatus(d); if (!st.n || st.d !== st.n) return
    const last = Math.max(...Object.values(S.days[d].done)); S.days[d].completedAt = last
    S.log = S.log.filter(e => e.merge !== 'done:' + d)
    const e = { id: uid('l_'), at: last, cid: null, name: '하루 배달', loc: '', from: d, to: d, kind: '배달 완료', text: `${st.n}곳 모두 완료 · 제품 ${st.qty}개${st.orders ? ` · 주문 있는 곳 ${st.orders}` : ''} · ${hm(last)}`, by: '직접', merge: 'done:' + d }
    S.log.push(e); S.log.sort((x, y) => y.at - x.at); stampDone(d); logged = true
  })
  if (logged) save('days', 'log', 'perf')
  else if (changed) save('perf')
}
export function refreshPerfKey(date, key) {
  const day = S.perf.days[date]; if (!day) return false
  const fresh = encodeDay(date)
  if (fresh.s[key] != null) { day.s[key] = fresh.s[key]; if (fresh.n[key]) { day.n = day.n || {}; day.n[key] = fresh.n[key] } } else delete day.s[key]
  return true
}
// 지난 날짜의 휴무일을 넣거나 빼면 그날 실적도 다시 맞춰요
export function holPerf(d) {
  if (!d || d >= TODAY() || !S.perf.days[d]) return
  const f = encodeDay(d); const day = S.perf.days[d]
  if (isHoliday(d)) { day.s = f.s; day.n = f.n }
  else S.customers.filter(c => c.holidayOff).forEach(c => refreshPerfKey(d, c.id))
  save('perf')
}
export function refreshPerfFrom(key, from) {
  if (!from || from >= TODAY()) return false; let any = false
  Object.keys(S.perf.days).forEach(d => { if (d >= from && refreshPerfKey(d, key)) any = true })
  return any
}
export function perfData(month, withFuture) {
  const [y, m] = month.split('-').map(Number); const n = new Date(y, m, 0).getDate()
  const t = TODAY(); const res = new Map()
  for (let d = 1; d <= n; d++) {
    const date = `${month}-${pad(d)}`
    let entries, est = false
    if (S.perf.days[date]) { entries = decodeDay(S.perf.days[date]); est = !!S.perf.days[date].e }
    else if (date <= t || withFuture) { if (!isDeliveryDay(date) && !S.orders.some(o => o.date === date && o.status === 'open')) continue; entries = liveDay(date); est = date > t ? 'plan' : false }
    else continue
    entries.forEach(e => {
      let r = res.get(e.key)
      if (!r) { r = { key: e.key, name: e.name, loc: e.loc, prod: {}, dates: [], total: 0 }; res.set(e.key, r) }
      e.items.forEach(i => { r.prod[i.pid] = (r.prod[i.pid] || 0) + i.qty; r.total += i.qty })
      r.dates.push({ date, items: e.items, est })
    })
  }
  return res
}
export function perfOrder(list) {
  const idx = new Map((S.config.baseSeq || []).map((k, i) => [k, i]))
  return list.sort((a, b) => (idx.has(a.key) ? idx.get(a.key) : 9999) - (idx.has(b.key) ? idx.get(b.key) : 9999) || a.loc.localeCompare(b.loc))
}
export const prodOrderIdx = pid => { const i = S.config.products.findIndex(p => p.id === pid); return i < 0 ? 999 : i }

/* ---------- daily completion record ---------- */
// completion summary + per-stop check times (minutes after midnight, KST), kept with the day's 실적 snapshot
export function doneInfo(date) {
  const done = S.days[date]?.done || {}
  const dt = {}; Object.keys(done).forEach(k => { dt[k] = minutesOfDay(done[k]) })
  return { dt, at: S.days[date]?.completedAt || 0 }
}
export function stampDone(date) {
  const day = S.perf.days[date]; if (!day || !S.days[date]) return false
  const info = doneInfo(date); const was = stable({ dt: day.dt || {}, at: day.cat || 0 })
  day.dt = info.dt; day.cat = info.at
  return was !== stable({ dt: day.dt, at: day.cat })
}
export function dayStatus(date) {
  const frozen = S.perf.days[date]
  const entries = frozen ? decodeDay(frozen) : liveDay(date)
  const doneMap = S.days[date]?.done
  const isDone = k => doneMap ? !!doneMap[k] : !!(frozen?.dt && frozen.dt[k] != null)
  const timeOf = k => doneMap && doneMap[k] ? hm(doneMap[k]) : (frozen?.dt && frozen.dt[k] != null ? `${pad(Math.floor(frozen.dt[k] / 60))}:${pad(frozen.dt[k] % 60)}` : '')
  const n = entries.length, d = entries.filter(e => isDone(e.key)).length
  const qty = entries.reduce((s, e) => s + e.items.reduce((a, i) => a + i.qty, 0), 0)
  const orders = entries.filter(e => e.items.some(i => !isSched(i.ty))).length
  const at = S.days[date]?.completedAt || frozen?.cat || 0
  const times = entries.map(e => timeOf(e.key)).filter(Boolean).sort()
  return { entries, n, d, qty, orders, at, isDone, timeOf, first: times[0] || '', last: times[times.length - 1] || '' }
}
