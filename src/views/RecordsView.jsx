// 실적 · 변경 기록 · 배달 완료
import { useEffect, useState } from 'react'
import { S, UI, useStore, setUI } from '@/store/state'
import { sync, loadOlderLog, ensurePerfMonth, perfWindowStart } from '@/store/sync'
import { TODAY, MONTH, fmt, hm, dayOf, fmtStamp, pad } from '@/lib/dates'
import { compact } from '@/lib/util'
import { toast } from '@/lib/toast'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { ProductImage, ProductQty, Seg, Chip } from '@/components/common'
import { IconLeft, IconRight } from '@/components/icons'
import { pName } from '@/domain/model'
import { isDeliveryDay } from '@/domain/calendar'
import { whenText } from '@/domain/log'
import { perfData, perfOrder, prodOrderIdx, dayStatus } from '@/domain/perf'
import { openPerfSheet, openDoneDaySheet, openLogSheet } from '@/sheets/records-sheets'

const shiftMonth = (month, d) => { const [y, m] = month.split('-').map(Number); const x = new Date(y, m - 1 + d, 1); return `${x.getFullYear()}-${pad(x.getMonth() + 1)}` }
const byProduct = (a, b) => prodOrderIdx(a[0]) - prodOrderIdx(b[0])

// Months older than the live window (about 100 days) are loaded from the server when opened.
function useMonthArchive(month) {
  const needs = month + '-01' < perfWindowStart() && !sync.perfMonths.has(month)
  const [failed, setFailed] = useState(null)
  const [tries, setTries] = useState(0)
  useEffect(() => {
    if (!needs) return
    let alive = true
    ensurePerfMonth(month).then(() => { if (alive) setFailed(null) }, () => { if (alive) setFailed(month) })
    return () => { alive = false }
  }, [month, needs, tries])
  const status = !needs ? null : failed === month ? 'error' : 'loading'
  return { status, retry: () => { setFailed(null); setTries(n => n + 1) } }
}

function ArchiveNote({ status, retry }) {
  if (status === 'loading') return <p className="hint">지난 기록을 불러오는 중…</p>
  if (status === 'error') return (
    <div className="warnbox row" style={{ justifyContent: 'space-between' }}>
      <span>지난 기록을 불러오지 못했어요. 인터넷 연결을 확인해 주세요.</span>
      <Button size="sm" onClick={retry}>다시</Button>
    </div>
  )
  return null
}

function MonthNav({ month, onMove, sub }) {
  const [y, m] = month.split('-').map(Number)
  return (
    <div className="datenav">
      <Button size="icon" aria-label="이전 달" onClick={() => onMove(-1)}><IconLeft /></Button>
      <div className="d">{y}년 {m}월<small>{sub}</small></div>
      <Button size="icon" aria-label="다음 달" onClick={() => onMove(1)}><IconRight /></Button>
    </div>
  )
}

/* ---------- 실적 ---------- */
function PerfPanel() {
  const month = UI.perfMonth || MONTH(); const fut = !!UI.perfFuture
  const archive = useMonthArchive(month)
  const data = perfData(month, fut)
  const list = perfOrder([...data.values()].filter(r => r.total > 0))
  const totals = {}; list.forEach(r => Object.entries(r.prod).forEach(([p, q]) => { totals[p] = (totals[p] || 0) + q }))
  const sum = Object.values(totals).reduce((s, q) => s + q, 0)
  const est = [...data.values()].some(r => r.dates.some(d => d.est === 1))
  const q = compact(UI.perfQ || '')
  const shown = q ? list.filter(r => compact(r.name + r.loc).includes(q)) : list
  return (
    <>
      <div className="ohead">
        <MonthNav month={month} onMove={d => setUI({ perfMonth: shiftMonth(month, d) })}
          sub={`${fut ? '월말까지 예정 포함' : '오늘까지 배달한 것'} · 고객 ${list.length}명 · 제품 ${sum}개`} />
        <div className="row">
          <Input type="search" placeholder="이름·동-호 검색" value={UI.perfQ || ''} onChange={e => setUI({ perfQ: e.target.value })} style={{ flex: 1, minWidth: 0 }} aria-label="실적 검색" />
          <Chip pressed={fut} onClick={() => setUI({ perfFuture: !fut })}>월말까지 예정 포함</Chip>
        </div>
        {est && <p className="hint">앱을 쓰기 전 날짜(10/1~10/20)는 그때 명단을 지금 기준으로 다시 계산한 추정치예요. 날짜별 내역에 “추정”으로 표시돼요.</p>}
        <ArchiveNote {...archive} />
      </div>
      {!archive.status && (
        <>
          <details className="card" style={{ padding: 0, marginBottom: 12 }}>
            <summary style={{ padding: '12px 14px', cursor: 'pointer', fontWeight: 600 }}>제품별 합계 <span className="muted num">{Object.keys(totals).length}종 · {sum}개</span></summary>
            <div className="tblwrap">
              <table className="ot"><tbody>
                {Object.entries(totals).sort(byProduct).map(([p, n]) => (
                  <tr key={p}><td><div className="pname"><ProductImage pid={p} size={28} />{pName(p)}</div></td><td><b className="num">{n}</b></td></tr>
                ))}
              </tbody></table>
            </div>
          </details>
          <div className="card perflist">
            {shown.length ? shown.map(r => (
              <button type="button" className="pr" key={r.key} onClick={() => openPerfSheet(r.key)}>
                <span className="plate sm">{r.loc || '—'}</span>
                <span className="nm">{r.name}</span>
                <span className="its">{Object.entries(r.prod).sort(byProduct).map(([p, n]) => <ProductQty key={p} pid={p} qty={n} size={26} />)}</span>
                <span className="tot num">{r.dates.length}회 · <b>{r.total}</b>개</span>
              </button>
            )) : <div className="empty"><p>이 달 실적이 없어요.</p></div>}
          </div>
        </>
      )}
    </>
  )
}

/* ---------- 변경 기록 ---------- */
const LOG_FILTERS = [['all', '전체'], ['upcoming', '앞으로 해당'], ['month', '이번 달']]

function LogPanel() {
  const [cap, setCap] = useState(400)
  const [busy, setBusy] = useState(false)
  const q = compact(UI.logQ || ''); const f = UI.logF || 'all'
  const t = TODAY(); const ms = t.slice(0, 8) + '01'
  let L = S.log.slice().sort((a, b) => b.at - a.at)
  if (f === 'upcoming') L = L.filter(e => !e.to || e.to >= t || (e.from && e.from >= t))
  if (f === 'month') L = L.filter(e => (e.from && e.from >= ms) || dayOf(e.at) >= ms)
  if (q) L = L.filter(e => compact((e.name || '') + (e.loc || '') + (e.text || '') + (e.kind || '')).includes(q))
  const rows = []; let prev = null
  L.slice(0, cap).forEach(e => {
    const day = dayOf(e.at)
    if (day !== prev) { rows.push(<div className="logday" key={'d' + day}>{fmt(day)} 기록</div>); prev = day }
    rows.push(
      <button type="button" className="logit" key={e.id} onClick={() => openLogSheet(e.id)}>
        <span className="lw">{whenText(e)}</span>
        <span className="lt">
          <span className="row" style={{ gap: 6 }}>
            <b>{e.name || '—'}</b>
            {e.loc ? <span className="plate sm">{e.loc}</span> : null}
            <Badge size="xs">{e.kind}</Badge>
            {e.by === 'AI' && <Badge size="xs" variant="acc">AI</Badge>}
          </span>
          <span className="tx">{e.text}</span>
        </span>
        <span className="lat num">{fmtStamp(e.at, { hour: '2-digit', minute: '2-digit' })}</span>
      </button>,
    )
  })
  const more = L.length > cap || !sync.logDone
  const loadMore = async () => {
    if (L.length > cap) { setCap(c => c + 400); return }
    setBusy(true)
    try { await loadOlderLog(); setCap(c => c + 400) }
    catch { toast('이전 기록을 불러오지 못했어요. 인터넷 연결을 확인해 주세요.') }
    finally { setBusy(false) }
  }
  return (
    <>
      <div className="ohead">
        <div className="row">
          <Input type="search" placeholder="이름·동-호·내용 검색" value={UI.logQ || ''} onChange={e => setUI({ logQ: e.target.value })} style={{ flex: 1, minWidth: 0 }} aria-label="변경 기록 검색" />
          <Button size="sm" variant="primary" onClick={() => openLogSheet(null)}>+ 기록</Button>
        </div>
        <div className="chips">{LOG_FILTERS.map(([k, n]) => <Chip key={k} pressed={f === k} onClick={() => setUI({ logF: k })}>{n}</Chip>)}</div>
        <p className="hint">앱에서 바꾼 내용은 자동으로 남아요. 왼쪽은 해당 날짜, 오른쪽 위는 기록한 날이에요.</p>
      </div>
      {rows.length ? <div className="card loglist">{rows}</div> : <div className="card empty"><p>기록이 없어요.</p></div>}
      {more && (
        <div className="row" style={{ justifyContent: 'center', marginTop: 12 }}>
          <Button size="sm" disabled={busy} onClick={loadMore}>{busy ? '불러오는 중…' : '이전 기록 더 보기'}</Button>
        </div>
      )}
    </>
  )
}

/* ---------- 배달 완료 ---------- */
function DonePanel() {
  const month = UI.doneMonth || MONTH(); const [y, m] = month.split('-').map(Number)
  const archive = useMonthArchive(month)
  const t = TODAY(); const n = new Date(y, m, 0).getDate(); const rows = []
  if (!archive.status) {
    for (let k = n; k >= 1; k--) {
      const date = `${month}-${pad(k)}`; if (date > t) continue
      if (!S.perf.days[date] && !isDeliveryDay(date) && !S.orders.some(o => o.date === date && o.status === 'open')) continue
      const st = dayStatus(date); if (!st.n) continue
      const full = st.d === st.n
      rows.push(
        <button type="button" className="pr" key={date} onClick={() => openDoneDaySheet(date)}>
          <span className="num" style={{ minWidth: 76, fontWeight: 700 }}>{fmt(date)}</span>
          <Badge variant={full ? 'ok' : st.d ? 'warn' : 'default'}>{full ? '완료' : st.d ? '진행 중' : '체크 기록 없음'} {st.d}/{st.n}</Badge>
          <span className="its" style={{ color: 'var(--mute)', fontSize: 13 }}>제품 {st.qty}개{st.orders ? ` · 주문 있는 곳 ${st.orders}` : ''}{st.first ? ` · ${st.first}–${st.last}` : ''}</span>
          <span className="tot">{full && st.at ? hm(st.at) + ' 완료' : ''}</span>
        </button>,
      )
    }
  }
  return (
    <>
      <div className="ohead">
        <MonthNav month={month} onMove={d => setUI({ doneMonth: shiftMonth(month, d) })} sub="날짜를 누르면 그날 배달한 곳과 체크 시간이 보여요" />
        <ArchiveNote {...archive} />
      </div>
      {!archive.status && (
        <>
          <div className="card perflist">{rows.length ? rows : <div className="empty"><p>이 달 배달 기록이 없어요.</p></div>}</div>
          <p className="hint" style={{ marginTop: 8 }}>하루 배달을 모두 체크하면 그 시각이 완료 시간으로 남고, 변경 기록에도 “배달 완료”로 남아요.</p>
        </>
      )}
    </>
  )
}

export default function RecordsView() {
  useStore()
  const mode = UI.recMode || 'perf'
  return (
    <>
      <div className="sec-h" style={{ marginBottom: 12, flexWrap: 'wrap' }}>
        <h2 style={{ fontFamily: 'var(--f-display)', fontWeight: 400, fontSize: 24 }}>{mode === 'perf' ? '실적' : mode === 'done' ? '배달 완료' : '변경 기록'}</h2>
        <Seg className="w-auto flex-none" value={mode} onChange={m => setUI({ recMode: m }, true)}
          options={[['perf', '실적'], ['log', '변경 기록'], ['done', '배달 완료']]} />
      </div>
      {mode === 'perf' ? <PerfPanel /> : mode === 'done' ? <DonePanel /> : <LogPanel />}
    </>
  )
}
