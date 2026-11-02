// 배달: the day's route. Sorted by building order → entrance (1·2호 / 3·4호) → floor, then the saved base
// order and that day's drag changes. Products are shown as photos with a quantity so they can be
// recognised at a glance.
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { S, UI, useStore, setUI } from '@/store/state'
import { TODAY, MONTH, fmt, daysBetween } from '@/lib/dates'
import { useMediaQuery } from '@/lib/hooks'
import { cn } from '@/lib/util'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { EmptyCard, Plate, ProductQty, Seg } from '@/components/common'
import { IconBill, IconCheck, IconGrip, IconLeft, IconRight } from '@/components/icons'
import { TYPE_NAME } from '@/domain/constants'
import { routeDefaultDate, nextDeliveryDay, prevDeliveryDay, isHoliday, holidayName } from '@/domain/calendar'
import { orderedStops, itemAgg, stopNotes } from '@/domain/stops'
import {
  parseUnit, isNumB, bldName, seriesOf, entrancesOf, entIndex, entLines, singleEnt, entName, subLabel, groupKey, mergeSeq,
} from '@/domain/location'
import { billShow, billDate } from '@/domain/bills'
import { toggleDone, setSeq, billToggle } from '@/actions/route'
import { openStop } from '@/sheets/stop-editor'
import { openMoveTo, openRouteMore, saveRouteImage } from '@/sheets/route-sheets'

function setRheadH(el) { if (el) document.documentElement.style.setProperty('--rhead-h', el.offsetHeight + 'px') }

function scrollToBuilding(b) {
  let el = [...document.querySelectorAll('.rgb')].find(x => x.dataset.b === b)
  if (!el || !el.offsetParent) el = document.querySelector('.fplan')
  if (!el) return
  const off = 61 + (parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--rhead-h')) || 120) + 10
  window.scrollTo({ top: Math.max(0, el.getBoundingClientRect().top + window.scrollY - off), behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' })
}

// Drag a row by its handle (touch or mouse). The new order is kept locally while dragging and saved on drop.
function useRowDrag(listRef) {
  const [drag, setDrag] = useState(null) // { key, order: [visible keys] }
  const live = useRef(null)
  useEffect(() => () => live.current?.cleanup(), [])
  const start = (e, date, key, visKeys) => {
    if (e.button != null && e.button !== 0) return
    e.preventDefault()
    try { e.currentTarget.setPointerCapture?.(e.pointerId) } catch { /* not needed: we listen on window */ }
    const d = { key, date, pointerId: e.pointerId, startY: e.clientY, moved: false, order: visKeys.slice() }
    const move = ev => {
      if (ev.pointerId !== d.pointerId) return
      ev.preventDefault()
      const y = ev.clientY
      if (Math.abs(y - d.startY) > 4) d.moved = true
      const list = listRef.current
      if (list) {
        const rows = [...list.querySelectorAll('.rrow')].filter(r => r.dataset.key !== d.key)
        let before = null
        for (const r of rows) { const b = r.getBoundingClientRect(); if (y < b.top + b.height / 2) { before = r.dataset.key; break } }
        const others = d.order.filter(k => k !== d.key)
        let idx = before == null ? others.length : others.indexOf(before)
        if (idx < 0) idx = others.length
        const next = [...others.slice(0, idx), d.key, ...others.slice(idx)]
        if (next.join('\n') !== d.order.join('\n')) { d.order = next; setDrag({ key: d.key, order: next }) }
      }
      const vh = window.innerHeight
      if (y < 140) window.scrollBy(0, -12); else if (y > vh - 150) window.scrollBy(0, 12)
    }
    const cleanup = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', end)
      window.removeEventListener('pointercancel', end)
      live.current = null
    }
    const end = ev => {
      if (ev.pointerId !== d.pointerId) return
      cleanup(); setDrag(null)
      if (!d.moved) return
      const visible = d.order
      const all = orderedStops(d.date).map(s => s.key)
      // keep hidden (done) rows at their relative place
      const hidden = all.filter(k => !visible.includes(k))
      const merged = mergeSeq(all.map(k => ({ key: k })), visible).map(x => x.key)
      setSeq(d.date, hidden.length ? merged : visible)
    }
    live.current = { cleanup }
    window.addEventListener('pointermove', move, { passive: false })
    window.addEventListener('pointerup', end)
    window.addEventListener('pointercancel', end)
    setDrag({ key, order: d.order })
  }
  return [drag, start]
}

export default function RouteView() {
  useStore()
  const split = useMediaQuery('(min-width: 1024px)')
  const tablet = useMediaQuery('(min-width: 744px)')
  const photo = tablet ? 92 : 72 // big photos under each stop: recognisable at a glance while walking
  const headRef = useRef(null)
  const listRef = useRef(null)
  const [drag, startDrag] = useRowDrag(listRef)

  // sticky header height feeds the split view's sticky map (CSS --rhead-h)
  useLayoutEffect(() => { setRheadH(headRef.current) })
  useEffect(() => {
    let t = null
    const onResize = () => { clearTimeout(t); t = setTimeout(() => setRheadH(headRef.current), 120) }
    window.addEventListener('resize', onResize)
    return () => { window.removeEventListener('resize', onResize); clearTimeout(t) }
  }, [])
  // after a tile tap: scroll the list (or the floor plan) to that building
  useEffect(() => {
    if (!UI.scrollB) return
    const b = UI.scrollB; UI.scrollB = null
    requestAnimationFrame(() => scrollToBuilding(b))
  })

  const date = UI.routeDate || routeDefaultDate()
  const stops = orderedStops(date); const doneMap = S.days[date]?.done || {}
  const live = stops.filter(s => !s.skipped)
  const done = live.filter(s => doneMap[s.key]).length
  const items = live.reduce((s, st) => s + st.items.reduce((a, i) => a + i.qty, 0), 0)
  const custom = !!S.days[date]?.seq; const dense = UI.routeDense !== false
  const dd = daysBetween(TODAY(), date)
  const rel = date === TODAY() ? '오늘' : (dd > 0 ? dd + '일 뒤' : '지난 날')

  const head = (
    <div className="rhead" ref={headRef}>
      <div className="rh1">
        <div className="dn">
          <Button size="icon" aria-label="이전 배달일" onClick={() => setUI({ routeDate: prevDeliveryDay(date), mapB: null })}><IconLeft /></Button>
          <div className="d"><b>{fmt(date)}</b><small>{rel} · {live.length}곳 · {items}개</small></div>
          <Button size="icon" aria-label="다음 배달일" onClick={() => setUI({ routeDate: nextDeliveryDay(date), mapB: null })}><IconRight /></Button>
        </div>
        <div className="prog">
          <div className="bar"><i style={{ width: `${live.length ? done / live.length * 100 : 0}%` }} /></div>
          <b className="num">{done}/{live.length}</b>
        </div>
      </div>
      <div className="row rh2">
        {!split && (
          <Seg className="w-auto flex-none" value={UI.routeMode} onChange={m => setUI({ routeMode: m }, true)} options={[['list', '목록'], ['map', '단지 지도']]} />
        )}
        <span style={{ flex: 1 }} />
        {(UI.routeMode === 'list' || split) && (
          <>
            <Button size="sm" onClick={() => setUI({ routeDense: !dense }, true)}>{dense ? '자세히' : '간단히'}</Button>
            <Button size="sm" aria-pressed={UI.hideDone} onClick={() => setUI({ hideDone: !UI.hideDone }, true)}>{UI.hideDone ? '완료 보기' : '완료 숨김'}</Button>
            <Button size="sm" onClick={() => openRouteMore(date)}>순서{custom ? ' *' : ''}</Button>
          </>
        )}
        {stops.length > 0 && <Button size="sm" aria-label="동선 리스트 사진으로 저장" onClick={() => saveRouteImage(date)}>사진</Button>}
      </div>
    </div>
  )

  if (!stops.length) {
    return (
      <>
        {head}
        <EmptyCard title={isHoliday(date) ? holidayName(date) : '배달이 없는 날이에요'}>
          <p style={{ margin: 0 }}>{isHoliday(date) ? '정기 배달은 쉬고, 이 날짜로 넣은 주문만 보여요.' : '이 날짜에 배달할 고객이나 주문이 없어요.'}</p>
        </EmptyCard>
      </>
    )
  }
  if (UI.routeMode === 'map' && !split) return <>{head}<RouteMap date={date} stops={stops} doneMap={doneMap} /></>

  const nextStop = live.find(s => !doneMap[s.key]); const nextKey = nextStop?.key
  const focusB = split ? ((UI.mapB && stops.some(s => s.loc.building === UI.mapB)) ? UI.mapB : (nextStop || stops[0])?.loc.building) : null
  const num = new Map(); let k = 0; stops.forEach(s => { if (!s.skipped) num.set(s.key, ++k) })
  let vis = stops.filter(s => !(UI.hideDone && doneMap[s.key]))
  const visKeys = vis.map(s => s.key)
  if (drag) {
    const byKey = new Map(vis.map(s => [s.key, s]))
    const ordered = drag.order.map(key => byKey.get(key)).filter(Boolean)
    vis.forEach(s => { if (!drag.order.includes(s.key)) ordered.push(s) })
    vis = ordered
  }
  // consecutive stops in the same 동 form one block; entrance sub-headers appear only inside two-entrance 동
  const runLen = new Map()
  { let i = 0; while (i < vis.length) { let j = i; while (j + 1 < vis.length && vis[j + 1].loc.building === vis[i].loc.building) j++; runLen.set(i, j - i + 1); i = j + 1 } }

  const onOpenStop = st => {
    if (split && UI.mapB !== st.loc.building) setUI({ mapB: st.loc.building })
    openStop(date, st.key)
  }

  const rows = []
  let prevB = null, prevG = null, blk = -1
  vis.forEach((st, idx) => {
    const isDone = !!doneMap[st.key]; const c = st.cust
    const g = groupKey(st.loc)
    if (idx === 0 || st.loc.building !== prevB) {
      blk++; const n = runLen.get(idx) || 1
      rows.push(
        <li key={'b:' + st.key} className={`rgb bk${blk % 2}`} data-b={st.loc.building} aria-hidden="true">
          <span>{bldName(st.loc.building)}</span>{n > 1 && <span className="cnt">{n}곳</span>}
        </li>,
      )
      prevB = st.loc.building; prevG = null
    }
    if (g !== prevG) {
      const sub = subLabel(st.loc)
      if (sub) rows.push(<li key={'e:' + st.key} className={`rge bk${blk % 2}`} aria-hidden="true">{sub}</li>)
      prevG = g
    }
    const u = parseUnit(st.loc.unit); const ei = entIndex(st.loc.building, u.line); const ent = entName(st.loc.building, ei)
    const its = itemAgg(st).map(x => (
      <ProductQty key={x.pid + '|' + x.ty} pid={x.pid} qty={x.q} type={x.ty} size={photo} big name={dense ? 'auto' : 'short'} />
    ))
    const notes = stopNotes(st)
    const tags = [...new Set(st.orders.map(o => o.type))].map(t => (
      <Badge key={t} size="xs" variant={t}>{TYPE_NAME[t]}{t === 'sample' && !dense ? ' · 지점 수령' : ''}</Badge>
    ))
    const dayTag = st.skipped ? <Badge size="xs">이날 빠짐</Badge> : st.ov ? <Badge size="xs" variant="acc">이날 변경</Badge> : null
    const flags = dense ? [] : [c?.ice ? '아이스팩' : '', c?.bag ? '주머니' : '', c?.payment === 'cash' && c.paidMonth !== MONTH() ? '현금 미수' : ''].filter(Boolean)
    const bill = billShow(st, date) ? (
      billDate(st.cust.id)
        ? <button type="button" className="billic given" aria-label="청구서 전달함, 누르면 취소" onClick={e => { e.stopPropagation(); billToggle(st.cust.id, date) }}><IconCheck strokeWidth={3} />{dense ? '' : '청구서'}</button>
        : <button type="button" className="billic" aria-label="종이 청구서 같이 전달, 주고 나서 누르기" onClick={e => { e.stopPropagation(); billToggle(st.cust.id, date) }}><IconBill />{dense ? '' : '청구서'}</button>
    ) : null
    rows.push(
      <li
        key={st.key}
        className={cn('rrow', 'bk' + (blk % 2), isDone && 'done', st.key === nextKey && 'next', st.skipped && 'skip', split && st.loc.building === focusB && 'focus', drag?.key === st.key && 'dragging')}
        data-key={st.key}
      >
        <button type="button" className="handle" aria-label="끌어서 순서 바꾸기" onPointerDown={e => startDrag(e, date, st.key, visKeys)}><IconGrip /></button>
        <button type="button" className="seq" aria-label={`${num.get(st.key) || ''}번, 순서 옮기기`} onClick={() => openMoveTo(date, st.key)}>{num.get(st.key) || '–'}</button>
        <div
          className="rmain" role="button" tabIndex={0} aria-label={`${st.name} 수량·메모 고치기`}
          onClick={() => onOpenStop(st)}
          onKeyDown={e => { if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); onOpenStop(st) } }}
        >
          <span className="who">
            <Plate loc={st.loc} sm />
            {bill}
            {!dense && ent && <span className="ent">{ent}</span>}
            <span className="nm">{st.name}</span>
            {tags}{dayTag}
            {dense && notes && <span className="mk" title="메모 있음" />}
          </span>
        </div>
        <div className="rbody" onClick={() => onOpenStop(st)}>
          <div className="pics">{its.length ? its : <span className="muted">제품 없음</span>}</div>
          {!dense && (flags.length > 0 || st.loc.label) && (
            <span className="rflags">
              {st.loc.label && <span className="muted" style={{ fontSize: 12.5 }}>{st.loc.label}</span>}
              {flags.map(f => <Badge key={f} size="xs" variant={f === '현금 미수' ? 'bad' : 'default'}>{f}</Badge>)}
            </span>
          )}
          {!dense && notes && <span className="rnote">{notes}</span>}
        </div>
        <button type="button" className="check" aria-pressed={isDone} aria-label={`${st.name} 배달 완료`} onClick={() => toggleDone(date, st.key)}><IconCheck strokeWidth={3} /></button>
      </li>,
    )
  })

  const list = (
    <>
      <ol className={cn('rlist', dense && 'dense')} id="rlist" ref={listRef} data-date={date}>{rows}</ol>
      <p className="hint" style={{ marginTop: 12 }}>이름 쪽을 누르면 수량·메모·주문을 고칠 수 있어요. 점 손잡이를 끌거나 번호를 눌러 순서를 옮겨요.</p>
    </>
  )
  if (split) {
    return (
      <>
        {head}
        <div className="rsplit">
          <div>{list}</div>
          <aside className="rside" aria-label="동 배치"><RouteMap date={date} stops={stops} doneMap={doneMap} autoSel={focusB} /></aside>
        </div>
      </>
    )
  }
  return <>{head}{list}</>
}

/* ---------- complex map (단지 지도) ---------- */
function RouteMap({ date, stops, doneMap, autoSel }) {
  const byB = {}
  stops.filter(s => !s.skipped).forEach(s => { (byB[s.loc.building] = byB[s.loc.building] || []).push(s) })
  const order = S.config.routeOrder.slice(); Object.keys(byB).forEach(b => { if (!order.includes(b)) order.push(b) })
  const groups = {}; order.forEach(b => { const g = seriesOf(b); (groups[g] = groups[g] || []).push(b) })
  const gnames = Object.keys(groups).sort((a, b) => (a === '상가·기타' ? 1 : 0) - (b === '상가·기타' ? 1 : 0))
  const sel = UI.mapB && byB[UI.mapB] ? UI.mapB : (autoSel && byB[autoSel] ? autoSel : null)
  const pick = b => { const next = UI.mapB === b ? null : b; setUI({ mapB: next, scrollB: next }) }
  return (
    <>
      {gnames.map(g => (
        <div className="mapsec" key={g}>
          <h3>{g} <span className="num">{groups[g].reduce((s, b) => s + (byB[b]?.length || 0), 0)}곳</span></h3>
          <div className="tiles">
            {groups[g].map(b => {
              const l = byB[b] || []; const dn = l.filter(s => doneMap[s.key]).length
              const cls = !l.length ? 'none' : dn === l.length ? 'full' : 'pend'
              let inner
              if (isNumB(b) && !singleEnt(b)) {
                const buckets = new Map()
                l.forEach(s => { const u = parseUnit(s.loc.unit); const key = (u.floor != null && u.floor < 0) || !u.line ? 'B' : entIndex(b, u.line); if (!buckets.has(key)) buckets.set(key, []); buckets.get(key).push(s) })
                const cells = entrancesOf(b).map((_, i) => ({ key: i, label: entLines(b, i).join('·') }))
                if (buckets.has('B')) cells.unshift({ key: 'B', label: 'B' })
                inner = (
                  <span className="ents">
                    {cells.map(cl => {
                      const ls = buckets.get(cl.key) || []; const d = ls.filter(s => doneMap[s.key]).length
                      return <i key={cl.key} className={!ls.length ? '' : d === ls.length ? 'full' : 'pend'}>{cl.label}<b>{ls.length ? d + '/' + ls.length : '·'}</b></i>
                    })}
                  </span>
                )
              } else inner = <span className="cnt">{l.length ? `${dn}/${l.length}` : '—'}</span>
              return (
                <button type="button" key={b} className={`tile ${cls}`} aria-pressed={sel === b} tabIndex={l.length ? undefined : -1} onClick={() => pick(b)}>
                  <span className={cn('bn', !isNumB(b) && 'txt')}>{b}</span>{inner}
                </button>
              )
            })}
          </div>
        </div>
      ))}
      {sel
        ? <FloorPlan b={sel} list={byB[sel]} doneMap={doneMap} date={date} />
        : <p className="hint">칸마다 왼쪽은 1·2호, 오른쪽은 3·4호(5호까지 있으면 3·4·5호) 입구예요. 파란 칸을 누르면 층별 배치가 보여요.</p>}
    </>
  )
}

function FloorPlan({ b, list, doneMap, date }) {
  const numeric = [], other = []
  list.forEach(s => { const u = parseUnit(s.loc.unit); if (u.floor != null && u.floor > 0 && u.line) numeric.push({ s, ...u }); else other.push(s) })
  const ents = {}; numeric.forEach(x => { const e = entIndex(b, x.line); (ents[e] = ents[e] || []).push(x) })
  const cell = s => {
    const dn = !!doneMap[s.key]
    return (
      <button type="button" key={s.key} className={cn('cell has', dn && 'done')} aria-pressed={dn} onClick={() => toggleDone(date, s.key)}>
        <span className="u">{s.loc.unit || '—'}{dn ? ' ✓' : ''}</span><span className="nm">{s.name}</span>
      </button>
    )
  }
  const entBlocks = Object.keys(ents).map(Number).sort((a, c) => a - c).map(e => {
    const xs = ents[e]
    const lines = [...new Set([...entLines(b, e), ...xs.map(x => x.line)])].sort((a, c) => a - c)
    const floors = [...new Set(xs.map(x => x.floor))].sort((a, c) => S.config.floorDir === 'desc' ? c - a : a - c)
    let prev = null; const rows = []
    floors.forEach(f => {
      if (prev != null && Math.abs(prev - f) > 1) rows.push(<div className="gap" key={'g' + f}>⋮ {Math.abs(prev - f) - 1}개 층</div>)
      prev = f
      rows.push(
        <div className="fl" style={{ '--cols': lines.length }} key={'f' + f}>
          <span className="fn">{f}F</span>
          {lines.map(l => { const x = xs.find(y => y.floor === f && y.line === l); return x ? cell(x.s) : <span className="cell" key={'x' + l} /> })}
        </div>,
      )
    })
    return (
      <div className="ent" key={e}>
        <h4>{singleEnt(b) ? '세대' : entName(b, e) + ' 출입구'}</h4>
        <div className="fl" style={{ '--cols': lines.length }}><span />{lines.map(l => <span className="lh" key={l}>{l}호</span>)}</div>
        <div className="floors">{rows}</div>
      </div>
    )
  })
  return (
    <div className="card fplan">
      <div className="sec-h"><h2>{bldName(b)}</h2><span className="muted num">{list.filter(s => doneMap[s.key]).length}/{list.length} 완료</span></div>
      <div className="ents">
        {other.length > 0 && <div className="ent"><h4>지하·기타</h4><div className="floors">{other.map(cell)}</div></div>}
        {entBlocks}
      </div>
    </div>
  )
}
