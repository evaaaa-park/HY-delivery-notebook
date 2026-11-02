// Home-screen alerts. Each alert: { kind: 'info'|'ok'|'bad'|'warn', who?, title, sub, action? }
// who = bold part (usually a customer name), title = the rest of the first line,
// action = { label, act, ...params } handled by the home view.
import { S } from '@/store/state'
import { STATUS_NAME } from './constants'
import { TODAY, addDays, daysBetween, fmt, fmtShort } from '@/lib/dates'
import { isOn, locShort, pShort, cashUnpaid } from './model'
import { nextDeliveryDay, pauseDays, orderTarget, routeDefaultDate, isHoliday, isPartHol, holidayName } from './calendar'
import { sheetFor, confirmDiff } from './stops'
import { billStatus } from './bills'

export function buildAlerts() {
  const t = TODAY(); const out = []
  for (const c of S.customers) {
    if (c.status !== 'active' && c.endDate) { const de = daysBetween(t, c.endDate); if (de >= 0 && de <= 3) out.push({ kind: 'info', who: c.name, title: `${fmt(c.endDate)}부터 ${STATUS_NAME[c.status]}`, sub: `${locShort(c.loc)}${c.statusNote ? ' · ' + c.statusNote : ''} · 전날까지 배달해요` }) }
    if (!isOn(c, t)) continue
    for (const p of c.pauses) {
      if (p.ack) continue
      const resume = nextDeliveryDay(p.to)
      const dd = daysBetween(t, resume)
      if (dd >= -2 && dd <= 3) out.push({ kind: 'ok', who: c.name, title: `배달 재개 ${fmt(resume)}`, sub: `${fmtShort(p.from)}–${fmtShort(p.to)} 중지 끝 · 동선과 발주표에 자동으로 다시 들어가요`, action: { label: '확인', act: 'ackPause', id: c.id, p: p.id } })
      const ds = daysBetween(t, p.from)
      if (ds >= 0 && ds <= 2) out.push({ kind: 'info', who: c.name, title: `${fmt(p.from)}부터 배달 중지${pauseDays(p)}`, sub: `${fmtShort(p.from)}–${fmtShort(p.to)}${p.reason ? ' · ' + p.reason : ''}` })
    }
  }
  const tgt = orderTarget()
  for (let d = t; d <= tgt; d = addDays(d, 1)) {
    const diff = confirmDiff(d, sheetFor(d))
    if (diff && diff.length) {
      const txt = diff.map(x => `${x.name} ${x.d > 0 ? '+' : ''}${x.d}`).join(', ')
      out.push({ kind: 'bad', who: `${fmt(d)} 발주 확정 후 바뀜`, title: '', sub: txt + (d < tgt ? ' · 이미 발주한 날짜라 재고나 지점 추가 요청이 필요해요' : ''), action: { label: '보기', act: 'gotoOrder', date: d } })
    }
  }
  const dd = routeDefaultDate()
  for (const d of [dd, nextDeliveryDay(dd)]) {
    const n = S.orders.filter(o => o.date === d && o.type === 'sample' && o.status === 'open')
    if (n.length) out.push({ kind: 'info', who: '지점에서 견본 받아오기', title: `${fmt(d)} 배달분 ${n.length}건`, sub: n.map(o => o.items.map(i => `${pShort(i.productId)}×${i.qty}`).join(' ')).join(' / '), items: n.flatMap(o => o.items) })
  }
  for (const d of [...new Set([dd, orderTarget()])]) {
    if (isHoliday(d)) out.push({ kind: 'info', who: `${fmt(d)} ${holidayName(d)}`, title: '', sub: '정기 배달 없음' })
    else if (isPartHol(d)) { const off = S.customers.filter(c => c.holidayOff && isOn(c, d)); out.push({ kind: 'info', who: `${fmt(d)} ${holidayName(d)}`, title: '· 공휴일', sub: `아파트는 배달 · ${off.map(c => c.name).join(', ') || '쉬는 곳 없음'} 쉼` }) }
  }
  const unpaid = S.customers.filter(cashUnpaid)
  const bs = billStatus()
  if (bs && bs.left.length) out.push({ kind: bs.off.length ? 'warn' : 'info', who: bs.B.label, title: `${bs.rows.length - bs.left.length}/${bs.rows.length}명 전달`, sub: bs.off.length ? `배달 없는 고객 ${bs.off.length}명 · 따로 전달: ` + bs.off.map(r => `${r.c.name}(${locShort(r.c.loc)})`).join(', ') : '남은 고객은 모두 다가오는 동선에 청구서 표시가 있어요', action: { label: '목록', act: 'openBills' } })
  if (unpaid.length) out.push({ kind: 'warn', who: `현금 수금 남은 고객 ${unpaid.length}명`, title: '', sub: unpaid.slice(0, 6).map(c => c.name).join(', ') + (unpaid.length > 6 ? ' 외' : ''), action: { label: '보기', act: 'filterCash' } })
  return out
}
