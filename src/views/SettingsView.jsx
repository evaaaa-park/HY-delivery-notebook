// 설정: screen, home-screen install, ordering rules, holidays, route order, entrances, products,
// users (approval), data (backup / restore / demo), account.
import { useEffect, useState } from 'react'
import { S, useStore } from '@/store/state'
import { save, exportAll, replaceAllData } from '@/store/sync'
import { session, signOut, signOutRisky, listenUsers, setUserStatus, isOwnerEmail } from '@/store/auth'
import { TODAY, fmt } from '@/lib/dates'
import { uid } from '@/lib/util'
import { getTheme, applyTheme, THEME_NAME } from '@/lib/theme'
import { toast } from '@/lib/toast'
import { confirmDialog } from '@/lib/confirm'
import { saveFile } from '@/lib/download'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar'
import { Seg, DayPick, Field, CheckRow, ProductImage } from '@/components/common'
import { IconDownload, IconUpload, IconLogout, IconTrash } from '@/components/icons'
import { orderTarget } from '@/domain/calendar'
import { bldName, isNumB } from '@/domain/location'
import { holPerf } from '@/domain/perf'
import { setTab } from '@/shell/nav'
import { loadDemo, clearDemo, hasDemo } from '@/demo/demo'

function Sec({ title, aside, children }) {
  return <div className="sec"><div className="sec-h"><h2>{title}</h2>{aside}</div>{children}</div>
}

function Screen() {
  const theme = getTheme()
  return (
    <Sec title="화면"><div className="card" style={{ padding: 12, display: 'grid', gap: 10 }}>
      <Seg value={theme} onChange={m => applyTheme(m)} options={['auto', 'light', 'dark'].map(m => [m, THEME_NAME[m]])} />
      <p className="hint">자동은 기기 설정(라이트·다크)을 따라가요. 위쪽 버튼으로도 바꿀 수 있고, 기기마다 따로 저장돼요.</p>
    </div></Sec>
  )
}

function Install() {
  return (
    <Sec title="iPad·iPhone 홈 화면에 추가"><div className="card" style={{ padding: 12, display: 'grid', gap: 6, fontSize: 14 }}>
      <div>1. Safari에서 <b>{location.host}</b>을 열어요.</div>
      <div>2. 공유 버튼 → <b>홈 화면에 추가</b> → 추가.</div>
      <div>3. 홈 화면의 배달수첩을 열고 Google로 한 번 로그인하면, 그다음부터는 인터넷이 없어도 열려요.</div>
      <p className="hint">인터넷이 없을 때 바꾼 내용은 기기에 저장됐다가 연결되면 자동으로 서버에 올라가요. 키보드 연결 시: 1–5 화면 이동 · N 주문 추가 · / 고객 검색 · Esc 닫기</p>
    </div></Sec>
  )
}

// The app shows only the level, never the model (the server maps level -> model).
const AI_LEVELS = [
  ['fast', '빠름·저렴', '답이 가장 빠르고 비용이 가장 적어요. 간단한 질문이나 짧은 변경에는 충분하지만, 복잡한 카톡 캡처나 비슷한 고객이 여럿일 때는 가끔 틀릴 수 있어요.'],
  ['balanced', '균형', '대부분의 변경을 정확하게 해요. 비용은 “가장 정확”의 절반쯤이에요.'],
  ['best', '가장 정확', '애매한 고객·날짜나 복잡한 캡처도 가장 잘 처리해요. 조금 느리고 비용이 가장 많아요.'],
]
function AiLevel() {
  const cur = S.config.aiTier || 'best'
  return (
    <Sec title="AI"><div className="card" style={{ padding: 12, display: 'grid', gap: 10 }}>
      <Seg value={cur} onChange={v => { S.config.aiTier = v; save('config'); toast(`AI: ${AI_LEVELS.find(l => l[0] === v)[1]}`) }} options={AI_LEVELS.map(([v, n]) => [v, n])} />
      <p className="hint">{AI_LEVELS.find(l => l[0] === cur)?.[2]}</p>
      <p className="hint">다음 메시지부터 바뀌고, 함께 쓰는 모든 기기에 똑같이 적용돼요. AI가 바꾼 내용은 대화에서 언제든 되돌릴 수 있어요.</p>
    </div></Sec>
  )
}

function OrderRules() {
  const C = S.config
  const set = (k, v) => { C[k] = v; save('config') }
  return (
    <>
      <Sec title="발주 기준"><div className="card" style={{ padding: 12, display: 'grid', gap: 12 }}>
        <div className="grid2">
          <Field label="며칠 전에 발주" htmlFor="leadDays">
            <Input id="leadDays" type="number" inputMode="numeric" min={0} max={7} value={C.leadDays}
              onChange={e => set('leadDays', Math.max(0, Math.min(7, Math.round(+e.target.value || 0))))} />
          </Field>
          <Field label="세는 방법"><Seg value={C.leadMode} onChange={m => set('leadMode', m)} options={[['business', '평일만'], ['calendar', '달력 날짜']]} /></Field>
        </div>
        <p className="hint">지금 설정: {C.leadMode === 'business' ? `평일 기준 ${C.leadDays}일 전. 금요일에 화요일분, 월요일에 수요일분을 발주해요.` : `달력 기준 ${C.leadDays}일 전. 수요일에 금요일분을 발주해요.`} 오늘 기준 발주 날짜: {fmt(orderTarget())}</p>
        <Field label="배달 요일"><DayPick value={C.deliveryDays} onChange={v => set('deliveryDays', v)} /></Field>
        <Field label="같은 동 안에서"><Seg value={C.floorDir} onChange={m => set('floorDir', m)} options={[['desc', '위층부터 내려오기'], ['asc', '아래층부터']]} /></Field>
      </div></Sec>
      <Sec title="발주에 포함할 주문"><div className="card">
        {[['regular', '후불정기 (고객 정기)', 'hy 정기(애음) 계약 수량. 보통 켜 둬요'], ['prepaid', '(선불)정기 · 프레딧', '프레딧 자동 발주라 보통 꺼 둬요'], ['fredit', '일반주문 · 프레딧', '프레딧 자동 발주라 보통 꺼 둬요'], ['sample', '견본주문', '끄면 “지점에서 견본 받아오기” 목록에만 떠요'], ['adhoc', '추가주문 (직접 받음)', '직접 발주할 거면 켜요']].map(([k, n, d]) => (
          <CheckRow key={k} checked={C.purchase[k]} onChange={v => { C.purchase[k] = v; save('config') }} title={n} sub={d} />
        ))}
      </div></Sec>
    </>
  )
}

function Holidays() {
  const [date, setDate] = useState(''); const [name, setName] = useState(''); const [mode, setMode] = useState('partial')
  const C = S.config
  const add = () => {
    if (!date) { toast('날짜를 골라 주세요.'); return }
    C.holidays = C.holidays.filter(h => h.date !== date)
    C.holidays.push({ date, name: name.trim() || (mode === 'full' ? '휴무' : '공휴일'), mode })
    save('config'); holPerf(date); setDate(''); setName('')
    toast(mode === 'full' ? `${fmt(date)} 전체 휴무: 정기 배달과 발주에서 빠져요` : `${fmt(date)} 공휴일: 상가·주민센터·미화/관리만 빠져요`)
  }
  const del = d => { C.holidays = C.holidays.filter(h => h.date !== d); save('config'); holPerf(d) }
  return (
    <Sec title="휴무일"><div className="card">
      <div className="slist">{C.holidays.slice().sort((a, b) => a.date.localeCompare(b.date)).map(h => (
        <div className="it" key={h.date}><div className="t"><b>{fmt(h.date)}</b> {h.name} <Badge size="xs">{h.mode === 'partial' ? '공휴일 · 일부만 쉼' : '전체 휴무'}</Badge></div><Button size="sm" variant="ghost" onClick={() => del(h.date)}>삭제</Button></div>
      ))}{!C.holidays.length && <div className="it muted">등록된 휴무일이 없어요.</div>}</div>
      <div style={{ padding: 10, borderTop: '1px solid var(--line)', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        <Input type="date" value={date} onChange={e => setDate(e.target.value)} aria-label="날짜" />
        <Input value={name} onChange={e => setName(e.target.value)} placeholder="이름 (예: 한글날)" aria-label="이름" />
        <NativeSelect value={mode} onChange={e => setMode(e.target.value)} aria-label="종류">
          <NativeSelectOption value="partial">공휴일 · 상가·주민센터·미화/관리만 쉼</NativeSelectOption>
          <NativeSelectOption value="full">전체 휴무 · 모두 쉼</NativeSelectOption>
        </NativeSelect>
        <Button onClick={add}>추가</Button>
      </div>
      <p className="hint" style={{ padding: '0 12px 10px' }}>공휴일에는 고객 정보에서 “공휴일엔 쉼”이 켜진 곳(상가·주민센터·미화/관리)만 빠져요.</p>
    </div></Sec>
  )
}

function RouteOrder() {
  const [nb, setNb] = useState('')
  const C = S.config; const L = C.routeOrder
  const move = (i, d) => { const j = i + d; if (j < 0 || j >= L.length) return; [L[i], L[j]] = [L[j], L[i]]; save('config') }
  const add = () => { const v = nb.trim().replace(/동$/, ''); if (!v) return; if (!L.includes(v)) L.push(v); setNb(''); save('config') }
  return (
    <div className="sec">
      <div className="sec-h"><h2>기본 동선 순서</h2><span className="muted" style={{ fontSize: 12.5 }}>위에서부터 돌아요</span></div>
      <div className="card">
        <div className="slist">{L.map((b, i) => (
          <div className="it" key={b + i}>
            <span className="seq" style={{ display: 'grid', placeItems: 'center' }}>{i + 1}</span>
            <div className="t"><b>{bldName(b)}</b>{!isNumB(b) && <span className="muted" style={{ fontSize: 12 }}> {b}</span>}</div>
            <Button size="icon-sm" variant="plain" aria-label="위로" disabled={!i} onClick={() => move(i, -1)}>▲</Button>
            <Button size="icon-sm" variant="plain" aria-label="아래로" disabled={i === L.length - 1} onClick={() => move(i, 1)}>▼</Button>
            <Button size="icon-sm" variant="plain" aria-label="삭제" onClick={() => { L.splice(i, 1); save('config') }}>✕</Button>
          </div>
        ))}</div>
        <div style={{ padding: 10, borderTop: '1px solid var(--line)', display: 'grid', gridTemplateColumns: '1fr auto', gap: 8 }}>
          <Input value={nb} onChange={e => setNb(e.target.value)} placeholder="동 번호나 장소 (예: 206, 상가A)" aria-label="추가할 동" onKeyDown={e => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) add() }} />
          <Button onClick={add}>추가</Button>
        </div>
      </div>
      <p className="hint">고객 위치의 “동” 값과 같은 이름으로 맞춰요. 목록에 없는 동은 가까운 번호 옆에 자동으로 들어가요. 매일 순서는 배달 화면에서 끌어서 바꿀 수 있어요.
        {C.baseSeq && <> <Button size="sm" onClick={() => { C.baseSeq = null; save('config'); toast('기본 동선을 지웠어요. 동 순서대로 자동 정렬돼요.') }}>저장한 기본 동선 지우기</Button></>}</p>
    </div>
  )
}

function Entrances() {
  const [b, setB] = useState(''); const [g, setG] = useState('')
  const C = S.config
  const add = () => {
    const bb = b.trim().replace(/동$/, ''); const raw = g.trim()
    if (!bb || !raw) { toast('동과 호 묶음을 입력해 주세요. 예: 209 / 1,2,3 / 4,5,6'); return }
    const groups = raw.split('/').map(x => x.split(/[,·\s]+/).flatMap(t => { const m = t.match(/^(\d+)-(\d+)$/); if (m) { const out = []; for (let i = +m[1]; i <= +m[2]; i++) out.push(i); return out } return [+t] }).filter(n => n > 0)).filter(x => x.length)
    if (!groups.length) { toast('호 묶음을 읽지 못했어요. 예: 1,2 / 3,4,5'); return }
    C.entrances[bb] = groups; save('config'); setB(''); setG('')
    toast(`${bldName(bb)} 출입구: ${groups.map(x => x.join('·') + '호').join(' / ')}`)
  }
  return (
    <div className="sec">
      <div className="sec-h"><h2>출입구 나누기</h2></div>
      <div className="card">
        <div className="slist">{Object.keys(C.entrances).length ? Object.entries(C.entrances).map(([bb, gs]) => (
          <div className="it" key={bb}><div className="t"><b>{bldName(bb)}</b> {gs.map(x => x.join('·') + '호').join(' / ')}</div><Button size="sm" variant="ghost" onClick={() => { delete C.entrances[bb]; save('config') }}>삭제</Button></div>
        )) : <div className="it muted">따로 정한 동이 없어요. 모든 동을 1·2호 / 3·4호 입구로 나누고, 5호 이상이 있으면 3·4·5호로 묶어요.</div>}</div>
        <div style={{ padding: 10, borderTop: '1px solid var(--line)', display: 'grid', gridTemplateColumns: '96px 1fr auto', gap: 8 }}>
          <Input value={b} onChange={e => setB(e.target.value)} placeholder="동 (209)" aria-label="동" />
          <Input value={g} onChange={e => setG(e.target.value)} placeholder="1,2,3 / 4,5,6" aria-label="호 묶음" />
          <Button onClick={add}>저장</Button>
        </div>
      </div>
      <p className="hint">“/”로 입구를 나눠요. 입구가 하나뿐인 동은 “1,2,3,4”처럼 한 묶음으로 적어요.</p>
    </div>
  )
}

function Products() {
  const C = S.config
  const edit = (i, f, v) => { const p = C.products[i]; if (!p) return; p[f] = v.trim() || p[f]; save('config') }
  const del = i => {
    const p = C.products[i]; if (!p) return
    const used = S.customers.some(c => c.regular.some(r => r.productId === p.id)) || S.orders.some(o => o.status === 'open' && o.date >= TODAY() && o.items.some(it => it.productId === p.id))
    if (used) { toast(`${p.name}은(는) 고객이나 주문에 쓰이고 있어서 지울 수 없어요.`); return }
    C.products.splice(i, 1); save('config')
  }
  return (
    <div className="sec">
      <div className="sec-h"><h2>제품</h2><span className="muted" style={{ fontSize: 12.5 }}>배달표 이름 · 줄임말 · 출고신청 이름</span></div>
      <div className="card">
        {C.products.map((p, i) => (
          <div className="prodedit" key={p.id}>
            <ProductImage pid={p.id} size={36} />
            <Input defaultValue={p.name} onBlur={e => edit(i, 'name', e.target.value)} aria-label="배달표 이름" />
            <Input defaultValue={p.short} onBlur={e => edit(i, 'short', e.target.value)} aria-label="줄임말" />
            <Input className="on" defaultValue={p.orderName} onBlur={e => edit(i, 'orderName', e.target.value)} aria-label="출고신청 이름" />
            <Button className="del" size="icon-sm" variant="plain" aria-label={`${p.name} 삭제`} onClick={() => del(i)}>✕</Button>
          </div>
        ))}
        <div style={{ padding: 10, borderTop: '1px solid var(--line)' }}>
          <Button onClick={() => { C.products.push({ id: uid('p_'), name: '새 제품', short: '새 제품', orderName: '새 제품', cat: '기타(Fredit 등)', hue: Math.floor(Math.random() * 360) }); save('config') }}>+ 제품 추가</Button>
        </div>
      </div>
      <p className="hint">사진이 없는 제품은 색 칸에 이름 앞글자로 보여요. 새 제품 사진은 개발자가 앱에 넣어요.</p>
    </div>
  )
}

const ST_NAME = { pending: '승인 대기', approved: '승인됨', rejected: '거절됨' }
function Users() {
  const [users, setUsers] = useState(null)
  useEffect(() => listenUsers(setUsers), [])
  const me = session.user?.uid
  const decide = async (u, status) => {
    try { await setUserStatus(u.id, status); toast(`${u.name || u.email}: ${ST_NAME[status]}`) }
    catch { toast('바꾸지 못했어요. 인터넷 연결을 확인해 주세요.') }
  }
  const order = { pending: 0, approved: 1, rejected: 2 }
  const list = (users || []).slice().sort((a, b) => (order[a.status] ?? 3) - (order[b.status] ?? 3) || String(a.email).localeCompare(String(b.email)))
  return (
    <Sec title="사용자" aside={<span className="muted" style={{ fontSize: 12.5 }}>승인된 사람만 수첩을 볼 수 있어요</span>}>
      <div className="card slist">
        {users === null && <div className="it muted">불러오는 중…</div>}
        {users && !list.length && <div className="it muted">사용자가 없어요.</div>}
        {list.map(u => {
          const owner = isOwnerEmail(u.email)
          return (
            <div className="it" key={u.id}>
              <Avatar className="size-8"><AvatarImage src={u.photo} alt="" /><AvatarFallback>{(u.name || u.email || '?').slice(0, 1)}</AvatarFallback></Avatar>
              <div className="t"><b>{u.name || '이름 없음'}</b>{u.id === me && <span className="muted"> (나)</span>}<div className="muted" style={{ fontSize: 12.5, overflowWrap: 'anywhere' }}>{u.email}</div></div>
              <Badge variant={u.status === 'approved' ? 'ok' : u.status === 'pending' ? 'warn' : 'bad'}>{owner ? '관리자' : ST_NAME[u.status] || u.status}</Badge>
              {!owner && u.id !== me && (u.status === 'approved'
                ? <Button size="sm" variant="ghost" onClick={() => decide(u, 'rejected')}>승인 해제</Button>
                : <><Button size="sm" variant="primary" onClick={() => decide(u, 'approved')}>승인</Button>{u.status === 'pending' && <Button size="sm" variant="ghost" onClick={() => decide(u, 'rejected')}>거절</Button>}</>)}
            </div>
          )
        })}
      </div>
      <p className="hint">새로 로그인한 사람은 “승인 대기”로 들어와요. 승인된 사람은 모두 같은 권한이에요.</p>
    </Sec>
  )
}

function Data() {
  const [busy, setBusy] = useState('')
  const backup = async () => {
    setBusy('백업 만드는 중')
    try {
      const data = await exportAll()
      const name = `헬리오배달수첩-${TODAY()}.json`
      await saveFile(name, new Blob([JSON.stringify(data, null, 1)], { type: 'application/json' }))
      if (!data.complete) toast('인터넷이 없어서 이 기기에 있는 데이터만 백업했어요.')
    } catch { toast('백업 파일을 만들지 못했어요.') }
    finally { setBusy('') }
  }
  const restore = file => {
    if (!file) return
    const rd = new FileReader()
    rd.onload = async () => {
      let o
      try { o = JSON.parse(rd.result); if (!o || !Array.isArray(o.customers)) throw new Error('bad') }
      catch { toast('이 파일은 헬리오 배달수첩 백업이 아니에요.'); return }
      const ok = await confirmDialog({ title: '백업 불러오기', body: `지금 서버의 데이터를 모두 지우고 이 백업(고객 ${o.customers.length}명, 주문 ${(o.orders || []).length}건, 기록 ${(o.log || []).length}건)으로 바꿔요. 인터넷이 연결되어 있어야 해요.`, yes: '모두 바꾸기' })
      if (!ok) return
      if (!navigator.onLine) { toast('인터넷이 연결되어 있을 때 다시 해 주세요.'); return }
      setBusy('불러오는 중')
      try { const n = await replaceAllData(o, s => setBusy(s)); toast(`백업을 불러왔어요 (${n}건 저장)`); setTab('home') }
      catch { toast('불러오지 못했어요. 인터넷 연결을 확인하고 다시 해 주세요.') }
      finally { setBusy('') }
    }
    rd.readAsText(file)
  }
  const demo = async () => {
    const ok = await confirmDialog({ title: '예시 데이터 넣기', body: '가짜 고객 60여 명과 주문·기록을 넣어서 앱을 둘러볼 수 있게 해요. 모두 “예시” 표시가 붙고, 나중에 한 번에 지울 수 있어요.', yes: '넣기', danger: false })
    if (ok) { const n = loadDemo(); toast(`예시 고객 ${n}명을 넣었어요`); setTab('home') }
  }
  const clear = async () => {
    const ok = await confirmDialog({ title: '예시 데이터 지우기', body: '“예시” 표시가 있는 고객과 주문, 그 기록과 실적만 지워요. 직접 넣은 데이터는 그대로예요.', yes: '지우기' })
    if (ok) { clearDemo(); toast('예시 데이터를 지웠어요') }
  }
  return (
    <Sec title="데이터"><div className="card" style={{ padding: 12, display: 'grid', gap: 10 }}>
      <p className="hint">서버(Firebase)에 저장되고, 이 기기에도 사본이 있어서 인터넷 없이도 열려요. 지난 기록은 지우지 않고 모두 남겨요. 고객 {S.customers.length}명 · 최근 주문 {S.orders.length}건</p>
      <div className="row">
        <Button disabled={!!busy} onClick={backup}><IconDownload />백업 파일 저장</Button>
        <Button asChild disabled={!!busy}><label className="cursor-pointer"><IconUpload />백업 불러오기<input type="file" accept=".json,application/json" hidden onChange={e => { restore(e.target.files?.[0]); e.target.value = '' }} /></label></Button>
      </div>
      <div className="row">
        {hasDemo()
          ? <Button variant="danger" onClick={clear}><IconTrash />예시 데이터 지우기</Button>
          : <Button onClick={demo}>예시 데이터 넣기</Button>}
      </div>
      {busy && <p className="hint">{busy}…</p>}
    </div></Sec>
  )
}

function Account() {
  const u = session.user
  const out = async () => {
    if (signOutRisky()) {
      const ok = await confirmDialog({ title: '로그아웃', body: '아직 서버에 안 올라간 변경이 있어요. 인터넷에 연결해서 저장된 뒤에 로그아웃하는 게 안전해요.', yes: '그래도 로그아웃' })
      if (!ok) return
    }
    await signOut()
  }
  return (
    <Sec title="계정"><div className="card slist">
      <div className="it">
        <Avatar className="size-8"><AvatarImage src={u?.photoURL} alt="" /><AvatarFallback>{(u?.displayName || u?.email || '?').slice(0, 1)}</AvatarFallback></Avatar>
        <div className="t"><b>{u?.displayName || '이름 없음'}</b><div className="muted" style={{ fontSize: 12.5 }}>{u?.email}</div></div>
        <Button size="sm" onClick={out}><IconLogout />로그아웃</Button>
      </div>
    </div></Sec>
  )
}

export default function SettingsView() {
  useStore()
  return (
    <>
      <div className="sec-h" style={{ marginBottom: 14 }}><h2 className="page-h">설정</h2><Button size="sm" onClick={() => setTab('home')}>닫기</Button></div>
      <Screen />
      <Install />
      <AiLevel />
      <OrderRules />
      <Holidays />
      <RouteOrder />
      <Entrances />
      <Products />
      <Users />
      <Data />
      <Account />
      <p className="hint" style={{ textAlign: 'center' }}>헬리오 배달수첩 · 오늘(한국 시간) {fmt(TODAY())}</p>
    </>
  )
}
