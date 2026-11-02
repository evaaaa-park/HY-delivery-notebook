// Buildings (동), units (호), entrances (1·2호 / 3·4호) and the automatic route order.
import { S } from '@/store/state'

export function parseUnit(u) {
  u = String(u || '').trim(); let m
  if ((m = u.match(/^(\d{3,4})$/))) { const n = +m[1]; return { floor: Math.floor(n / 100), line: n % 100 } }
  if ((m = u.match(/^B\s?(\d+)/i)) || (m = u.match(/지하\s?(\d+)/))) return { floor: -(+m[1]), line: 0 }
  if ((m = u.match(/^(\d+)\s*층/))) return { floor: +m[1], line: 0 }
  return { floor: null, line: 0 }
}
export const isNumB = b => /^\d+$/.test(String(b || ''))
export const bldName = b => isNumB(b) ? b + '동' : ({ '상가B': '상가 B동', '2보안실': '상가 2보안실', '주민센터': '가락1동 주민센터', '경로당': '4단지 경로당' }[b] || b || '위치 없음')
export function locText(loc) {
  if (!loc) return ''
  if (loc.label) return loc.label
  if (isNumB(loc.building)) return `${loc.building}동 ${loc.unit}${isNumB(loc.unit) ? '호' : ''}`.trim()
  return [bldName(loc.building), loc.unit].filter(Boolean).join(' ')
}
export function seriesOf(b) { b = String(b || ''); if (/^\d{3}$/.test(b)) return b[0] + '단지'; return '상가·기타' }

/* ---------- entrances (1·2호 / 3·4호 or 3·4·5호) ---------- */
export function entrancesOf(b) {
  const o = S.config.entrances && S.config.entrances[b]
  if (Array.isArray(o) && o.length) return o
  return [[1, 2], [3, 4, 5, 6, 7, 8, 9]]
}
export function entIndex(b, line) {
  if (!line || !isNumB(b)) return -1
  const E = entrancesOf(b); const i = E.findIndex(g => g.includes(line))
  return i < 0 ? E.length - 1 : i
}
export function linesIn(b) {
  const s = new Set()
  S.customers.forEach(c => { if (c.loc.building === b) { const u = parseUnit(c.loc.unit); if (u.line) s.add(u.line) } })
  S.orders.forEach(o => { if (o.loc && o.loc.building === b) { const u = parseUnit(o.loc.unit); if (u.line) s.add(u.line) } })
  return s
}
export function entLines(b, idx) {
  const g = entrancesOf(b)[idx] || []; if (!g.length) return []
  const present = linesIn(b); const used = g.filter(l => present.has(l))
  const max = Math.max(...used, g[Math.min(1, g.length - 1)])
  return g.filter(l => l <= max)
}
export const singleEnt = b => entrancesOf(b).length <= 1
export const entName = (b, idx) => idx < 0 || singleEnt(b) ? '' : entLines(b, idx).join('·') + '호'
export function subLabel(loc) {
  const b = loc?.building || ''; const u = parseUnit(loc?.unit)
  if (u.floor != null && u.floor < 0) return '지하'
  const i = entIndex(b, u.line); const n = entName(b, i)
  return n ? n + ' 입구' : ''
}
export function groupKey(loc) {
  const b = loc?.building || ''; const u = parseUnit(loc?.unit)
  if (u.floor != null && u.floor < 0) return b + '|B'
  return b + '|' + entIndex(b, u.line)
}
export function groupLabel(loc) {
  const b = loc?.building || ''; const u = parseUnit(loc?.unit)
  if (u.floor != null && u.floor < 0) return bldName(b) + ' · 지하'
  const i = entIndex(b, u.line)
  const n = entName(b, i)
  return bldName(b) + (n ? ' · ' + n + ' 입구' : '')
}

/* ---------- automatic route order: building rank → entrance → floor ---------- */
export function autoKey(loc) {
  const order = S.config.routeOrder; const b = loc?.building || ''
  let r = order.indexOf(b); if (r < 0) r = order.length + (parseInt(b) || 999)
  const { floor, line } = parseUnit(loc?.unit)
  const ent = line ? entIndex(b, line) + 1 : 0
  let f = 0; if (floor != null) f = floor < 0 ? -10000 + floor : (S.config.floorDir === 'desc' ? -floor : floor)
  return [r, ent, f, line, String(loc?.unit || '')]
}
export function cmpKey(a, b) { for (let i = 0; i < a.length; i++) { if (a[i] < b[i]) return -1; if (a[i] > b[i]) return 1 } return 0 }
export const sortAuto = list => list.map(x => ({ x, k: autoKey(x.loc) })).sort((a, b) => cmpKey(a.k, b.k)).map(o => o.x)
// apply a saved order (keys) to a reference list; items not in the saved order slot in near their auto position
export function mergeSeq(ref, seq) {
  if (!seq || !seq.length) return ref.slice()
  const byKey = new Map(ref.map((x, i) => [x.key, { x, i }]))
  const res = []; const used = new Set()
  for (const k of seq) { const e = byKey.get(k); if (e && !used.has(k)) { res.push(e); used.add(k) } }
  ref.forEach((x, i) => {
    if (used.has(x.key)) return
    let pos = 0; for (let j = 0; j < res.length; j++) if (res[j].i < i) pos = j + 1
    res.splice(pos, 0, { x, i })
  })
  return res.map(e => e.x)
}
// new buildings join the route next to their neighbours
export function ensureRouteOrder() {
  const order = S.config.routeOrder; let changed = false
  const blds = new Set()
  S.customers.forEach(c => c.loc.building && blds.add(c.loc.building))
  S.orders.forEach(o => o.loc?.building && blds.add(o.loc.building))
  for (const b of blds) {
    if (order.includes(b)) continue; changed = true
    let pos = -1
    if (/^\d{3}$/.test(b)) {
      const same = order.map((x, i) => [x, i]).filter(([x]) => /^\d{3}$/.test(x) && x[0] === b[0])
      if (same.length) { const sm = same.filter(([x]) => +x < +b); pos = sm.length ? sm[sm.length - 1][1] + 1 : same[0][1] + 1 }
    }
    if (pos < 0) { const l = order.indexOf('상가B'); pos = l >= 0 ? l : order.length }
    order.splice(pos, 0, b)
  }
  return changed
}
