// Delivery days, holidays, the T-2 ordering calendar, pauses and every-other-week cycles.
import { S } from '@/store/state'
import { addDays, dow, daysBetween, DL, TODAY } from '@/lib/dates'

// full = 모든 정기 배달 쉼 / partial = 공휴일: 아파트는 배달, 공휴일에 쉬는 곳(상가·주민센터·미화/관리)만 빠짐
export const isHoliday = d => S.config.holidays.some(h => h.date === d && h.mode !== 'partial')
export const isPartHol = d => S.config.holidays.some(h => h.date === d && h.mode === 'partial')
export const holidayName = d => S.config.holidays.find(h => h.date === d)?.name || '휴무'
export const isWorkday = d => { const w = dow(d); return w >= 1 && w <= 5 && !isHoliday(d) }
export const isDeliveryDay = d => S.config.deliveryDays.includes(dow(d)) && !isHoliday(d)
export function nextDeliveryDay(d) { let x = d; for (let i = 0; i < 40; i++) { x = addDays(x, 1); if (isDeliveryDay(x)) return x } return addDays(d, 1) }
export function prevDeliveryDay(d) { let x = d; for (let i = 0; i < 40; i++) { x = addDays(x, -1); if (isDeliveryDay(x)) return x } return addDays(d, -1) }
export function orderingDay(today) { if (S.config.leadMode === 'calendar') return today; let x = today; for (let i = 0; i < 20 && !isWorkday(x); i++) x = addDays(x, 1); return x }
export function targetFrom(day) {
  const L = Math.max(0, +S.config.leadDays || 0); let x = day
  if (S.config.leadMode === 'calendar') x = addDays(day, L)
  else { let n = 0; for (let i = 0; i < 60 && n < L; i++) { x = addDays(x, 1); if (isWorkday(x)) n++ } }
  return isDeliveryDay(x) ? x : nextDeliveryDay(x)
}
export function orderTarget() { return targetFrom(orderingDay(TODAY())) }
export function orderDayFor(t) {
  const L = Math.max(0, +S.config.leadDays || 0)
  if (S.config.leadMode === 'calendar') return addDays(t, -L)
  let x = t, n = 0; for (let i = 0; i < 60 && n < L; i++) { x = addDays(x, -1); if (isWorkday(x)) n++ } return x
}
export const pauseOn = (c, d) => c.pauses.find(p => p.from <= d && d <= p.to && (!p.days || !p.days.length || p.days.includes(dow(d))))
export const pauseDays = p => p.days && p.days.length ? ' (' + p.days.map(x => DL[x]).join('') + '요일만)' : ''
// every-other-week items: deliver on weeks an even number of weeks from the anchor date
export const onCycle = (r, d) => r.every !== 2 || !r.anchor || ((Math.round(daysBetween(r.anchor, d) / 7) % 2) + 2) % 2 === 0
export function routeDefaultDate() { const t = TODAY(); return isDeliveryDay(t) ? t : nextDeliveryDay(t) }
export function defaultOrderDate() { return nextDeliveryDay(TODAY()) }
