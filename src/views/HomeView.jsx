// 오늘: next delivery day at a glance, the T-2 order count, reminders, alerts and incoming orders.
import { useState } from 'react'
import { S, useStore } from '@/store/state'
import { TODAY, addDays, fmt, fmtShort, dayOf } from '@/lib/dates'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ProductQty, TypeBadge, EmptyCard } from '@/components/common'
import { custById } from '@/domain/model'
import { locText } from '@/domain/location'
import { routeDefaultDate, orderingDay, targetFrom } from '@/domain/calendar'
import { orderedStops, sheetFor, isDelivered } from '@/domain/stops'
import { buildAlerts } from '@/domain/alerts'
import { setTab, gotoOrder, gotoRecords, gotoCustomers } from '@/shell/nav'
import { todoAdd, todoDone, ackPause, cancelOrder, restoreOrder } from '@/actions/home'
import { openBills } from '@/sheets/bills'
import { openOrderSheet } from '@/sheets/order-form'
import { openCustSheet } from '@/sheets/customer-form'
import { openAIImport } from '@/ai/import-sheet'

function TodoSection() {
  const [text, setText] = useState('')
  const open = S.config.todos.filter(t => !t.done).sort((a, b) => (a.due || '9').localeCompare(b.due || '9') || a.at - b.at)
  const add = () => { if (todoAdd(text)) setText('') }
  return (
    <div className="sec">
      <div className="sec-h"><h2>확인할 것 <span className="muted num" style={{ fontSize: 14 }}>{open.length}건</span></h2></div>
      <div className="card" style={{ padding: '4px 0' }}>
        <div>
          {open.length ? open.map(t => (
            <div className="todo" key={t.id}>
              <div className="t"><b>{t.text}</b><small>{fmtShort(dayOf(t.at))} 적음{t.due ? ` · ${fmt(t.due)}까지` : ''}</small></div>
              <Button size="sm" onClick={() => todoDone(t.id)}>확인 완료</Button>
            </div>
          )) : <div className="todo muted">확인할 게 없어요.</div>}
        </div>
        <div className="todo-add">
          <Input
            type="text" value={text} onChange={e => setText(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.nativeEvent.isComposing && e.keyCode !== 229) { e.preventDefault(); add() } }}
            placeholder="예: 점장님께 ○○ 고객 확인" aria-label="확인할 것"
          />
          <Button size="sm" onClick={add}>추가</Button>
        </div>
      </div>
    </div>
  )
}

// one photo chip per product with the total to pick up (sample orders)
function aggItems(items) {
  const m = new Map(); items.forEach(i => m.set(i.productId, (m.get(i.productId) || 0) + i.qty))
  return [...m]
}

function AlertAction({ action }) {
  const run = () => {
    if (action.act === 'ackPause') ackPause(action.id, action.p)
    else if (action.act === 'gotoOrder') gotoOrder(action.date)
    else if (action.act === 'openBills') openBills()
    else if (action.act === 'filterCash') gotoCustomers('cash')
  }
  return <Button size="sm" onClick={run}>{action.label}</Button>
}

function Alerts() {
  const alerts = buildAlerts()
  if (!alerts.length) return null
  return (
    <div className="sec">
      <div className="sec-h"><h2>알림</h2><span className="muted num" style={{ fontSize: 13 }}>{alerts.length}건</span></div>
      <div className="alerts">
        {alerts.map((a, i) => (
          <div className={'alert ' + a.kind} key={i}>
            <div className="t">
              <b>{a.who}</b>{a.title ? ' ' + a.title : ''}
              <small>{a.sub || ''}</small>
              {a.items?.length > 0 && (
                <div className="row" style={{ gap: '4px 10px', marginTop: 6 }}>
                  {aggItems(a.items).map(([pid, q]) => <ProductQty key={pid} pid={pid} qty={q} size={26} />)}
                </div>
              )}
            </div>
            {a.action && <AlertAction action={a.action} />}
          </div>
        ))}
      </div>
    </div>
  )
}

function RecentOrders() {
  const t = TODAY()
  const pending = S.orders.filter(o => !isDelivered(o) && (o.status === 'open' ? o.date >= addDays(t, -2) : o.date >= t))
  const recent = pending.slice().sort((a, b) => a.date.localeCompare(b.date) || b.createdAt - a.createdAt).slice(0, 8)
  const deliveredCount = S.orders.filter(o => o.status === 'open' && isDelivered(o) && o.date >= addDays(t, -7)).length
  return (
    <div className="sec">
      <div className="sec-h">
        <h2>최근 들어온 주문 <span className="muted num" style={{ fontSize: 14 }}>{pending.filter(o => o.status === 'open').length}건 남음</span></h2>
        <Button size="sm" onClick={() => openOrderSheet({})}>+ 주문</Button>
      </div>
      {recent.length ? (
        <div className="card recent">
          {recent.map(o => {
            const c = o.customerId ? custById(o.customerId) : null; const nm = c ? c.name : o.name; const loc = c ? c.loc : o.loc
            const cancelled = o.status === 'cancelled'
            return (
              <div className="it" key={o.id}>
                <TypeBadge type={o.type} />
                <div className="t">
                  <div><b>{nm || '이름 없음'}</b> <span className="muted">{locText(loc)}</span></div>
                  <div className="row" style={{ gap: '4px 10px', marginTop: 3, fontSize: 13, opacity: cancelled ? 0.55 : 1 }}>
                    <span className="muted">{fmt(o.date)}</span>
                    {o.items.map((i, k) => <ProductQty key={k} pid={i.productId} qty={i.qty} size={28} />)}
                    {cancelled && <span className="muted">· 취소됨</span>}
                  </div>
                </div>
                {cancelled
                  ? <Button size="sm" onClick={() => restoreOrder(o.id)}>되살리기</Button>
                  : <Button size="sm" variant="ghost" onClick={() => cancelOrder(o.id)}>취소</Button>}
              </div>
            )
          })}
        </div>
      ) : (
        <EmptyCard><p>남은 주문이 없어요. 일반·견본·선불정기·추가·회수 주문을 넣으면 여기와 동선, 발주표에 바로 들어가요.</p></EmptyCard>
      )}
      {deliveredCount > 0 && (
        <Button size="sm" variant="ghost" style={{ justifySelf: 'start' }} onClick={() => gotoRecords('done')}>
          최근 7일 전달 완료 {deliveredCount}건 · 배달 완료 기록 보기
        </Button>
      )}
    </div>
  )
}

export default function HomeView() {
  useStore()
  const t = TODAY(); const dd = routeDefaultDate()
  if (!S.customers.length && !S.orders.length) {
    return (
      <>
        <div className="hello"><h1>배달 준비</h1></div>
        <EmptyCard title="아직 고객이 없어요">
          <p>정기 고객을 한 명씩 추가하거나, hy 고객관리 앱 화면을 캡처해서 한 번에 가져올 수 있어요. 고객이 생기면 동선과 발주표가 자동으로 만들어져요.</p>
          <div className="row" style={{ justifyContent: 'center' }}>
            <Button variant="primary" onClick={() => openCustSheet(null)}>고객 추가</Button>
            <Button onClick={() => openAIImport('customers')}>화면 캡처로 가져오기</Button>
          </div>
        </EmptyCard>
      </>
    )
  }
  const stops = orderedStops(dd); const done = stops.filter(s => S.days[dd]?.done?.[s.key]).length
  const items = stops.reduce((s, st) => s + st.items.reduce((a, i) => a + i.qty, 0), 0)
  const od = orderingDay(t); const tgt = targetFrom(od); const rows = sheetFor(tgt)
  const buy = rows.reduce((s, r) => s + r.buy, 0); const kinds = rows.filter(r => r.buy > 0).length
  return (
    <>
      <div className="hello">
        <div><div className="eyebrow">{dd === t ? '오늘 배달' : '다음 배달'}</div><h1>{fmt(dd)}</h1></div>
        <Button variant="primary" onClick={() => setTab('route')}>배달 시작</Button>
      </div>
      <div className="homegrid">
        <div>
          <div className="sec">
            <div className="kpis">
              <div className="card kpi">
                <span className="eyebrow">배달지</span>
                <span className="big num">{done}<small>/ {stops.length}</small></span>
                <div className="bar"><i style={{ width: `${stops.length ? done / stops.length * 100 : 0}%` }} /></div>
                <span className="muted" style={{ fontSize: 13 }}>제품 {items}개</span>
              </div>
              <button type="button" className="card kpi" onClick={() => setTab('order')}>
                <span className="eyebrow">{od === t ? '오늘 발주' : '다음 발주 ' + fmtShort(od)}</span>
                <span className="big num">{buy}<small>개</small></span>
                <span className="muted" style={{ fontSize: 13 }}>{fmt(tgt)} 배달분 · {kinds}종</span>
              </button>
            </div>
          </div>
          <TodoSection />
          <Alerts />
        </div>
        <div>
          <RecentOrders />
        </div>
      </div>
    </>
  )
}
