// 종이 청구서: config.bills = { label, since, ids, given:{cid:date} }.
// 배달 체크와는 따로, 동선의 청구서 아이콘을 눌러야만 전달한 걸로 바뀌어요.
import { S } from '@/store/state'
import { TODAY } from '@/lib/dates'
import { custById } from './model'
import { isDeliveryDay, nextDeliveryDay } from './calendar'
import { stopsFor } from './stops'

export function billDate(cid) {
  const B = S.config.bills; if (!B || !B.ids.includes(cid)) return null
  return B.given[cid] || ''
}
export const billShow = (st, date) => { if (!st.cust || !S.config.bills || date < S.config.bills.since) return false; const g = billDate(st.cust.id); return g !== null && (!g || g === date) }
export function billStatus() {
  const B = S.config.bills; if (!B) return null
  const from = [TODAY(), B.since].sort()[1]; const next = {}
  let d = isDeliveryDay(from) ? from : nextDeliveryDay(from)
  for (let i = 0; i < 6; i++) { for (const st of stopsFor(d)) if (st.cust && !st.skipped && next[st.cust.id] == null) next[st.cust.id] = d; d = nextDeliveryDay(d) }
  const rows = B.ids.map(id => ({ c: custById(id), id, given: billDate(id), next: next[id] || '' })).filter(r => r.c)
  return { B, rows, left: rows.filter(r => !r.given), off: rows.filter(r => !r.given && !r.next) }
}
