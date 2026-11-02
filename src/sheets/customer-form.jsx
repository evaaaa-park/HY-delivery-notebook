// Customer add/edit sheet: contact, location, regular items, payment, status, pauses.
import { useState } from 'react'
import { S, UI, useStore } from '@/store/state'
import { save } from '@/store/sync'
import { TODAY, fmt, dow, addDays } from '@/lib/dates'
import { uid, clone } from '@/lib/util'
import { toast } from '@/lib/toast'
import { useDraft, useMediaQuery } from '@/lib/hooks'
import { openSheet, closeSheet, SheetHead, SheetActions } from '@/lib/sheet'
import { confirmDialog } from '@/lib/confirm'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'
import { ProductImage, Stepper, DayPick, Field, CheckLine } from '@/components/common'
import { IconClose } from '@/components/icons'
import { PAY, LOC_TYPES, STATUS_NAME } from '@/domain/constants'
import { normCust, normOrder } from '@/domain/normalize'
import { custById, prodById, locShort } from '@/domain/model'
import { pauseDays, defaultOrderDate } from '@/domain/calendar'
import { ensureRouteOrder } from '@/domain/location'
import { logChange, regularText, custDiff } from '@/domain/log'
import { refreshPerfFrom } from '@/domain/perf'

export function openCustSheet(id) {
  openSheet(<CustomerSheet key={id || 'new-' + Date.now()} id={id} />)
}

const emptyPause = () => ({ from: defaultOrderDate(), to: defaultOrderDate(), days: [], reason: '' })

function CustomerSheet({ id }) {
  useStore()
  const wide = useMediaQuery('(min-width: 700px)')
  const [cf, refresh] = useDraft(() => {
    const c = id ? custById(id) : null
    const d = c ? clone(c) : normCust({ loc: { type: 'apt' }, regular: [], ice: true })
    d._new = !c
    d._course = d.course == null ? '' : String(d.course)
    return d
  })
  const [pf, setPf] = useState(emptyPause)
  const t = TODAY()

  const set = (k, v) => { cf[k] = v; refresh() }
  const setLoc = (k, v) => { cf.loc[k] = v; refresh() }
  const setEvery = (r, on) => {
    r.every = on ? 2 : 1
    if (on && !r.anchor) { let x = TODAY(); for (let k = 0; k < 14 && !r.days.includes(dow(x)); k++) x = addDays(x, 1); r.anchor = x }
    refresh()
  }
  const addPause = () => {
    if (!pf.from || !pf.to || pf.to < pf.from) { toast('중지 기간을 확인해 주세요.'); return }
    cf.pauses.push({ id: uid('p_'), from: pf.from, to: pf.to, reason: pf.reason.trim(), ack: false, days: pf.days })
    setPf(emptyPause())
    refresh()
  }

  const saveCF = () => {
    const course = cf._course.trim()
    const draft = {
      ...cf,
      name: cf.name.trim(), contractNo: cf.contractNo.trim(), phone: cf.phone.trim(),
      loc: { ...cf.loc, type: cf.loc.type || 'apt', building: cf.loc.building.trim(), unit: cf.loc.unit.trim(), label: cf.loc.label.trim() },
      course: course === '' ? null : (isNaN(+course) ? course : +course),
      status: cf.status || 'active', statusNote: cf.statusNote.trim(),
    }
    draft.endDate = draft.status === 'active' ? '' : cf.endDate
    draft.active = draft.status === 'active'
    if (!draft.name && !draft.loc.building) { toast('이름이나 동을 입력해 주세요.'); return }
    const c = normCust(draft)
    const old = cf._new ? null : custById(c.id)
    const isNew = !old
    const docs = ['customers', 'config', 'log']
    if (isNew) {
      S.customers.push(c)
      logChange({ cid: c.id, from: TODAY(), to: '', kind: '고객 정보', text: `새 고객 · 정기 ${regularText(c)}` })
    } else {
      const diffs = custDiff(old, c)
      diffs.forEach(d => logChange({ cid: c.id, name: c.name, loc: locShort(c.loc), ...d }))
      S.customers = S.customers.map(x => x.id === c.id ? c : x)
      const past = diffs.filter(d => (d.kind === '상태' || d.kind === '중지') && d.from && d.from < TODAY()).map(d => d.from).sort()[0]
      if (past && refreshPerfFrom(c.id, past)) docs.push('perf')
    }
    ensureRouteOrder()
    save(...docs)
    closeSheet()
    toast(isNew ? `${c.name || '고객'} 추가했어요. 동선과 발주표에 반영돼요.` : '저장했어요. 동선과 발주표에 반영돼요.')
  }

  const deleteCF = async () => {
    const cid = cf.id, nm = cf.name
    const ok = await confirmDialog({ title: `${nm} 완전 삭제`, body: '명단·실적에서 사라지고 앞으로 남은 주문도 지워져요. 해지나 이사는 “계약 상태”로 바꾸면 기록이 남아요.', yes: '완전 삭제' })
    if (!ok) return
    const bc = clone(S.customers), bo = clone(S.orders)
    S.customers = S.customers.filter(c => c.id !== cid)
    S.orders = S.orders.filter(o => !(o.customerId === cid && o.date >= TODAY()))
    UI.selected.delete(cid)
    closeSheet()
    save('customers', 'orders')
    toast(`${nm} 삭제했어요`, () => { S.customers = bc.map(normCust); S.orders = bo.map(normOrder); save('customers', 'orders') })
  }

  return (
    <>
      <SheetHead title={cf._new ? '고객 추가' : (cf.name || '고객')} />
      <div className="grid2">
        <Field label="이름" htmlFor="cfName"><Input type="text" id="cfName" value={cf.name} onChange={e => set('name', e.target.value)} autoFocus={wide} /></Field>
        <Field label="연락처" htmlFor="cfPhone"><Input type="tel" id="cfPhone" value={cf.phone} onChange={e => set('phone', e.target.value)} placeholder="010-0000-0000" /></Field>
      </div>
      <div className="grid2">
        <Field label="위치 종류" htmlFor="cfType">
          <NativeSelect id="cfType" value={cf.loc.type} onChange={e => setLoc('type', e.target.value)}>
            {Object.entries(LOC_TYPES).map(([k, n]) => <NativeSelectOption key={k} value={k}>{n}</NativeSelectOption>)}
          </NativeSelect>
        </Field>
        <Field label="정기계약번호" htmlFor="cfContract"><Input type="text" id="cfContract" inputMode="numeric" value={cf.contractNo} onChange={e => set('contractNo', e.target.value)} /></Field>
      </div>
      <div className="grid3">
        <Field label="동" htmlFor="cfB"><Input type="text" id="cfB" value={cf.loc.building} onChange={e => setLoc('building', e.target.value)} placeholder="411, 상가B" /></Field>
        <Field label="호·층" htmlFor="cfU"><Input type="text" id="cfU" value={cf.loc.unit} onChange={e => setLoc('unit', e.target.value)} placeholder="304, B3" /></Field>
        <Field label="hy 코스" htmlFor="cfCourse"><Input type="text" id="cfCourse" inputMode="numeric" value={cf._course} onChange={e => set('_course', e.target.value)} /></Field>
      </div>
      <Field label="장소 설명 (세대가 아닐 때)" htmlFor="cfLabel">
        <Input type="text" id="cfLabel" value={cf.loc.label} onChange={e => setLoc('label', e.target.value)} placeholder="예: 411동 B3층 미화휴게실" />
      </Field>

      <Field label="정기 품목">
        <div className="regedit">
          {cf.regular.map((r, i) => (
            <div className="regrow" key={i}>
              <div className="row" style={{ flexWrap: 'nowrap', minWidth: 0 }}>
                <ProductImage pid={r.productId} size={30} />
                <NativeSelect value={r.productId} onChange={e => { r.productId = e.target.value; refresh() }} aria-label="제품" className="min-w-0 flex-1">
                  {S.config.products.map(p => <NativeSelectOption key={p.id} value={p.id}>{p.name}</NativeSelectOption>)}
                  {!prodById(r.productId) && <NativeSelectOption value={r.productId}>{r.productId}</NativeSelectOption>}
                </NativeSelect>
              </div>
              <Button size="icon-sm" variant="ghost" aria-label="품목 삭제" onClick={() => { cf.regular.splice(i, 1); refresh() }}><IconClose /></Button>
              <div className="r2">
                <DayPick value={r.days} onChange={v => { r.days = v; refresh() }} />
                <Stepper value={r.qty} onDec={() => { r.qty = Math.max(0, r.qty - 1); refresh() }} onInc={() => { r.qty = r.qty + 1; refresh() }} />
              </div>
              <div className="r2">
                <CheckLine checked={r.every === 2} onChange={on => setEvery(r, on)}>격주</CheckLine>
                {r.every === 2 && (
                  <label className="row" style={{ gap: 6, flex: 1, minWidth: 0 }}>
                    <span className="hint" style={{ whiteSpace: 'nowrap' }}>배달하는 주의 날짜</span>
                    <Input type="date" value={r.anchor} onChange={e => { r.anchor = e.target.value; refresh() }} style={{ flex: 1, minWidth: 0 }} aria-label="격주 기준 날짜" />
                  </label>
                )}
              </div>
            </div>
          ))}
          <Button size="sm" style={{ justifySelf: 'start' }} onClick={() => { cf.regular.push({ productId: S.config.products[0]?.id, qty: 1, days: [1, 2, 3, 4, 5], every: 1, anchor: '' }); refresh() }}>+ 품목 추가</Button>
        </div>
      </Field>

      <div className="grid2">
        <Field label="수금 구분" htmlFor="cfPay">
          <NativeSelect id="cfPay" value={cf.payment} onChange={e => set('payment', e.target.value)}>
            {Object.entries(PAY).map(([k, n]) => <NativeSelectOption key={k} value={k}>{n}</NativeSelectOption>)}
          </NativeSelect>
        </Field>
        <Field label="청구서" htmlFor="cfBill">
          <NativeSelect id="cfBill" value={cf.bill} onChange={e => set('bill', e.target.value)}>
            <NativeSelectOption value="mobile">모바일</NativeSelectOption>
            <NativeSelectOption value="paper">종이</NativeSelectOption>
          </NativeSelect>
        </Field>
      </div>
      <div className="row" style={{ gap: 16 }}>
        {[['ice', '아이스팩'], ['bag', '전달주머니'], ['member', '회원'], ['holidayOff', '공휴일엔 쉼']].map(([k, n]) => (
          <CheckLine key={k} checked={cf[k]} onChange={v => set(k, v)}>{n}</CheckLine>
        ))}
      </div>
      <Field label="메모 (배달할 때 보여요)" htmlFor="cfNotes">
        <Textarea id="cfNotes" value={cf.notes} onChange={e => set('notes', e.target.value)} />
      </Field>

      <Field label="계약 상태" hint="해지·중단·이사로 바꿔도 명단과 실적, 수금에는 남아요. 날짜를 넣으면 그 전날까지 배달해요.">
        <div className="grid3">
          <NativeSelect id="cfStatus" aria-label="계약 상태" value={cf.status} onChange={e => set('status', e.target.value)}>
            {Object.entries(STATUS_NAME).map(([k, n]) => <NativeSelectOption key={k} value={k}>{n}</NativeSelectOption>)}
          </NativeSelect>
          <Input type="date" id="cfEnd" value={cf.endDate} onChange={e => set('endDate', e.target.value)} aria-label="적용 날짜" />
          <Input type="text" id="cfStatusNote" value={cf.statusNote} onChange={e => set('statusNote', e.target.value)} placeholder="사유" aria-label="상태 사유" />
        </div>
      </Field>

      <Field label="배달 중지 기간">
        <div style={{ display: 'grid', gap: 6 }}>
          {cf.pauses.length ? cf.pauses.slice().sort((a, b) => a.from.localeCompare(b.from)).map(p => (
            <div key={p.id} className="row" style={{ justifyContent: 'space-between', padding: '7px 10px', border: '1px solid var(--line)', borderRadius: 9, background: 'var(--surface)' }}>
              <span>
                <b>{fmt(p.from)} – {fmt(p.to)}</b>{pauseDays(p)}{' '}
                {p.to < t ? <Badge>지남</Badge> : p.from <= t ? <Badge variant="warn">중지 중</Badge> : <Badge variant="warn">예정</Badge>}{' '}
                <span className="muted">{p.reason}</span>
              </span>
              <Button size="sm" variant="ghost" onClick={() => { cf.pauses = cf.pauses.filter(x => x.id !== p.id); refresh() }}>삭제</Button>
            </div>
          )) : <span className="hint">없음</span>}
          <div className="grid2" style={{ gap: 6 }}>
            <Input type="date" aria-label="시작일" value={pf.from} onChange={e => setPf({ ...pf, from: e.target.value })} />
            <Input type="date" aria-label="종료일" value={pf.to} onChange={e => setPf({ ...pf, to: e.target.value })} />
          </div>
          <div className="row" style={{ gap: 8 }}>
            <span className="hint">특정 요일만 쉴 때 고르기 (안 고르면 전부)</span>
            <DayPick value={pf.days} onChange={v => setPf({ ...pf, days: v })} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 6 }}>
            <Input type="text" placeholder="사유 (예: 여행)" aria-label="사유" value={pf.reason} onChange={e => setPf({ ...pf, reason: e.target.value })} />
            <Button onClick={addPause}>중지 추가</Button>
          </div>
        </div>
      </Field>

      <SheetActions>
        {!cf._new && <Button variant="danger-ghost" onClick={deleteCF}>완전 삭제</Button>}
        <Button onClick={closeSheet}>취소</Button>
        <Button variant="primary" onClick={saveCF}>저장</Button>
      </SheetActions>
    </>
  )
}
