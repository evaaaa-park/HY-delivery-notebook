// Quick edits made right on the customer cards.
import { S } from '@/store/state'
import { save } from '@/store/sync'
import { TODAY, MONTH, daysText } from '@/lib/dates'
import { custById, pName } from '@/domain/model'
import { logChange } from '@/domain/log'

// ± on a regular item. Taps within 2 minutes merge into one log entry that keeps the first "이전" quantity.
export function changeQty(cid, i, d) {
  const c = custById(cid); const r = c?.regular[i]; if (!r) return
  const was = r.qty; r.qty = Math.max(0, r.qty + d)
  if (r.qty !== was) {
    const first = S.log[0]?.merge === `q:${c.id}:${i}` ? S.log[0].text.match(/\(이전 (\d+)\)/) : null
    logChange({ cid: c.id, from: TODAY(), to: '', kind: '정기 변경', text: `${pName(r.productId)} ${r.every === 2 ? '격주 ' : ''}${daysText(r.days)} ${r.qty}개 (이전 ${first ? first[1] : was})`, merge: `q:${c.id}:${i}` })
  }
  save('customers', 'log')
}

export function togglePaid(cid) {
  const c = custById(cid); if (!c) return
  c.paidMonth = c.paidMonth === MONTH() ? '' : MONTH()
  logChange({ cid: c.id, from: TODAY(), kind: '수금', text: `${MONTH().slice(5)}월 현금 ${c.paidMonth ? '수금 완료' : '미수로 되돌림'}` })
  save('customers', 'log')
}
