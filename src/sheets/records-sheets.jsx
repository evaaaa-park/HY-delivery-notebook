// Sheets opened from the Records screen: one customer's month (실적), one day's completion record,
// and adding or editing a change-log entry.
import { S, UI, useStore, setUI } from '@/store/state'
import { save } from '@/store/sync'
import { TODAY, MONTH, fmt, hm, fmtStamp } from '@/lib/dates'
import { openSheet, closeSheet, SheetHead, SheetActions } from '@/lib/sheet'
import { toast } from '@/lib/toast'
import { useDraft } from '@/lib/hooks'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'
import { PDot, ProductName, Field } from '@/components/common'
import { LOG_KINDS, TYPE_NAME } from '@/domain/constants'
import { custById, pName, statusBadge, locShort } from '@/domain/model'
import { perfData, prodOrderIdx, dayStatus } from '@/domain/perf'
import { logChange } from '@/domain/log'
import { gotoRoute } from '@/shell/nav'
import { openCustSheet } from '@/sheets/customer-form'

// name × qty, plus the order type in words for anything that is not a regular delivery
function TypedQty({ pid, qty, ty }) {
  return (
    <span className="inline-flex items-center gap-0.5">
      <ProductName pid={pid} qty={qty} type={ty} />
      {ty !== 'regular' && <small className="muted">{TYPE_NAME[ty]}</small>}
    </span>
  )
}

/* ---------- 실적: one customer (or one-off delivery address) for the month ---------- */
export function openPerfSheet(key) {
  const month = UI.perfMonth || MONTH()
  if (!perfData(month, !!UI.perfFuture).get(key)) return
  openSheet(<PerfSheet stopKey={key} />)
}

function PerfSheet({ stopKey }) {
  useStore()
  const month = UI.perfMonth || MONTH()
  const r = perfData(month, !!UI.perfFuture).get(stopKey)
  if (!r) return <SheetHead title="실적" />
  const [y, m] = month.split('-').map(Number)
  const c = stopKey.startsWith('o:') ? null : custById(stopKey)
  const rows = Object.entries(r.prod).sort((a, b) => prodOrderIdx(a[0]) - prodOrderIdx(b[0]))
  return (
    <>
      <SheetHead title={r.name} />
      <div className="row">
        <span className="plate">{r.loc || '—'}</span>
        <span className="muted">{y}년 {m}월 · {UI.perfFuture ? '월말 예정 포함' : '오늘까지'} · 배달 {r.dates.length}회</span>
        {c && c.status !== 'active' && <Badge variant="bad">{statusBadge(c)}</Badge>}
      </div>
      <div className="card perfbig">
        {rows.map(([p, n]) => (
          <div className="pb" key={p}><PDot pid={p} /><span className="pn">{pName(p)}</span><b className="num">{n}</b></div>
        ))}
        <div className="pb tot"><span /><span className="pn">합계</span><b className="num">{r.total}</b></div>
      </div>
      <Field label="날짜별">
        <div className="brk">
          {r.dates.map(d => (
            <div key={d.date}>
              <span className="num" style={{ minWidth: 74 }}>{fmt(d.date)}</span>
              <span className="its">{d.items.map((i, k) => <TypedQty key={k} pid={i.pid} qty={i.qty} ty={i.ty} />)}</span>
              {d.est === 1 ? <Badge size="xs">추정</Badge> : d.est === 'plan' ? <Badge size="xs" variant="acc">예정</Badge> : null}
            </div>
          ))}
        </div>
      </Field>
      <SheetActions>
        <Button onClick={() => { closeSheet(); setUI({ recMode: 'log', logQ: r.name, logF: 'all' }, true) }}>변경 기록 보기</Button>
        {c && <Button onClick={() => { closeSheet(); openCustSheet(c.id) }}>고객 정보</Button>}
        <Button variant="primary" onClick={closeSheet}>닫기</Button>
      </SheetActions>
    </>
  )
}

/* ---------- 배달 완료: what was delivered on one day and when each stop was checked ---------- */
export function openDoneDaySheet(date) {
  openSheet(<DoneDaySheet date={date} />)
}

function DoneDaySheet({ date }) {
  useStore()
  const st = dayStatus(date)
  const seq = S.days[date]?.seq || S.config.baseSeq || []
  const idx = new Map(seq.map((k, i) => [k, i]))
  const list = st.entries.slice().sort((a, b) => (idx.has(a.key) ? idx.get(a.key) : 9999) - (idx.has(b.key) ? idx.get(b.key) : 9999))
  const full = st.d === st.n
  return (
    <>
      <SheetHead title={`${fmt(date)} 배달 기록`} />
      <div className="row">
        <Badge variant={full ? 'ok' : 'warn'}>{full ? '모두 완료' : '미완료'} {st.d}/{st.n}</Badge>
        <span className="muted">제품 {st.qty}개{st.at ? ' · ' + hm(st.at) + ' 완료' : ''}{st.first ? ` · 첫 체크 ${st.first}` : ''}</span>
      </div>
      <div className="card" style={{ display: 'grid' }}>
        {list.map((e, i) => {
          const ok = st.isDone(e.key)
          return (
            <div key={e.key} className="ritem" style={{ padding: '8px 12px', borderTop: i ? '1px solid var(--line)' : 0, alignItems: 'flex-start' }}>
              <span className="num" style={{ minWidth: 44, fontSize: 13, color: ok ? 'var(--ok)' : 'var(--mute)', fontWeight: 700 }}>{ok ? '✓ ' + (st.timeOf(e.key) || '') : '—'}</span>
              <span className="pn" style={{ whiteSpace: 'normal', overflow: 'visible' }}>
                <span className="plate sm">{e.loc || '—'}</span> <b>{e.name}</b>
                <span className="its" style={{ marginTop: 4 }}>{e.items.map((x, k) => <TypedQty key={k} pid={x.pid} qty={x.qty} ty={x.ty} />)}</span>
              </span>
            </div>
          )
        })}
      </div>
      <SheetActions>
        <Button onClick={() => { closeSheet(); gotoRoute(date) }}>배달 화면에서 보기</Button>
        <Button variant="primary" onClick={closeSheet}>닫기</Button>
      </SheetActions>
    </>
  )
}

/* ---------- 변경 기록: add or edit one entry ---------- */
export function openLogSheet(id) {
  openSheet(<LogSheet id={id || null} />)
}

function logDraft(e) {
  if (!e) return { cid: '', name: '', loc: '', from: TODAY(), to: TODAY(), kind: '기타', text: '' }
  const known = e.cid && custById(e.cid)
  return {
    cid: known ? e.cid : '',
    name: known ? '' : (e.name || ''),
    loc: known ? '' : (e.loc || ''),
    from: e.from || '',
    to: e.to && e.to < '2099' ? e.to : '',
    kind: e.kind || '기타',
    text: e.text || '',
  }
}

function LogSheet({ id }) {
  useStore()
  const e = id ? S.log.find(x => x.id === id) : null
  const [LF, refresh] = useDraft(() => logDraft(e))
  const set = patch => { Object.assign(LF, patch); refresh() }
  const customers = S.customers.slice().sort((a, b) => a.name.localeCompare(b.name, 'ko'))

  const saveLog = () => {
    const cid = LF.cid || null; const c = cid ? custById(cid) : null
    const text = (LF.text || '').trim()
    if (!text) { toast('내용을 입력해 주세요.'); return }
    const fields = { cid, name: c ? c.name : LF.name.trim(), loc: c ? locShort(c.loc) : LF.loc.trim(), from: LF.from || '', to: LF.to || '', kind: LF.kind, text }
    if (id) { const ent = S.log.find(x => x.id === id); if (ent) Object.assign(ent, fields) }
    else logChange({ ...fields, to: fields.to })
    save('log'); closeSheet(); toast('기록했어요')
  }
  const delLog = () => {
    const ent = S.log.find(x => x.id === id)
    S.log = S.log.filter(x => x.id !== id)
    save('log'); closeSheet()
    toast('기록을 지웠어요', () => { if (ent) { S.log.push(ent); S.log.sort((a, b) => b.at - a.at); save('log') } })
  }

  return (
    <>
      <SheetHead title={e ? '기록 고치기' : '기록 추가'} />
      <Field label="고객" htmlFor="lfC">
        <NativeSelect id="lfC" value={LF.cid} onChange={ev => set({ cid: ev.target.value })}>
          <NativeSelectOption value="">고객 목록에 없음 (직접 입력)</NativeSelectOption>
          {customers.map(c => <NativeSelectOption key={c.id} value={c.id}>{c.name} {locShort(c.loc)}</NativeSelectOption>)}
        </NativeSelect>
      </Field>
      <div className="grid2">
        <Input placeholder="이름 (목록에 없을 때)" value={LF.name} onChange={ev => set({ name: ev.target.value })} aria-label="이름" />
        <Input placeholder="동-호" value={LF.loc} onChange={ev => set({ loc: ev.target.value })} aria-label="동-호" />
      </div>
      <div className="grid2">
        <Field label="해당 날짜 (시작)" htmlFor="lfF"><Input type="date" id="lfF" value={LF.from} onChange={ev => set({ from: ev.target.value })} /></Field>
        <Field label="끝 (비우면 계속)" htmlFor="lfT"><Input type="date" id="lfT" value={LF.to} onChange={ev => set({ to: ev.target.value })} /></Field>
      </div>
      <Field label="종류" htmlFor="lfK">
        <NativeSelect id="lfK" value={LF.kind} onChange={ev => set({ kind: ev.target.value })}>
          {LOG_KINDS.map(k => <NativeSelectOption key={k} value={k}>{k}</NativeSelectOption>)}
        </NativeSelect>
      </Field>
      <Field label="내용" htmlFor="lfX">
        <Textarea id="lfX" placeholder="예: 10/14, 10/16 그릭드링크 미전달" value={LF.text} onChange={ev => set({ text: ev.target.value })} />
      </Field>
      {e && <p className="hint">기록한 때: {fmtStamp(e.at, {})}{e.by === 'AI' ? ' · AI가 기록' : ''}</p>}
      <SheetActions>
        {e && <Button variant="danger" onClick={delLog}>삭제</Button>}
        <Button onClick={closeSheet}>취소</Button>
        <Button variant="primary" onClick={saveLog}>저장</Button>
      </SheetActions>
    </>
  )
}
