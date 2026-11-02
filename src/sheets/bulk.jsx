// Bulk actions on the selected customers (bulk bar on the 고객 screen).
// openBulk('pause' | 'resume' | 'qty' | 'note' | 'pay' | 'status' | 'delete')
import { useState } from 'react'
import { S, UI, useStore } from '@/store/state'
import { save } from '@/store/sync'
import { TODAY, MONTH, fmt, fmtShort, dow, addDays } from '@/lib/dates'
import { uid, clone } from '@/lib/util'
import { toast } from '@/lib/toast'
import { useMediaQuery } from '@/lib/hooks'
import { openSheet, closeSheet, SheetHead, SheetActions } from '@/lib/sheet'
import { confirmDialog } from '@/lib/confirm'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'
import { PDot, Seg, Chip, DayPick, Field, CheckLine } from '@/components/common'
import { PAY, STATUS_NAME } from '@/domain/constants'
import { normCust, normOrder } from '@/domain/normalize'
import { pName } from '@/domain/model'
import { defaultOrderDate, nextDeliveryDay } from '@/domain/calendar'
import { logChange, logMark, dropLogsSince, regularText } from '@/domain/log'
import { refreshPerfFrom } from '@/domain/perf'

const selectedCustomers = () => S.customers.filter(c => UI.selected.has(c.id))

export function openBulk(kind) {
  if (kind === 'resume') return bulkResume()
  if (kind === 'delete') return bulkDelete()
  const Sheet = { pause: BulkPause, qty: BulkQty, note: BulkNote, pay: BulkPay, status: BulkStatus }[kind]
  if (Sheet) openSheet(<Sheet />)
}

// undo for every bulk change: put the customer list and the change log back as they were
const undoTo = (before, mark) => () => { S.customers = before.map(normCust); dropLogsSince(mark); save('customers', 'log') }

function BulkPause() {
  useStore()
  const nd = defaultOrderDate()
  const [from, setFrom] = useState(nd)
  const [to, setTo] = useState(nd)
  const [reason, setReason] = useState('')
  const t = TODAY()
  const wkEnd = (() => { let x = t; while (dow(x) !== 5) x = addDays(x, 1); return x })()
  const nextMon = (() => { let x = addDays(t, 1); while (dow(x) !== 1) x = addDays(x, 1); return x })()
  const presets = [[nd, nd, '다음 배달일 하루'], [nd, wkEnd >= nd ? wkEnd : addDays(nextMon, 4), '이번 주 남은 날'], [nextMon, addDays(nextMon, 4), `다음 주 ${fmtShort(nextMon)}–${fmtShort(addDays(nextMon, 4))}`]]
  const saveIt = () => {
    const r = reason.trim()
    if (!from || !to || to < from) { toast('시작일과 끝나는 날을 확인해 주세요.'); return }
    const before = clone(S.customers); const mark = logMark(); const docs = ['customers', 'log']
    selectedCustomers().forEach(c => {
      c.pauses.push({ id: uid('p_'), from, to, reason: r, ack: false, days: [] })
      logChange({ cid: c.id, from, to, kind: '중지', text: `배달 중지${r ? ' · ' + r : ''}` })
    })
    if (from < TODAY() && selectedCustomers().map(c => refreshPerfFrom(c.id, from)).some(Boolean)) docs.push('perf')
    const n = UI.selected.size
    save(...docs); closeSheet()
    toast(`${n}명 ${fmtShort(from)}–${fmtShort(to)} 중지했어요`, undoTo(before, mark))
  }
  return (
    <>
      <SheetHead title={`${UI.selected.size}명 배달 중지`} />
      <div className="chips">
        {presets.map(p => <Chip key={p[2]} pressed={false} onClick={() => { setFrom(p[0]); setTo(p[1]) }}>{p[2]}</Chip>)}
      </div>
      <div className="grid2">
        <Field label="시작" htmlFor="bpF"><Input type="date" id="bpF" value={from} onChange={e => setFrom(e.target.value)} /></Field>
        <Field label="끝 (이날까지 중지)" htmlFor="bpT"><Input type="date" id="bpT" value={to} onChange={e => setTo(e.target.value)} /></Field>
      </div>
      <Field label="사유" htmlFor="bpR"><Input type="text" id="bpR" placeholder="예: 추석 연휴, 여행" value={reason} onChange={e => setReason(e.target.value)} /></Field>
      <p className="hint">{to ? `끝나면 ${fmt(nextDeliveryDay(to))}부터 자동으로 다시 배달되고, 그 전에 홈에 알림이 떠요.` : ''}</p>
      <SheetActions>
        <Button onClick={closeSheet}>취소</Button>
        <Button variant="primary" onClick={saveIt}>중지하기</Button>
      </SheetActions>
    </>
  )
}

function bulkResume() {
  const t = TODAY(); const before = clone(S.customers); const mark = logMark()
  selectedCustomers().forEach(c => {
    if (c.pauses.some(p => p.to >= t)) logChange({ cid: c.id, from: t, to: '', kind: '중지', text: '오늘 이후 중지 해제' })
    c.pauses = c.pauses.filter(p => p.from < t).map(p => (p.to >= t ? { ...p, to: addDays(t, -1), ack: true } : p))
  })
  save('customers', 'log')
  toast('선택한 고객의 오늘 이후 중지를 풀었어요', undoTo(before, mark))
}

function BulkNote() {
  useStore()
  const wide = useMediaQuery('(min-width: 700px)')
  const [mode, setMode] = useState('append')
  const [text, setText] = useState('')
  const [dated, setDated] = useState(true)
  const saveIt = () => {
    const txt = text.trim(); if (!txt) { toast('메모를 입력해 주세요.'); return }
    const line = (dated ? fmtShort(TODAY()) + ' ' : '') + txt
    const before = clone(S.customers); const mark = logMark()
    selectedCustomers().forEach(c => {
      c.notes = mode === 'replace' || !c.notes ? line : c.notes + '\n' + line
      logChange({ cid: c.id, kind: '메모', text: txt })
    })
    save('customers', 'log'); closeSheet()
    toast('메모를 넣었어요', undoTo(before, mark))
  }
  return (
    <>
      <SheetHead title={`${UI.selected.size}명 메모`} />
      <Seg value={mode} onChange={setMode} options={[['append', '기존 메모 뒤에 붙이기'], ['replace', '바꾸기']]} />
      <Textarea id="bnT" placeholder="예: 10월부터 경비실 보관" autoFocus={wide} value={text} onChange={e => setText(e.target.value)} aria-label="메모" />
      <CheckLine checked={dated} onChange={setDated}>앞에 오늘 날짜 붙이기</CheckLine>
      <SheetActions>
        <Button onClick={closeSheet}>취소</Button>
        <Button variant="primary" onClick={saveIt}>저장</Button>
      </SheetActions>
    </>
  )
}

function BulkQty() {
  useStore()
  const [pid, setPid] = useState(() => S.config.products[0]?.id || '')
  const [mode, setMode] = useState('set')
  const [val, setVal] = useState('1')
  const [days, setDays] = useState([1, 2, 3, 4, 5])
  const saveIt = () => {
    const v = Math.round(+val || 0)
    const before = clone(S.customers); let n = 0; const mark = logMark()
    selectedCustomers().forEach(c => {
      const was = regularText(c)
      const items = c.regular.filter(r => r.productId === pid)
      if (items.length) { items.forEach(r => { r.qty = Math.max(0, mode === 'set' ? v : r.qty + v) }); n++ }
      else if (v > 0) { c.regular.push({ productId: pid, qty: v, days: days.length ? [...days] : [1, 2, 3, 4, 5], every: 1, anchor: '' }); n++ }
      if (was !== regularText(c)) logChange({ cid: c.id, from: TODAY(), to: '', kind: '정기 변경', text: `정기 품목: ${regularText(c)} (이전: ${was})` })
    })
    save('customers', 'log'); closeSheet()
    toast(`${n}명 ${pName(pid)} 수량을 바꿨어요`, undoTo(before, mark))
  }
  return (
    <>
      <SheetHead title={`${UI.selected.size}명 정기 수량 변경`} />
      <Field label="제품" htmlFor="bqP">
        <div className="row" style={{ flexWrap: 'nowrap' }}>
          <PDot pid={pid} />
          <NativeSelect id="bqP" value={pid} onChange={e => setPid(e.target.value)} className="min-w-0 flex-1">
            {S.config.products.map(p => <NativeSelectOption key={p.id} value={p.id}>{p.name}</NativeSelectOption>)}
          </NativeSelect>
        </div>
      </Field>
      <Seg value={mode} onChange={setMode} options={[['set', '이 수량으로 맞추기'], ['add', '더하기·빼기']]} />
      <Field label="수량 (빼려면 −1처럼)" htmlFor="bqV"><Input type="number" id="bqV" value={val} onChange={e => setVal(e.target.value)} /></Field>
      <Field label="이 제품이 없는 고객에게 새로 넣을 때 요일"><DayPick value={days} onChange={setDays} /></Field>
      <p className="hint">“맞추기”는 그 제품이 없는 고객에게 새 품목으로 추가해요. 0으로 맞추면 해당 품목을 쉬게 해요.</p>
      <SheetActions>
        <Button onClick={closeSheet}>취소</Button>
        <Button variant="primary" onClick={saveIt}>적용</Button>
      </SheetActions>
    </>
  )
}

function BulkPay() {
  useStore()
  const [pm, setPm] = useState('')
  const [pp, setPp] = useState('')
  const saveIt = () => {
    if (!pm && !pp) { toast('바꿀 항목을 골라 주세요.'); return }
    const before = clone(S.customers); const mark = logMark()
    selectedCustomers().forEach(c => {
      if (pm) c.payment = pm
      if (pp) c.paidMonth = pp === 'paid' ? MONTH() : ''
      logChange({ cid: c.id, from: TODAY(), kind: '수금', text: [pm ? `수금 구분 ${PAY[pm]}` : '', pp ? `${MONTH().slice(5)}월 현금 ${pp === 'paid' ? '수금 완료' : '미수'}` : ''].filter(Boolean).join(' · ') })
    })
    save('customers', 'log'); closeSheet()
    toast('수금 정보를 바꿨어요', undoTo(before, mark))
  }
  return (
    <>
      <SheetHead title={`${UI.selected.size}명 수금`} />
      <Field label="수금 구분 바꾸기"><Seg className="flex-wrap" value={pm} onChange={setPm} options={Object.entries(PAY)} /></Field>
      <Field label={`이번 달(${MONTH().slice(5)}월) 현금 수금`}><Seg value={pp} onChange={setPp} options={[['paid', '수금 완료'], ['unpaid', '미수']]} /></Field>
      <SheetActions>
        <Button onClick={closeSheet}>취소</Button>
        <Button variant="primary" onClick={saveIt}>적용</Button>
      </SheetActions>
    </>
  )
}

function BulkStatus() {
  useStore()
  const [st, setSt] = useState('ended')
  const [d, setD] = useState(defaultOrderDate)
  const [note, setNote] = useState('')
  const saveIt = () => {
    const nt = note.trim()
    const before = clone(S.customers); const mark = logMark(); const docs = ['customers', 'log']
    selectedCustomers().forEach(c => {
      const prev = STATUS_NAME[c.status]
      c.status = st; c.active = st === 'active'; c.endDate = st === 'active' ? '' : d
      if (nt) c.statusNote = nt
      logChange({ cid: c.id, from: c.endDate || TODAY(), to: '', kind: '상태', text: `${STATUS_NAME[st]}${c.endDate ? ' · ' + fmt(c.endDate) + '부터' : ''}${nt ? ' · ' + nt : ''} (이전: ${prev})` })
    })
    if (d && d < TODAY() && selectedCustomers().map(c => refreshPerfFrom(c.id, d)).some(Boolean)) docs.push('perf')
    const n = UI.selected.size
    save(...docs); closeSheet()
    toast(`${n}명 ${STATUS_NAME[st]}로 바꿨어요`, undoTo(before, mark))
  }
  return (
    <>
      <SheetHead title={`${UI.selected.size}명 계약 상태`} />
      <Seg className="flex-wrap" value={st} onChange={setSt} options={Object.entries(STATUS_NAME)} />
      <div className="grid2">
        <Field label="적용 날짜 (이날부터)" htmlFor="bsD"><Input type="date" id="bsD" value={d} onChange={e => setD(e.target.value)} /></Field>
        <Field label="사유" htmlFor="bsN"><Input type="text" id="bsN" placeholder="예: 이사, 10월 말 확인" value={note} onChange={e => setNote(e.target.value)} /></Field>
      </div>
      <p className="hint">명단에서 지우지 않아요. 실적과 수금 기록은 그대로 남고, 적용 날짜 전날까지 배달해요.</p>
      <SheetActions>
        <Button onClick={closeSheet}>취소</Button>
        <Button variant="primary" onClick={saveIt}>적용</Button>
      </SheetActions>
    </>
  )
}

async function bulkDelete() {
  const n = UI.selected.size
  const ok = await confirmDialog({ title: `${n}명 삭제`, body: '선택한 고객과 그 고객의 앞으로 남은 주문이 지워져요. 해지만 하려면 고객을 열어 “계약 유지”를 끄세요.', yes: '삭제' })
  if (!ok) return
  const ids = new Set(UI.selected); const bc = clone(S.customers), bo = clone(S.orders)
  S.customers = S.customers.filter(c => !ids.has(c.id))
  S.orders = S.orders.filter(o => !(ids.has(o.customerId) && o.date >= TODAY()))
  UI.selected.clear()
  save('customers', 'orders')
  toast(`${n}명 삭제했어요`, () => { S.customers = bc.map(normCust); S.orders = bo.map(normOrder); save('customers', 'orders') })
}
