// One tap from the route: change this day's items (or the weekly items), skip the day, edit the day's
// orders and the customer's delivery note.
import { useState } from 'react'
import { S, useStore } from '@/store/state'
import { save } from '@/store/sync'
import { openSheet, closeSheet, SheetHead, SheetActions } from '@/lib/sheet'
import { useDraft } from '@/lib/hooks'
import { toast } from '@/lib/toast'
import { clone, stable } from '@/lib/util'
import { dow, DL, fmt } from '@/lib/dates'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'
import { Field, Plate, ProductImage, Seg, Stepper, TypeBadge } from '@/components/common'
import { isSched } from '@/domain/constants'
import { normOrder } from '@/domain/normalize'
import { custById, pName, pShort, locShort, itemsText } from '@/domain/model'
import { parseUnit, entIndex, entName } from '@/domain/location'
import { orderedStops, aggList, regularFor, applyWeek, dayRec } from '@/domain/stops'
import { logChange, regularText } from '@/domain/log'
import { refreshPerfKey } from '@/domain/perf'
import { openCustSheet } from '@/sheets/customer-form'

export function openStop(date, key) {
  const st = orderedStops(date).find(s => s.key === key); if (!st) return
  const c = st.cust; const w = dow(date)
  const ov = c ? S.days[date]?.ov?.[c.id] : null
  const init = {
    date, key, cid: c?.id || null, name: st.name, loc: st.loc, mode: 'day',
    day: c ? (ov ? aggList((ov.items || []).map(i => ({ ...i }))) : aggList(st.items.filter(i => isSched(i.type)).map(i => ({ pid: i.pid, qty: i.qty })))) : [],
    week: c ? aggList(c.regular.filter(r => r.every !== 2 && r.days.includes(w)).map(r => ({ pid: r.productId, qty: r.qty }))) : [],
    bi: c ? c.regular.filter(r => r.every === 2 && r.days.includes(w)) : [],
    skip: !!ov?.skip, dayDirty: false, weekDirty: false, skipDirty: false,
    orders: clone(st.orders), notes: c ? c.notes : '',
  }
  openSheet(<StopEditor init={init} />)
}

function saveSF(SF) {
  const touched = new Set(); const c = SF.cid ? custById(SF.cid) : null
  if (c) {
    const notes = SF.notes
    if (c.notes !== notes) { c.notes = notes; touched.add('customers'); logChange({ cid: c.id, kind: '메모', text: `메모: ${notes || '(지움)'}` }) }
    if (SF.weekDirty) {
      const was = regularText(c); applyWeek(c, dow(SF.date), SF.week)
      if (was !== regularText(c)) logChange({ cid: c.id, from: SF.date, to: '', kind: '정기 변경', text: `매주 ${DL[dow(SF.date)]}: ${SF.week.filter(i => i.qty > 0).map(i => pShort(i.pid) + ' ' + i.qty).join(', ') || '없음'} (이전 정기: ${was})` })
      touched.add('customers')
    }
    if (SF.dayDirty || SF.skipDirty) {
      const rec = dayRec(SF.date); rec.ov = rec.ov || {}
      const items = SF.day.filter(i => i.qty > 0)
      if (!SF.skip && stable(items) === stable(regularFor(c, SF.date))) { delete rec.ov[c.id]; logChange({ cid: c.id, from: SF.date, kind: '하루 변경', text: '이날 변경 취소 (정기대로)' }) }
      else { rec.ov[c.id] = { items, skip: SF.skip }; logChange({ cid: c.id, from: SF.date, kind: SF.skip ? '미전달' : '하루 변경', text: SF.skip ? '이날 정기 배달 뺌' : `이날만 ${items.map(i => pShort(i.pid) + ' ' + i.qty).join(', ') || '정기 없음'}` }) }
      touched.add('days')
    }
  }
  for (const o of SF.orders) {
    const i = S.orders.findIndex(x => x.id === o.id); if (i < 0) continue
    const no = normOrder(o); if (!no.items.length) no.status = 'cancelled'
    if (stable(S.orders[i]) !== stable(no)) {
      const was = S.orders[i]; S.orders[i] = no; touched.add('orders')
      const oc = no.customerId ? custById(no.customerId) : null
      logChange({ cid: no.customerId, name: oc ? '' : no.name, loc: oc ? '' : locShort(no.loc), from: no.date, kind: '주문', text: no.status === 'cancelled' ? `주문 취소 ${itemsText(was.items)}` : `주문 수정 ${itemsText(no.items)}${no.note ? ' · ' + no.note : ''}` })
    }
  }
  if (touched.size) touched.add('log')
  if ((touched.has('days') || touched.has('orders')) && refreshPerfKey(SF.date, SF.key)) touched.add('perf')
  closeSheet()
  if (touched.size) { save(...touched); toast('저장했어요. 동선과 발주표에 반영돼요.') }
}

function StopEditor({ init }) {
  useStore()
  const [SF, refresh] = useDraft(init)
  const [addPid, setAddPid] = useState(() => S.config.products[0]?.id || '')
  const c = SF.cid ? custById(SF.cid) : null; const w = dow(SF.date)
  const list = SF.mode === 'day' ? SF.day : SF.week
  const u = parseUnit(SF.loc.unit); const ei = entIndex(SF.loc.building, u.line)
  const ent = entName(SF.loc.building, ei)

  const changeQty = (i, d) => { const it = list[i]; it.qty = Math.max(0, it.qty + d); SF[SF.mode + 'Dirty'] = true; refresh() }
  const addItem = () => {
    const pid = addPid; if (!pid) return
    const ex = list.find(i => i.pid === pid); if (ex) ex.qty++; else list.push({ pid, qty: 1 })
    SF[SF.mode + 'Dirty'] = true; refresh()
  }
  const toggleSkip = () => {
    SF.skip = !SF.skip; SF.skipDirty = true; SF.mode = 'day'
    if (!SF.skip && !SF.day.length) SF.day = regularFor(custById(SF.cid), SF.date)
    refresh()
  }
  const openFull = () => {
    const id = SF.cid; const notes = SF.notes
    closeSheet()
    const cc = custById(id); if (cc && cc.notes !== notes) { cc.notes = notes; save('customers') }
    openCustSheet(id)
  }

  return (
    <>
      <SheetHead title={SF.name} />
      <div className="row">
        <Plate loc={SF.loc} />
        {ent && <span className="ent">{ent} 입구</span>}
        <span className="muted">{SF.loc.label || ''}</span>
      </div>
      {c?.phone && <div className="row"><span className="muted">연락처</span><b className="num" style={{ userSelect: 'all', WebkitUserSelect: 'all' }}>{c.phone}</b></div>}
      {c && (
        <div className="field">
          <span className="lbl">정기 품목</span>
          <Seg value={SF.mode} onChange={m => { SF.mode = m; refresh() }} options={[['day', `${fmt(SF.date)} 하루만`], ['week', `매주 ${DL[w]}요일`]]} />
          {SF.mode === 'day' && SF.skip
            ? <div className="warnbox" style={{ marginTop: 8 }}>이날은 정기 배달을 뺐어요. 아래 “이날 빼기 취소”로 되돌려요.</div>
            : (
              <>
                <div className="ritems" style={{ marginTop: 8 }}>
                  {list.map((it, i) => (
                    <div key={it.pid} className={'ritem ' + (it.qty ? '' : 'zero')}>
                      <ProductImage pid={it.pid} size={30} />
                      <span className="pn">{pName(it.pid)}</span>
                      <Stepper value={it.qty} label={pName(it.pid)} onDec={() => changeQty(i, -1)} onInc={() => changeQty(i, 1)} />
                    </div>
                  ))}
                  {!list.length && <span className="hint">품목 없음</span>}
                </div>
                <div className="row" style={{ marginTop: 8, flexWrap: 'nowrap' }}>
                  <NativeSelect className="flex-1" value={addPid} onChange={e => setAddPid(e.target.value)} aria-label="추가할 제품">
                    {S.config.products.map(p => <NativeSelectOption key={p.id} value={p.id}>{p.name}</NativeSelectOption>)}
                  </NativeSelect>
                  <Button size="sm" onClick={addItem}>+ 추가</Button>
                </div>
              </>
            )}
          {SF.bi.length > 0 && <p className="hint" style={{ marginTop: 6 }}>격주 품목({SF.bi.map(r => pName(r.productId) + ' ' + r.qty).join(', ')})은 고객 정보에서 고쳐요.</p>}
          <p className="hint" style={{ marginTop: 6 }}>{SF.mode === 'day' ? '이 날짜에만 바뀌고, 발주표에도 바로 반영돼요.' : `앞으로 매주 ${DL[w]}요일 수량이 바뀌어요.`}</p>
        </div>
      )}
      {SF.orders.length > 0 && (
        <div className="field">
          <span className="lbl">이날 주문</span>
          <div style={{ display: 'grid', gap: 8 }}>
            {SF.orders.map(o => (
              <div key={o.id} className="card" style={{ padding: 10, display: 'grid', gap: 6, opacity: o.status === 'cancelled' ? 0.5 : 1 }}>
                <div className="row" style={{ justifyContent: 'space-between' }}>
                  <TypeBadge type={o.type} />
                  <Button size="sm" variant="ghost" onClick={() => { o.status = o.status === 'cancelled' ? 'open' : 'cancelled'; refresh() }}>{o.status === 'cancelled' ? '되살리기' : '주문 취소'}</Button>
                </div>
                {o.items.map((it, ii) => (
                  <div key={it.productId + ii} className="ritem">
                    <ProductImage pid={it.productId} size={30} />
                    <span className="pn">{pName(it.productId)}</span>
                    <Stepper value={it.qty} label={pName(it.productId)} onDec={() => { it.qty = Math.max(0, it.qty - 1); refresh() }} onInc={() => { it.qty = it.qty + 1; refresh() }} />
                  </div>
                ))}
                <Input type="text" value={o.note} placeholder="주문 메모" aria-label="주문 메모" onChange={e => { o.note = e.target.value; refresh() }} />
              </div>
            ))}
          </div>
        </div>
      )}
      {c && (
        <Field label="고객 메모 (배달할 때 보여요)" htmlFor="sfNotes">
          <Textarea id="sfNotes" value={SF.notes} onChange={e => { SF.notes = e.target.value; refresh() }} />
        </Field>
      )}
      <SheetActions>
        {c && (
          <>
            <Button onClick={toggleSkip}>{SF.skip ? '이날 빼기 취소' : '이날 빼기'}</Button>
            <Button onClick={openFull}>고객 정보 전체</Button>
          </>
        )}
        <Button variant="primary" onClick={() => saveSF(SF)}>저장</Button>
      </SheetActions>
    </>
  )
}
