// In-memory app state, shared by every screen.
//
// S holds the records exactly as the original single-file notebook did, so the domain logic in
// src/domain works on plain arrays and maps. Changes are written to Firestore by save() in
// store/sync.js; remote changes flow back in through snapshot listeners.
//
// React reads S/UI directly and re-renders when the store version changes (emit()).
import { useSyncExternalStore } from 'react'
import { normConfig } from '@/domain/normalize'

export const S = { customers: [], orders: [], config: normConfig({}), days: {}, log: [], perf: { days: {}, since: '' } }

const LS_UI = 'helio-delivery-ui'
export const UI = {
  tab: 'home', custQ: '', custF: 'all', selected: new Set(),
  routeDate: null, routeMode: 'list', hideDone: false, routeDense: true, mapB: null, scrollB: null,
  orderDate: null, openP: null,
  recMode: 'perf', perfMonth: null, perfFuture: false, perfQ: '', logQ: '', logF: 'all', doneMonth: null,
}
try {
  const u = JSON.parse(localStorage.getItem(LS_UI) || '{}')
  if (u.tab) UI.tab = u.tab
  if (u.routeMode) UI.routeMode = u.routeMode
  UI.hideDone = !!u.hideDone
  UI.routeDense = u.routeDense !== false
  if (u.recMode) UI.recMode = u.recMode
} catch { /* private mode: defaults */ }

export function saveUI() {
  try { localStorage.setItem(LS_UI, JSON.stringify({ tab: UI.tab, routeMode: UI.routeMode, hideDone: UI.hideDone, routeDense: UI.routeDense !== false, recMode: UI.recMode || 'perf' })) } catch { /* ignore */ }
}

let version = 0
const subs = new Set()
export function emit() { version++; subs.forEach(f => f()) }
let queued = false
export function scheduleEmit() {
  if (queued) return
  queued = true
  queueMicrotask(() => { queued = false; emit() })
}
const subscribe = cb => { subs.add(cb); return () => subs.delete(cb) }
const getVersion = () => version
// Re-render the calling component whenever S or UI changes.
export function useStore() { return useSyncExternalStore(subscribe, getVersion) }

export function setUI(patch, persist = false) {
  Object.assign(UI, patch)
  if (persist) saveUI()
  emit()
}
