// 발주 (T-2 ordering sheet): demand for the delivery date two business days ahead, stock, what to order.
import { Fragment, useEffect, useRef, useState } from 'react'
import { S, UI, useStore } from '@/store/state'
import { save } from '@/store/sync'
import { TODAY, fmt, fmtStamp } from '@/lib/dates'
import { openSheet, SheetHead } from '@/lib/sheet'
import { toast } from '@/lib/toast'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { ProductImage, ProductQty, TypeBadge, EmptyCard } from '@/components/common'
import { IconLeft, IconRight, IconCopy } from '@/components/icons'
import { TYPES, ORDER_TYPES, TYPE_NAME } from '@/domain/constants'
import { isOn, noBuyOrder, orderWho } from '@/domain/model'
import { locText } from '@/domain/location'
import { orderingDay, targetFrom, orderDayFor, nextDeliveryDay, pauseOn, isHoliday, isPartHol, holidayName } from '@/domain/calendar'
import { sheetFor, confirmDiff } from '@/domain/stops'
import { stockZero, setStock, confirmOrder, copyOrderText, moveOrderDate, toggleOrderRow } from '@/actions/order'

const EX_TITLE = { nobuy: '따로 결제 · 발주 안 함', sample: '견본 · 지점에서 받아오기', fredit: '일반(프레딧) · 자동 발주', prepaid: '선불정기 · 자동 발주', adhoc: '추가주문 · 발주 제외', pickup: '회수 · 받아올 것' }

function CopySheet({ text }) {
  const ref = useRef(null)
  useEffect(() => { const ta = ref.current; if (ta) { ta.focus(); ta.select() } }, [])
  return (
    <>
      <SheetHead title="발주 목록" />
      <p className="hint">자동 복사가 막혀 있어요. 아래 글을 길게 눌러 복사하세요.</p>
      <Textarea ref={ref} defaultValue={text} style={{ minHeight: 220 }} aria-label="발주 목록" />
    </>
  )
}

async function copyOrder(date) {
  const text = copyOrderText(date)
  try { await navigator.clipboard.writeText(text); toast('복사했어요. 출고 신청 앱에 붙여 넣으세요.') }
  catch { openSheet(<CopySheet text={text} />) }
}

// Stock input: the 발주 numbers update while typing; it saves when left or after a short pause.
function StockInput({ pid, name, stock, onFocus, onBlur }) {
  const [draft, setDraft] = useState(null)
  const timer = useRef(null)
  useEffect(() => () => {
    if (timer.current) { clearTimeout(timer.current); timer.current = null; queueMicrotask(() => save('config')) }
  }, [])
  const flush = () => { if (timer.current) { clearTimeout(timer.current); timer.current = null } save('config') }
  return (
    <Input
      type="number" inputMode="numeric" min="0" aria-label={`${name} 재고`}
      className="ml-auto min-h-10 w-[68px] px-2 py-1 text-right tabular-nums"
      value={draft ?? String(stock)}
      onFocus={onFocus}
      onChange={e => {
        setDraft(e.target.value)
        setStock(pid, e.target.value, false)
        clearTimeout(timer.current)
        timer.current = setTimeout(() => { timer.current = null; save('config') }, 700)
      }}
      onBlur={() => { setDraft(null); flush(); onBlur() }}
    />
  )
}

function OrderLine({ o }) {
  const { name, loc } = orderWho(o)
  return (
    <div>
      <span className="its">{o.items.map((i, k) => <ProductQty key={k} pid={i.productId} qty={i.qty} type={o.type} size={26} />)}</span>
      <span>{name} <span className="muted">{locText(loc)}</span></span>
    </div>
  )
}

export default function OrderView() {
  useStore()
  const [editPid, setEditPid] = useState(null)
  const t = TODAY(); const od = orderingDay(t); const tgt = targetFrom(od)
  const date = UI.orderDate || tgt
  const rows = sheetFor(date); const P = S.config.purchase
  // a row being edited stays on screen even if its stock goes back to 0
  const show = rows.filter(r => r.need || r.excl || r.stock || r.p.id === editPid)
  const odFor = orderDayFor(date)
  const diff = confirmDiff(date, rows)
  const conf = S.days[date]?.confirmed
  let status
  if (date === tgt) status = od === t ? <Badge variant="acc">오늘 발주할 날짜</Badge> : <Badge variant="acc">다음 발주일 {fmt(od)}</Badge>
  else if (odFor < t) status = <Badge variant="warn">발주일 {fmt(odFor)} 지남</Badge>
  else status = <Badge>발주일 {fmt(odFor)}</Badge>
  const resumes = S.customers.filter(c => isOn(c, date) && c.pauses.some(p => nextDeliveryDay(p.to) === date) && !pauseOn(c, date))
  const exGroups = ORDER_TYPES.filter(ty => ty === 'pickup' || !P[ty])
    .map(ty => ({ t: ty, list: S.orders.filter(o => o.date === date && o.type === ty && o.status === 'open') }))
    .filter(g => g.list.length)
  const nbList = S.orders.filter(o => o.date === date && o.status === 'open' && o.type !== 'pickup' && P[o.type] && noBuyOrder(o))
  if (nbList.length) exGroups.push({ t: 'nobuy', list: nbList })
  const totalBuy = show.reduce((s, r) => s + r.buy, 0)
  const typesIn = TYPES.filter(x => P[x] && x !== 'pickup').map(x => TYPE_NAME[x]).join('·')

  return (
    <>
      <div className="ohead">
        <div className="datenav">
          <Button size="icon" aria-label="이전 배달일" onClick={() => moveOrderDate(-1)}><IconLeft /></Button>
          <div className="d">{fmt(date)} 배달분<small>{status}</small></div>
          <Button size="icon" aria-label="다음 배달일" onClick={() => moveOrderDate(1)}><IconRight /></Button>
        </div>
        {date !== tgt && <div className="row" style={{ justifyContent: 'center' }}><Button size="sm" onClick={() => moveOrderDate(0)}>발주할 날짜({fmt(tgt)})로</Button></div>}
        {isHoliday(date) && <div className="warnbox">{holidayName(date)}: 정기 배달이 없는 날이에요. 이 날짜로 들어온 주문만 보여요.</div>}
        {isPartHol(date) && <div className="infobox">{holidayName(date)} (공휴일): 아파트는 배달하고, 공휴일에 쉬는 곳(상가·주민센터·미화/관리)은 발주에서 빠졌어요.</div>}
        {diff && diff.length > 0 && (
          <div className="warnbox">
            <b>확정 후 바뀐 수량</b><br />
            {diff.map(x => `${x.name} ${x.d > 0 ? '+' : ''}${x.d}`).join(' · ')}
            {odFor < t && <><br />이미 발주한 날짜예요. 남는 재고로 채우거나 지점에 추가 요청하세요.</>}
          </div>
        )}
        {resumes.length > 0 && <div className="infobox">중지 끝나고 다시 들어온 고객: {resumes.map(c => c.name).join(', ')}</div>}
      </div>
      <div className="ogrid">
        <div>
          {show.length ? (
            <>
              <div className="card tblwrap">
                <table className="ot">
                  <thead><tr><th>제품 (출고신청 이름)</th><th>필요</th><th>재고</th><th>발주</th></tr></thead>
                  <tbody>
                    {show.map((r, ri) => {
                      const catRow = !!r.p.cat && (ri === 0 || (show[ri - 1].p.cat || '') !== (r.p.cat || ''))
                      const open = UI.openP === r.p.id
                      const c = conf ? (+conf[r.p.id] || 0) : null; const d = c == null ? 0 : r.buy - c
                      const parts = TYPES.filter(x => r.r[x] && x !== 'pickup').map(x => `${TYPE_NAME[x]} ${r.r[x]}${P[x] ? '' : '(제외)'}`).join(' · ')
                      return (
                        <Fragment key={r.p.id}>
                          {catRow && <tr className="cat"><td colSpan={4}>{r.p.cat}</td></tr>}
                          <tr className="prow" onClick={e => { if (e.target.closest('input')) return; toggleOrderRow(r.p.id) }}>
                            <td>
                              <div className="pname">
                                <ProductImage pid={r.p.id} size={36} />
                                <div>
                                  <b>{r.p.orderName || r.p.name}</b>
                                  {r.p.orderName && r.p.orderName !== r.p.name && <small>배달표: {r.p.name}</small>}
                                  <small>{parts || '주문 없음'}</small>
                                </div>
                              </div>
                            </td>
                            <td>{r.need}</td>
                            <td><StockInput pid={r.p.id} name={r.p.name} stock={r.stock} onFocus={() => setEditPid(r.p.id)} onBlur={() => setEditPid(null)} /></td>
                            <td>
                              <span className={'buy' + (r.buy ? '' : ' zero')}>{r.buy}</span>
                              {d ? <span className={'diff ' + (d > 0 ? 'up' : 'dn')}>{d > 0 ? '+' : ''}{d}</span> : null}
                            </td>
                          </tr>
                          {open && (
                            <tr className="detail"><td colSpan={4}>
                              <div className="brk">
                                {r.r.rows.length
                                  ? r.r.rows.map((x, i) => <div key={i}><TypeBadge type={x.type} /><span>{x.name} <span className="muted">{locText(x.loc)}</span></span><b className="num">{x.qty}</b></div>)
                                  : <div className="muted">주문 없음</div>}
                              </div>
                            </td></tr>
                          )}
                        </Fragment>
                      )
                    })}
                  </tbody>
                  <tfoot>
                    <tr>
                      <td>합계 <span className="muted" style={{ fontWeight: 400, fontSize: 12.5 }}>({typesIn} 포함)</span></td>
                      <td>{show.reduce((s, r) => s + r.need, 0)}</td>
                      <td>{show.reduce((s, r) => s + r.stock, 0)}</td>
                      <td><span className="buy">{totalBuy}</span></td>
                    </tr>
                  </tfoot>
                </table>
              </div>
              <div className="row" style={{ marginTop: 12, justifyContent: 'flex-end' }}>
                <Button onClick={stockZero}>재고 0으로</Button>
                <Button onClick={() => copyOrder(date)}><IconCopy />발주 목록 복사</Button>
                <Button variant="primary" onClick={() => confirmOrder(date)}>{conf ? '다시 확정' : '발주 확정'}</Button>
              </div>
              {conf && <p className="hint" style={{ textAlign: 'right', marginTop: 6 }}>확정: {fmtStamp(S.days[date].confirmedAt || 0)} · 그 뒤로 바뀐 수량은 빨간 +로 표시돼요</p>}
            </>
          ) : (
            <EmptyCard title={`${fmt(date)}에 배달할 제품이 없어요`}><p>정기 고객이 없거나 모두 중지된 날이에요.</p></EmptyCard>
          )}
        </div>
        <aside className="oside">
          {exGroups.length ? (
            <div className="sec" style={{ marginTop: 22 }}>
              <div className="sec-h"><h2>발주에서 뺀 주문</h2></div>
              {exGroups.map(g => (
                <div className="card" style={{ padding: 12 }} key={g.t}>
                  <div className="row" style={{ justifyContent: 'space-between' }}>
                    <b>{EX_TITLE[g.t]}</b>
                    <Badge variant={g.t === 'nobuy' ? 'default' : g.t}>{g.list.length}건</Badge>
                  </div>
                  <div className="brk" style={{ marginTop: 8 }}>{g.list.map(o => <OrderLine key={o.id} o={o} />)}</div>
                </div>
              ))}
              <p className="hint">설정 &gt; 발주에 포함할 주문에서 바꿀 수 있어요.</p>
            </div>
          ) : (
            <EmptyCard title="발주에서 뺀 주문 없음" className="oside-empty">
              <p>견본(지점 수령), 일반·선불정기(프레딧 자동 발주), 추가주문, 회수는 여기에 따로 모여요. 행을 누르면 고객별 내역이 펼쳐져요.</p>
            </EmptyCard>
          )}
        </aside>
      </div>
    </>
  )
}
