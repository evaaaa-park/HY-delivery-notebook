// T-2 ordering sheet actions (발주표).
import { S, UI, emit, setUI } from '@/store/state'
import { save } from '@/store/sync'
import { clone } from '@/lib/util'
import { fmt } from '@/lib/dates'
import { toast } from '@/lib/toast'
import { sheetFor, dayRec } from '@/domain/stops'
import { nextDeliveryDay, prevDeliveryDay, orderTarget } from '@/domain/calendar'

export function stockZero() {
  const before = clone(S.config.stock)
  S.config.stock = {}
  save('config')
  toast('재고를 0으로 맞췄어요', () => { S.config.stock = before; save('config') })
}

// persist=false updates the numbers while typing; the stock input saves when it is left (or after a pause).
export function setStock(pid, value, persist = true) {
  const v = Math.max(0, Math.round(+value || 0))
  if (v) S.config.stock[pid] = v; else delete S.config.stock[pid]
  if (persist) save('config'); else emit()
}

export function confirmOrder(d) {
  const rec = dayRec(d)
  rec.confirmed = Object.fromEntries(sheetFor(d).map(r => [r.p.id, r.buy]))
  rec.confirmedAt = Date.now()
  save('days')
  toast(`${fmt(d)} 발주를 확정했어요. 이후 바뀌면 알려 드려요.`)
}

// The list pasted into hy's ordering app: grouped by category, ordering-app names.
export function copyOrderText(d) {
  const rows = sheetFor(d).filter(r => r.buy > 0); let last = null; const lines = []
  rows.forEach(r => {
    const c = r.p.cat || ''
    if (c && c !== last) { lines.push((lines.length ? '\n' : '') + `[${c}]`); last = c }
    lines.push(`${r.p.orderName || r.p.name} ${r.buy}`)
  })
  return `${fmt(d)} 배달분 발주\n\n` + (rows.length ? lines.join('\n') : '발주할 제품 없음')
}

// d = -1 previous delivery day, 1 next, 0 back to the date to order today
export function moveOrderDate(d) {
  const cur = UI.orderDate || orderTarget()
  setUI({ orderDate: d === 0 ? null : (d > 0 ? nextDeliveryDay(cur) : prevDeliveryDay(cur)), openP: null })
}

export function toggleOrderRow(pid) { setUI({ openP: UI.openP === pid ? null : pid }) }
