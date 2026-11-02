// Home screen actions: "확인할 것" reminders, order cancel/restore, pause-resume acknowledgements.
import { S } from '@/store/state'
import { save } from '@/store/sync'
import { TODAY, fmt } from '@/lib/dates'
import { uid } from '@/lib/util'
import { toast } from '@/lib/toast'
import { custById, locShort, itemsText } from '@/domain/model'
import { logChange, logMark, dropLogsSince } from '@/domain/log'

// returns true when added (the caller clears its input)
export function todoAdd(text) {
  const v = String(text || '').trim()
  if (!v) { toast('내용을 적어 주세요.'); return false }
  S.config.todos.push({ id: uid('t_'), text: v, at: Date.now(), due: '', done: false, doneAt: 0 })
  save('config')
  return true
}

export function todoDone(id) {
  const t = S.config.todos.find(x => x.id === id); if (!t) return
  t.done = true; t.doneAt = Date.now()
  // keep the 30 most recently finished items, drop older finished ones
  const keep = S.config.todos.filter(x => x.done).sort((x, y) => y.doneAt - x.doneAt).slice(0, 30).map(x => x.id)
  S.config.todos = S.config.todos.filter(x => !x.done || keep.includes(x.id))
  logChange({ kind: '메모', from: TODAY(), to: TODAY(), text: '확인 완료: ' + t.text })
  save('config', 'log')
  toast('확인 완료로 옮겼어요')
}

export function ackPause(cid, pid) {
  const c = custById(cid); const p = c?.pauses.find(x => x.id === pid)
  if (p) { p.ack = true; save('customers') }
}

// customer-less orders keep their own name and location in the log
const orderWhoLog = o => { const c = o.customerId ? custById(o.customerId) : null; return { cid: o.customerId, name: c ? '' : o.name, loc: c ? '' : locShort(o.loc) } }

export function cancelOrder(id) {
  const o = S.orders.find(x => x.id === id); if (!o) return
  const mark = logMark(); o.status = 'cancelled'
  logChange({ ...orderWhoLog(o), from: o.date, kind: '주문', text: `주문 취소 ${itemsText(o.items)}` })
  save('orders', 'log')
  toast(`${fmt(o.date)} 주문을 취소했어요. 발주표와 동선에서 빠져요.`, () => {
    const x = S.orders.find(y => y.id === id); if (x) x.status = 'open'
    dropLogsSince(mark); save('orders', 'log')
  })
}

export function restoreOrder(id) {
  const o = S.orders.find(x => x.id === id); if (!o) return
  o.status = 'open'
  logChange({ ...orderWhoLog(o), from: o.date, kind: '주문', text: `주문 되살림 ${itemsText(o.items)}` })
  save('orders', 'log')
}
