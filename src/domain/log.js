// Change log: every request is recorded with two dates, when it was entered (at) and which
// delivery dates it is about (from–to; to '' = ongoing).
import { S } from '@/store/state'
import { STATUS_NAME, PAY } from './constants'
import { TODAY, fmt, fmtShort, daysText } from '@/lib/dates'
import { uid } from '@/lib/util'
import { custById, locShort, pShort } from './model'
import { pauseDays } from './calendar'

export function logChange(e) {
  const c = e.cid ? custById(e.cid) : null
  const now = Date.now()
  if (e.merge) { const last = S.log[0]; if (last && last.merge === e.merge && now - last.at < 120000) { last.text = e.text; last.at = now; return last.id } }
  const entry = { id: uid('l_'), at: now, cid: e.cid || null, name: e.name || c?.name || '', loc: e.loc || (c ? locShort(c.loc) : ''), from: e.from || '', to: e.to === undefined ? (e.from || '') : e.to, kind: e.kind || '기타', text: e.text || '', by: e.by || '직접' }
  if (e.merge) entry.merge = e.merge
  if (e.tags) entry.tags = e.tags
  S.log.unshift(entry)
  return entry.id
}
export const logMark = () => S.log[0]?.id || null
// undo helper: drop every entry recorded after `mark`
export function dropLogsSince(mark) { const i = mark ? S.log.findIndex(e => e.id === mark) : S.log.length; S.log = S.log.slice(i < 0 ? 0 : i) }
export const sortLog = () => S.log.sort((a, b) => b.at - a.at)

export function whenText(e) {
  if (!e.from) return '날짜 없음'
  if (!e.to || e.to >= '2099') return fmt(e.from) + '부터'
  if (e.to === e.from) return fmt(e.from)
  return `${fmtShort(e.from)}–${fmtShort(e.to)}`
}
export function regularText(c) {
  const parts = c.regular.filter(r => r.qty > 0).map(r => `${r.every === 2 ? '격주 ' : ''}${daysText(r.days)} ${pShort(r.productId)} ${r.qty}`)
  return parts.join(', ') || '없음'
}
// what changed between two versions of a customer, as log lines
export function custDiff(a, b) {
  const out = []; const t = TODAY()
  if (regularText(a) !== regularText(b)) out.push({ kind: '정기 변경', from: t, to: '', text: `정기 품목: ${regularText(b)} (이전: ${regularText(a)})` })
  if (a.status !== b.status || a.endDate !== b.endDate) out.push({ kind: '상태', from: b.endDate || t, to: '', text: `${STATUS_NAME[b.status]}${b.endDate ? ' · ' + fmt(b.endDate) + '부터' : ''}${b.statusNote ? ' · ' + b.statusNote : ''} (이전: ${STATUS_NAME[a.status]})` })
  const pa = new Set(a.pauses.map(p => p.id))
  b.pauses.filter(p => !pa.has(p.id)).forEach(p => out.push({ kind: '중지', from: p.from, to: p.to, text: `배달 중지${pauseDays(p)}${p.reason ? ' · ' + p.reason : ''}` }))
  const pb = new Set(b.pauses.map(p => p.id))
  a.pauses.filter(p => !pb.has(p.id)).forEach(p => out.push({ kind: '중지', from: p.from, to: p.to, text: `중지 취소${pauseDays(p)}` }))
  if ((a.notes || '') !== (b.notes || '')) out.push({ kind: '메모', from: '', to: '', text: `메모: ${b.notes || '(지움)'}` })
  const info = []
  if (a.name !== b.name) info.push(`이름 ${a.name} → ${b.name}`)
  if (a.phone !== b.phone) info.push(`연락처 ${b.phone}`)
  if (locShort(a.loc) !== locShort(b.loc) || a.loc.label !== b.loc.label) info.push(`위치 ${locShort(b.loc)} ${b.loc.label || ''}`.trim())
  if (a.payment !== b.payment) info.push(`수금 ${PAY[b.payment]}`)
  if (info.length) out.push({ kind: '고객 정보', from: '', to: '', text: info.join(' · ') })
  return out
}
