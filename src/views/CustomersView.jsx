// 고객: search, filters, cards with regular items (photo + ± on the card), multi-select with a bulk bar.
import { S, UI, useStore, setUI, emit } from '@/store/state'
import { TODAY, MONTH, fmtShort, daysText } from '@/lib/dates'
import { compact } from '@/lib/util'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'
import { PDot, Plate, Stepper, Chip, EmptyCard } from '@/components/common'
import { IconClose } from '@/components/icons'
import { PAY, LOC_TYPES } from '@/domain/constants'
import { pName, isOn, statusBadge, cashUnpaid } from '@/domain/model'
import { locText, seriesOf, sortAuto, mergeSeq } from '@/domain/location'
import { routeDefaultDate, pauseOn, pauseDays } from '@/domain/calendar'
import { stopsFor } from '@/domain/stops'
import { changeQty, togglePaid } from '@/actions/customers'
import { openCustSheet } from '@/sheets/customer-form'
import { openBulk } from '@/sheets/bulk'
import { openOrderSheet } from '@/sheets/order-form'
import { openAIImport } from '@/ai/import-sheet'

function custFilters() {
  const t = routeDefaultDate()
  const has = new Set(stopsFor(t).map(s => s.key))
  const defs = [['all', '전체', () => true]]
  const sers = [...new Set(S.customers.map(c => seriesOf(c.loc.building)))].sort((a, b) => a === '상가·기타' ? 1 : b === '상가·기타' ? -1 : b.localeCompare(a))
  sers.forEach(s => defs.push(['s:' + s, s, c => seriesOf(c.loc.building) === s]))
  defs.push(['next', fmtShort(t) + ' 배달', c => has.has(c.id)])
  defs.push(['paused', '중지·예정', c => c.pauses.some(p => p.to >= TODAY())])
  defs.push(['off', '해지·중단·이사', c => c.status !== 'active'])
  defs.push(['cash', '현금 미수', cashUnpaid])
  if (S.customers.some(c => c.tags.includes('예시'))) defs.push(['ex', '예시', c => c.tags.includes('예시')])
  return defs
}

function filteredCustomers(defs = custFilters()) {
  const f = (defs.find(d => d[0] === UI.custF) || defs[0])[2]
  const q = compact(UI.custQ.trim())
  let list = S.customers.filter(f)
  if (q) list = list.filter(c => compact(c.name + c.loc.building + '-' + c.loc.unit + c.loc.building + c.loc.unit + locText(c.loc) + c.phone + c.contractNo + c.notes).includes(q))
  const ref = mergeSeq(sortAuto(list.map(c => ({ key: c.id, loc: c.loc, c }))), S.config.baseSeq || [])
  return ref.map(x => x.c)
}

function pick(id, on) {
  if (on) UI.selected.add(id); else UI.selected.delete(id)
  emit()
}

function CustCard({ c }) {
  const t = TODAY(); const sel = UI.selected.has(c.id)
  const pNow = pauseOn(c, t)
  const pause = c.pauses.filter(p => p.to >= t).sort((a, b) => a.from.localeCompare(b.from))[0]
  const upcoming = S.orders.filter(o => o.customerId === c.id && o.status === 'open' && o.date >= t)
  const paid = c.paidMonth === MONTH()
  return (
    <article className={['ccard', sel && 'sel', pNow && 'paused', !isOn(c, t) && 'inactive'].filter(Boolean).join(' ')}>
      <label className="pick" aria-label={`${c.name} 선택`}>
        <Checkbox checked={sel} onCheckedChange={v => pick(c.id, !!v)} className="size-5 pointer-coarse:size-6" />
      </label>
      <div className="cbody">
        <div className="chead">
          <button type="button" className="cname" onClick={() => openCustSheet(c.id)}>{c.name || '이름 없음'}</button>
          {pause && <Badge variant="warn">{pause.from <= t ? '중지 중' : '중지 예정'} {fmtShort(pause.from)}–{fmtShort(pause.to)}{pauseDays(pause)}</Badge>}
          {c.status !== 'active' && <Badge variant={['ended', 'moved'].includes(c.status) ? 'bad' : 'warn'}>{statusBadge(c)}</Badge>}
          {c.tags.includes('예시') && <Badge>예시</Badge>}
          {upcoming.length > 0 && <Badge variant="acc">주문 {upcoming.length}건</Badge>}
        </div>
        <div className="cloc">
          <Plate loc={c.loc} />
          <span className="muted">{c.loc.label || (c.loc.type !== 'apt' ? LOC_TYPES[c.loc.type] : '')}</span>
          {c.course != null && c.course !== '' && <span className="muted">코스 {c.course}</span>}
        </div>
        {c.regular.length ? (
          <div className="ritems">
            {c.regular.map((r, i) => (
              <div className={'ritem' + (r.qty ? '' : ' zero')} key={i}>
                <PDot pid={r.productId} />
                <span className="pn">{pName(r.productId)}</span>
                <span className="dd">{r.every === 2 ? '격주 ' : ''}{daysText(r.days)}</span>
                <Stepper value={r.qty} label={pName(r.productId)} onDec={() => changeQty(c.id, i, -1)} onInc={() => changeQty(c.id, i, 1)} />
              </div>
            ))}
          </div>
        ) : <div className="muted" style={{ fontSize: 13 }}>정기 품목 없음</div>}
        <div className="cmeta">
          {c.payment === 'cash'
            ? <Badge asChild variant={paid ? 'ok' : 'bad'}><button type="button" className="cursor-pointer" onClick={() => togglePaid(c.id)}>현금 · {paid ? '이번 달 수금 완료' : '이번 달 미수'}</button></Badge>
            : <Badge>{PAY[c.payment]}</Badge>}
          {c.ice && <Badge>아이스팩</Badge>}
          {c.bag && <Badge>전달주머니</Badge>}
          {c.holidayOff && <Badge>공휴일 쉼</Badge>}
          {c.bill === 'paper' && <Badge>종이 청구서</Badge>}
          {c.member && <Badge>회원</Badge>}
        </div>
        {c.notes && <div className="cnote">{c.notes}</div>}
      </div>
    </article>
  )
}

export default function CustomersView() {
  useStore()
  const defs = custFilters()
  const list = filteredCustomers(defs)
  const vis = list.map(c => c.id)
  const allSel = vis.length > 0 && vis.every(id => UI.selected.has(id))
  const someSel = !allSel && vis.some(id => UI.selected.has(id))
  const selAll = on => { vis.forEach(id => on ? UI.selected.add(id) : UI.selected.delete(id)); emit() }
  return (
    <>
      <div className="ctool">
        <div className="sec-h">
          <h2 className="page-h">고객 <span className="muted num" style={{ fontSize: 16 }}>{S.customers.length}명</span></h2>
          <div className="row">
            <Button size="sm" onClick={() => openAIImport('customers')}>가져오기</Button>
            <Button size="sm" variant="primary" onClick={() => openCustSheet(null)}>+ 고객</Button>
          </div>
        </div>
        <Input type="search" id="custq" placeholder="이름, 동-호(411-304), 메모 검색" value={UI.custQ} onChange={e => setUI({ custQ: e.target.value })} autoComplete="off" />
        <div className="chips" role="group" aria-label="필터">
          {defs.map(d => (
            <Chip key={d[0]} pressed={UI.custF === d[0]} onClick={() => setUI({ custF: d[0] })} count={S.customers.filter(d[2]).length}>{d[1]}</Chip>
          ))}
        </div>
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <label className="row cursor-pointer" style={{ gap: 8, fontSize: 14 }}>
            <Checkbox checked={allSel ? true : someSel ? 'indeterminate' : false} onCheckedChange={v => selAll(v === true)} className="size-[18px]" />
            보이는 고객 모두 선택
          </label>
          <span className="muted" style={{ fontSize: 12.5 }}>수량은 카드에서 바로 ± 조정</span>
        </div>
      </div>
      <div className="clist" id="custlist">
        {list.length ? list.map(c => <CustCard key={c.id} c={c} />) : (
          <EmptyCard title={S.customers.length ? '조건에 맞는 고객이 없어요' : '아직 고객이 없어요'} style={{ gridColumn: '1/-1' }}>
            <p>{S.customers.length ? '검색어나 필터를 바꿔 보세요.' : '“+ 고객”으로 추가하거나 hy 앱 화면 캡처를 가져오세요.'}</p>
          </EmptyCard>
        )}
      </div>
    </>
  )
}

export function BulkBar() {
  useStore()
  if (UI.tab !== 'customers' || !UI.selected.size) return null
  return (
    <div className="bulkbar"><div className="wrap">
      <span className="n">{UI.selected.size}명</span>
      <div className="acts">
        <button type="button" onClick={() => openBulk('pause')}>배달 중지</button>
        <button type="button" onClick={() => openBulk('resume')}>중지 해제</button>
        <button type="button" onClick={() => openBulk('qty')}>수량 변경</button>
        <button type="button" onClick={() => openOrderSheet({ customerIds: [...UI.selected] })}>주문 추가</button>
        <button type="button" onClick={() => openBulk('note')}>메모</button>
        <button type="button" onClick={() => openBulk('pay')}>수금</button>
        <button type="button" onClick={() => openBulk('status')}>상태</button>
      </div>
      <button type="button" className="x" aria-label="선택 해제" onClick={() => { UI.selected.clear(); emit() }}><IconClose /></button>
    </div></div>
  )
}
