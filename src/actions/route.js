// Route actions: delivery check-off, daily order changes, base route, paper bills.
import { S } from '@/store/state'
import { save } from '@/store/sync'
import { TODAY, fmt, hm } from '@/lib/dates'
import { toast } from '@/lib/toast'
import { closeSheet } from '@/lib/sheet'
import { stopsFor, orderedStops, dayRec } from '@/domain/stops'
import { sortAuto, mergeSeq } from '@/domain/location'
import { logChange } from '@/domain/log'
import { stampDone } from '@/domain/perf'
import { custById } from '@/domain/model'
import { billStatus } from '@/domain/bills'

// Check a stop off (or undo). When every stop of the day is checked, the day is recorded as finished.
export function toggleDone(date, key) {
  const d = dayRec(date); d.done = d.done || {}
  if (d.done[key]) delete d.done[key]; else d.done[key] = Date.now()
  const live = stopsFor(date).filter(s => !s.skipped)
  const all = live.length > 0 && live.every(s => d.done[s.key])
  const docs = ['days']
  if (all && !d.completedAt) {
    d.completedAt = Date.now()
    const qty = live.reduce((s, st) => s + st.items.reduce((a, i) => a + i.qty, 0), 0)
    const ord = live.filter(st => st.orders.length).length
    S.log = S.log.filter(e => e.merge !== 'done:' + date)
    logChange({ name: '하루 배달', loc: '', from: date, kind: '배달 완료', text: `${live.length}곳 모두 완료 · 제품 ${qty}개${ord ? ` · 주문 있는 곳 ${ord}` : ''} · ${hm(d.completedAt)}`, merge: 'done:' + date })
    docs.push('log')
    toast(`${fmt(date)} 배달을 모두 마쳤어요. 기록에 남겼어요.`)
  } else if (!all && d.completedAt) {
    delete d.completedAt; S.log = S.log.filter(e => e.merge !== 'done:' + date); docs.push('log')
  }
  if (stampDone(date)) docs.push('perf')
  save(...docs)
}

// This day's own order (drag or "순서 옮기기")
export function setSeq(date, keys) { dayRec(date).seq = keys; save('days') }

export function saveAsBase(date) {
  const today = orderedStops(date).map(s => s.key).filter(k => !k.startsWith('o:'))
  const all = sortAuto(S.customers.map(c => ({ key: c.id, loc: c.loc })))
  const fullOld = mergeSeq(all, S.config.baseSeq || [])
  S.config.baseSeq = mergeSeq(fullOld, today).map(x => x.key)
  if (S.days[date]) delete S.days[date].seq
  save('config', 'days'); closeSheet(); toast('기본 동선으로 저장했어요')
}

export function seqReset(date) {
  const d = S.days[date]; if (d) delete d.seq
  save('days'); closeSheet(); toast('자동 동선으로 되돌렸어요')
}

/* ---------- paper bills (종이 청구서) ---------- */
// The bill icon on the route: counts as given only when tapped (not by checking the delivery).
export function billToggle(cid, date) {
  const B = S.config.bills; if (!B) return
  const c = custById(cid)
  if (B.given[cid]) { delete B.given[cid]; save('config'); toast(`${c?.name || ''} 청구서 전달 취소`); return }
  B.given[cid] = date || TODAY()
  logChange({ cid, kind: '메모', from: B.given[cid], to: B.given[cid], text: B.label + ' 전달' })
  save('config', 'log')
  toast(`${c?.name || ''} 청구서 전달함`, () => { const b = S.config.bills; if (b) { delete b.given[cid]; save('config') } })
}
// "전달함" in the bills list: given separately today
export function billGive(cid) {
  const B = S.config.bills; if (!B) return
  const c = custById(cid)
  B.given[cid] = TODAY()
  logChange({ cid: c?.id, kind: '메모', from: TODAY(), to: TODAY(), text: B.label + ' 따로 전달' })
  save('config', 'log')
}
export function billUndo(cid) {
  const B = S.config.bills; if (!B) return
  delete B.given[cid]; save('config')
}
// End the bill list. Returns false when customers are left and `sure` is not set (ask again).
export function billEnd(sure) {
  const st = billStatus()
  if (st && st.left.length && !sure) return false
  S.config.bills = null
  save('config'); closeSheet(); toast('청구서 목록을 끝냈어요')
  return true
}
