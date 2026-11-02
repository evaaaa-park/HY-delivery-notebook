// The signed-in app: header, current screen, bottom tabs (phone) / side rail (iPad), floating order button.
import { useEffect, useRef } from 'react'
import { S, UI, useStore, emit } from '@/store/state'
import { sync, allLoaded, hasPending, onRemoteChange, save } from '@/store/sync'
import { TODAY, headerDate } from '@/lib/dates'
import { getTheme, applyTheme, THEME_NAME } from '@/lib/theme'
import { toast } from '@/lib/toast'
import { sheetOpen, closeSheet } from '@/lib/sheet'
import { Button } from '@/components/ui/button'
import { IconHome, IconUsers, IconOrder, IconRoute, IconRecords, IconSettings, IconPlus, IconAI, IconSun, IconMoon, IconAuto } from '@/components/icons'
import { ensureRouteOrder } from '@/domain/location'
import { orderTarget } from '@/domain/calendar'
import { sheetFor, confirmDiff } from '@/domain/stops'
import { maybeFreeze } from '@/domain/perf'
import { setTab } from './nav'
import { Splash } from './Gate'
import { openSyncSheet } from '@/sheets/sync-sheet'
import { openOrderSheet } from '@/sheets/order-form'
import { openAssistant } from '@/ai/assistant'
import HomeView from '@/views/HomeView'
import CustomersView, { BulkBar } from '@/views/CustomersView'
import OrderView from '@/views/OrderView'
import RouteView from '@/views/RouteView'
import RecordsView from '@/views/RecordsView'
import SettingsView from '@/views/SettingsView'

const VIEWS = { home: HomeView, customers: CustomersView, order: OrderView, route: RouteView, records: RecordsView, settings: SettingsView }
const TABS = [['home', '오늘', IconHome], ['customers', '고객', IconUsers], ['order', '발주', IconOrder], ['route', '배달', IconRoute], ['records', '실적', IconRecords]]
const THEME_ICON = { auto: IconAuto, light: IconSun, dark: IconMoon }

export function syncStatus() {
  const online = navigator.onLine !== false
  if (!sync.started || !allLoaded()) return { cls: '', txt: '불러오는 중' }
  if (sync.error === 'permission-denied') return { cls: 'err', txt: '권한 없음' }
  if (hasPending()) return { cls: 'saving', txt: online ? '저장 중' : '오프라인 · 연결되면 저장' }
  if (!online) return { cls: 'db', txt: '저장됨 · 오프라인' }
  return { cls: 'db', txt: '서버에 저장됨' }
}

function Header() {
  const st = syncStatus()
  const theme = getTheme()
  const ThemeIcon = THEME_ICON[theme]
  const cycleTheme = () => {
    const order = ['auto', 'light', 'dark']; const m = order[(order.indexOf(theme) + 1) % 3]
    applyTheme(m); toast(`화면: ${THEME_NAME[m]}${m === 'auto' ? ' (기기 설정 따라감)' : ''}`)
  }
  return (
    <header className="top"><div className="wrap">
      <div className="brand">
        <img src="/icons/logo-256.png" alt="" className="max-[420px]:hidden" />
        <div>헬리오 배달수첩<small>{headerDate()}</small></div>
      </div>
      <div className="sp" />
      <button type="button" className={'sync ' + st.cls} onClick={() => openSyncSheet()} aria-label="저장 상태 보기"><i /><span>{st.txt}</span></button>
      <Button size="icon" aria-label="AI 도우미" title="AI 도우미" onClick={() => openAssistant()}><IconAI /></Button>
      <Button size="icon" aria-label={`화면 모드: ${THEME_NAME[theme]} (눌러서 바꾸기)`} title={`화면: ${THEME_NAME[theme]}`} onClick={cycleTheme}><ThemeIcon /></Button>
      <Button size="icon" className="phone-only" aria-label="설정" onClick={() => setTab('settings')}><IconSettings /></Button>
    </div></header>
  )
}

function Nav() {
  const tgt = orderTarget()
  const diffs = [TODAY(), tgt].map(d => confirmDiff(d, sheetFor(d))).filter(x => x && x.length).length
  return (
    <nav className="nav" aria-label="화면"><div className="wrap">
      <button type="button" className="rail-only railnew" onClick={() => openOrderSheet({ customerIds: UI.tab === 'customers' ? [...UI.selected] : [] })}><IconPlus />주문</button>
      {TABS.map(([tab, label, Icon]) => (
        <button type="button" key={tab} aria-current={UI.tab === tab ? 'page' : 'false'} onClick={() => setTab(tab)}>
          <Icon />{label}{tab === 'order' && diffs > 0 && <span className="dot">{diffs}</span>}
        </button>
      ))}
      <button type="button" className="rail-only railset" aria-current={UI.tab === 'settings' ? 'page' : 'false'} onClick={() => setTab('settings')}><IconSettings />설정</button>
    </div></nav>
  )
}

function useLifecycle() {
  const lastDay = useRef(TODAY())
  useEffect(() => {
    let freezeT = null
    const soon = () => { clearTimeout(freezeT); freezeT = setTimeout(() => maybeFreeze(), 800) }
    const offRemote = onRemoteChange(name => {
      if ((name === 'customers' || name === 'orders') && ensureRouteOrder()) save('config')
      soon()
    })
    const rollover = () => {
      if (TODAY() !== lastDay.current) { lastDay.current = TODAY(); UI.routeDate = null; UI.orderDate = null; maybeFreeze(); emit() }
    }
    const tick = setInterval(rollover, 60000)
    const onVis = () => { if (document.visibilityState === 'visible') { rollover(); soon(); emit() } }
    const onNet = () => emit()
    document.addEventListener('visibilitychange', onVis)
    window.addEventListener('online', onNet)
    window.addEventListener('offline', onNet)
    // keyboard (iPad with keyboard): 1–5 screens · N new order · / customer search · Esc
    const onKey = e => {
      if (e.key === 'Escape') { if (!sheetOpen() && UI.selected.size) { UI.selected.clear(); emit() } return }
      if (e.metaKey || e.ctrlKey || e.altKey || e.isComposing) return
      if (e.target.closest?.('input,textarea,select,[contenteditable]') || sheetOpen()) return
      const tabs = { 1: 'home', 2: 'customers', 3: 'order', 4: 'route', 5: 'records' }
      if (tabs[e.key]) { e.preventDefault(); setTab(tabs[e.key]) }
      else if (e.key === 'n' || e.key === 'N' || e.key === 'ㅜ') { e.preventDefault(); openOrderSheet({}) }
      else if (e.key === '/') { e.preventDefault(); if (UI.tab !== 'customers') setTab('customers'); setTimeout(() => document.getElementById('custq')?.focus(), 50) }
    }
    window.addEventListener('keydown', onKey)
    return () => {
      offRemote(); clearInterval(tick); clearTimeout(freezeT)
      document.removeEventListener('visibilitychange', onVis)
      window.removeEventListener('online', onNet); window.removeEventListener('offline', onNet)
      window.removeEventListener('keydown', onKey)
    }
  }, [])
}

export default function Notebook() {
  useStore()
  useLifecycle()
  const ready = allLoaded()
  useEffect(() => {
    if (!ready) return
    if (ensureRouteOrder()) save('config')
    maybeFreeze()
  }, [ready])
  useEffect(() => () => closeSheet(), [])
  // the iPad side rail takes the left edge; sign-in/waiting screens have no rail and stay centred
  useEffect(() => {
    document.body.classList.add('with-rail')
    return () => document.body.classList.remove('with-rail')
  }, [])
  if (!ready) return <Splash text="수첩 불러오는 중" />
  const View = VIEWS[UI.tab] || HomeView
  const fabHidden = UI.tab === 'settings' || (UI.tab === 'customers' && UI.selected.size > 0)
  return (
    <>
      <Header />
      <main className="view"><div className="wrap">
        {sync.error === 'permission-denied' && <div className="banner">서버 저장 권한이 없어요. 승인이 풀렸는지 확인해 주세요. 바꾼 내용은 이 기기에만 남아 있어요.</div>}
        <View />
      </div></main>
      {!fabHidden && (
        <button type="button" className="fab" onClick={() => openOrderSheet({ customerIds: UI.tab === 'customers' ? [...UI.selected] : [] })}><IconPlus />주문</button>
      )}
      {UI.tab === 'customers' && <BulkBar />}
      <Nav />
    </>
  )
}

// keep S referenced for debugging in the console during development
if (import.meta.env.DEV) window.__S = S
