// Firestore sync for the notebook's records.
//
// Storage layout (one document per record, so edits on two devices only collide on the same record):
//   customers/{id}   orders/{id}   days/{YYYY-MM-DD}   log/{id}   perf/{YYYY-MM-DD}   settings/main
//
// Write path: domain code mutates S, then calls save('customers', 'log', ...). save() compares each record
// with the last version known from Firestore and writes only what changed (deep field merge, so two devices
// changing different fields of one record both keep their change). Writes go to the offline cache first
// and are sent when a connection is available.
//
// Read path: snapshot listeners keep S in sync with other devices. Big collections are windowed:
// orders/days from 62 days ago, perf from 100 days ago, the newest log entries. Nothing is ever pruned on
// the server; older history is loaded on demand (ensurePerfMonth, loadOlderLog).
import {
  collection, doc, onSnapshot, query, where, orderBy, limit, documentId, writeBatch, deleteField,
  getDocs, getDocsFromServer, startAfter, disableNetwork, enableNetwork,
} from 'firebase/firestore'
import { db } from '@/firebase'
import { S, emit, scheduleEmit } from './state'
import { normCust, normOrder, normConfig, entrancesForStore } from '@/domain/normalize'
import { TODAY, addDays } from '@/lib/dates'
import { stable } from '@/lib/util'

const COL = { customers: 'customers', orders: 'orders', days: 'days', log: 'log', perf: 'perf', config: 'settings' }
export const NAMES = Object.keys(COL)
const ORDER_DAYS = 62, PERF_DAYS = 100, LOG_LIMIT = 600

// last version of each record as stored in Firestore (normalized, plain JSON): name -> Map(id -> object)
const known = Object.fromEntries(NAMES.map(n => [n, new Map()]))
const windowStart = { orders: '', days: '', perf: '' }
const unsubs = []
const remoteListeners = new Set()

export const sync = {
  started: false,
  loaded: {},       // name -> got at least one snapshot (cache or server)
  server: {},       // name -> got a snapshot from the server this session
  pending: {},      // name -> listener reports local writes not yet on the server
  commits: 0,       // batches sent and not yet acknowledged
  error: '',
  lastAck: (() => { try { return +localStorage.getItem('helio-last-ack') || 0 } catch { return 0 } })(),
  logDone: false,   // no older log entries left on the server
  perfMonths: new Set(),
}

const toPlain = o => JSON.parse(JSON.stringify(o ?? null))
const isMap = v => v !== null && typeof v === 'object' && !Array.isArray(v)

// The stored shape of a record, given what is in S.
function storeShape(name, obj) {
  if (name === 'config') return toPlain({ ...obj, entrances: entrancesForStore(obj.entrances), perfSince: S.perf.since || '' })
  return toPlain(obj)
}
function entities(name) {
  switch (name) {
    case 'customers': return S.customers.map(c => [c.id, c])
    case 'orders': return S.orders.map(o => [o.id, o])
    case 'days': return Object.entries(S.days)
    case 'log': return S.log.map(e => [e.id, e])
    case 'perf': return Object.entries(S.perf.days)
    case 'config': return [['main', S.config]]
    default: return []
  }
}
// Put a record that came from Firestore into S. Returns its normalized stored shape.
function applyDoc(name, id, data) {
  switch (name) {
    case 'customers': { const c = normCust({ ...data, id }); const i = S.customers.findIndex(x => x.id === id); if (i >= 0) S.customers[i] = c; else S.customers.push(c); return storeShape(name, c) }
    case 'orders': { const o = normOrder({ ...data, id }); const i = S.orders.findIndex(x => x.id === id); if (i >= 0) S.orders[i] = o; else S.orders.push(o); return storeShape(name, o) }
    case 'days': S.days[id] = data; return toPlain(data)
    case 'log': { const e = { ...data, id }; const i = S.log.findIndex(x => x.id === id); if (i >= 0) S.log[i] = e; else S.log.push(e); return toPlain(e) }
    case 'perf': S.perf.days[id] = data; return toPlain(data)
    case 'config': if (id !== 'main') return null; S.perf.since = data.perfSince || ''; S.config = normConfig(data); return storeShape(name, S.config)
  }
  return null
}
function removeDoc(name, id) {
  switch (name) {
    case 'customers': S.customers = S.customers.filter(x => x.id !== id); break
    case 'orders': S.orders = S.orders.filter(x => x.id !== id); break
    case 'days': delete S.days[id]; break
    case 'log': S.log = S.log.filter(x => x.id !== id); break
    case 'perf': delete S.perf.days[id]; break
    case 'config': if (id === 'main') { S.config = normConfig({}); S.perf.since = '' } break
  }
}
// What would the record look like after normalization, without touching S (to skip echoes of our own writes).
function normalizedShape(name, id, data) {
  switch (name) {
    case 'customers': return storeShape(name, normCust({ ...data, id }))
    case 'orders': return storeShape(name, normOrder({ ...data, id }))
    case 'config': return id === 'main' ? toPlain({ ...normConfig(data), entrances: entrancesForStore(normConfig(data).entrances), perfSince: data.perfSince || '' }) : null
    case 'log': return toPlain({ ...data, id })
    default: return toPlain(data)
  }
}

// Field-level difference between two stored versions, as a nested patch for set(..., { merge: true }).
// Removed keys become deleteField(); arrays and other values are replaced whole.
function diffPatch(a, b) {
  let out = null
  for (const k of Object.keys(b)) {
    const av = a[k], bv = b[k]
    if (isMap(av) && isMap(bv)) { const p = diffPatch(av, bv); if (p) (out ||= {})[k] = p }
    else if (stable(av) !== stable(bv)) (out ||= {})[k] = bv
  }
  for (const k of Object.keys(a)) if (!(k in b)) (out ||= {})[k] = deleteField()
  return out
}

/* ---------------- write ---------------- */
export function save(...names) {
  const set = new Set(names.filter(n => COL[n]))
  if (set.has('perf')) set.add('config') // perf.since is kept in settings/main
  if (!sync.started) { emit(); return }
  const ops = []
  for (const name of set) {
    const kn = known[name]; const seen = new Set()
    for (const [id, obj] of entities(name)) {
      seen.add(id)
      const plain = storeShape(name, obj)
      const prev = kn.get(id)
      if (prev === undefined) ops.push({ t: 'set', name, id, data: plain })
      else { const patch = diffPatch(prev, plain); if (patch) ops.push({ t: 'merge', name, id, data: patch }) }
      kn.set(id, plain)
    }
    for (const id of [...kn.keys()]) if (!seen.has(id)) { ops.push({ t: 'del', name, id }); kn.delete(id) }
  }
  commitOps(ops)
  emit()
}

let errorHandler = null
export const onSaveError = fn => { errorHandler = fn }

function commitOps(ops) {
  for (let i = 0; i < ops.length; i += 450) {
    const batch = writeBatch(db)
    for (const op of ops.slice(i, i + 450)) {
      const ref = doc(db, COL[op.name], op.id)
      if (op.t === 'set') batch.set(ref, op.data)
      else if (op.t === 'merge') batch.set(ref, op.data, { merge: true })
      else batch.delete(ref)
    }
    sync.commits++
    // resolves when the server has the write; offline it waits (the write is already in the local cache)
    batch.commit().then(() => {
      sync.lastAck = Date.now(); sync.error = ''
      try { localStorage.setItem('helio-last-ack', String(sync.lastAck)) } catch { /* ignore */ }
    }, err => {
      sync.error = err?.code || 'error'
      errorHandler?.(err)
    }).finally(() => { sync.commits--; scheduleEmit() })
  }
}

/* ---------------- read ---------------- */
function listen(name, q) {
  const un = onSnapshot(q, { includeMetadataChanges: true }, snap => {
    let touched = false
    for (const ch of snap.docChanges()) {
      const id = ch.doc.id
      if (ch.type === 'removed') { removeDoc(name, id); known[name].delete(id); touched = true; continue }
      const data = ch.doc.data()
      const kn = known[name].get(id)
      if (kn !== undefined && stable(kn) === stable(normalizedShape(name, id, data))) continue // our own write
      const shape = applyDoc(name, id, data)
      if (shape) known[name].set(id, shape)
      touched = true
    }
    sync.loaded[name] = true
    if (!snap.metadata.fromCache) sync.server[name] = true
    sync.pending[name] = snap.metadata.hasPendingWrites
    if (name === 'log' && touched) S.log.sort((a, b) => b.at - a.at)
    scheduleEmit()
    if (touched) remoteListeners.forEach(fn => fn(name))
  }, err => {
    sync.error = err?.code || 'error'
    sync.loaded[name] = true
    scheduleEmit()
  })
  unsubs.push(un)
}

export function startSync() {
  if (sync.started) return
  sync.started = true
  const today = TODAY()
  windowStart.orders = addDays(today, -ORDER_DAYS)
  windowStart.days = addDays(today, -ORDER_DAYS)
  windowStart.perf = addDays(today, -PERF_DAYS)
  listen('customers', collection(db, COL.customers))
  listen('config', collection(db, COL.config))
  listen('orders', query(collection(db, COL.orders), where('date', '>=', windowStart.orders)))
  listen('days', query(collection(db, COL.days), where(documentId(), '>=', windowStart.days)))
  listen('perf', query(collection(db, COL.perf), where(documentId(), '>=', windowStart.perf)))
  listen('log', query(collection(db, COL.log), orderBy('at', 'desc'), limit(LOG_LIMIT)))
}

export function stopSync() {
  unsubs.splice(0).forEach(u => { try { u() } catch { /* ignore */ } })
  sync.started = false
  sync.loaded = {}; sync.server = {}; sync.pending = {}
  NAMES.forEach(n => known[n].clear())
  S.customers = []; S.orders = []; S.days = {}; S.log = []; S.perf = { days: {}, since: '' }; S.config = normConfig({})
  emit()
}

export const onRemoteChange = fn => { remoteListeners.add(fn); return () => remoteListeners.delete(fn) }
export const allLoaded = () => NAMES.every(n => sync.loaded[n])
// freezing past days needs the whole picture from the server, not a possibly stale cache
export const freezeReady = () => sync.started && NAMES.every(n => sync.server[n])
export const perfWindowStart = () => windowStart.perf || addDays(TODAY(), -PERF_DAYS)
export const hasPending = () => sync.commits > 0 || Object.values(sync.pending).some(Boolean)
export const pendingNames = () => NAMES.filter(n => sync.pending[n])

// Load 실적 snapshots of a month older than the live window.
export async function ensurePerfMonth(month) {
  const from = month + '-01', to = month + '-32'
  if (from >= perfWindowStart() || sync.perfMonths.has(month)) return
  const end = to < perfWindowStart() ? to : perfWindowStart()
  const q = query(collection(db, COL.perf), where(documentId(), '>=', from), where(documentId(), '<', end))
  let snap, complete = true
  try { snap = await getDocsFromServer(q) } catch { snap = await getDocs(q); complete = false } // offline: show what the cache has
  snap.forEach(d => { if (!S.perf.days[d.id]) { S.perf.days[d.id] = d.data(); known.perf.set(d.id, toPlain(d.data())) } })
  if (complete) sync.perfMonths.add(month) // only a server answer counts as loaded; offline it is tried again later
  emit()
}

// Load the next page of older change-log entries.
export async function loadOlderLog(n = 500) {
  const oldest = S.log.reduce((m, e) => Math.min(m, e.at || Infinity), Infinity)
  if (!isFinite(oldest)) { sync.logDone = true; emit(); return 0 }
  const snap = await getDocs(query(collection(db, COL.log), orderBy('at', 'desc'), startAfter(oldest), limit(n)))
  let added = 0
  snap.forEach(d => { if (!S.log.some(e => e.id === d.id)) { const e = { ...d.data(), id: d.id }; S.log.push(e); known.log.set(d.id, toPlain(e)); added++ } })
  S.log.sort((a, b) => b.at - a.at)
  if (snap.size < n) sync.logDone = true
  emit()
  return added
}

// Force a reconnect (the "지금 다시 저장" button).
export async function reconnect() {
  try { await disableNetwork(db) } catch { /* ignore */ }
  try { await enableNetwork(db) } catch { /* ignore */ }
}

// Full backup in the original notebook's format ({ customers, orders, config, days, log, perf }), read from
// the server so it includes history outside the live window. Offline it falls back to what is on the device.
export async function exportAll() {
  const out = { app: 'helio-delivery-notebook', v: 2, exportedAt: new Date().toISOString(), complete: true }
  try {
    const get = async name => (await getDocsFromServer(collection(db, COL[name]))).docs
    const [cs, os, ds, ls, ps, ss] = await Promise.all(['customers', 'orders', 'days', 'log', 'perf', 'config'].map(get))
    out.customers = cs.map(d => normCust({ ...d.data(), id: d.id }))
    out.orders = os.map(d => normOrder({ ...d.data(), id: d.id }))
    out.days = Object.fromEntries(ds.map(d => [d.id, d.data()]))
    out.log = ls.map(d => ({ ...d.data(), id: d.id })).sort((a, b) => b.at - a.at)
    const main = ss.find(d => d.id === 'main')?.data() || {}
    out.perf = { days: Object.fromEntries(ps.map(d => [d.id, d.data()])), since: main.perfSince || '' }
    out.config = normConfig(main)
  } catch {
    Object.assign(out, JSON.parse(JSON.stringify({ customers: S.customers, orders: S.orders, config: S.config, days: S.days, log: S.log, perf: S.perf })), { complete: false })
  }
  return out
}

// Replace every record (backup import, moving real data in). Needs a connection: it reads the full
// server collections so nothing outside the live window is left behind.
export async function replaceAllData(next, onProgress) {
  const custs = (next.customers || []).map(normCust)
  const ords = (next.orders || []).filter(o => o && o.date).map(normOrder)
  const plan = {
    customers: new Map(custs.map(c => [c.id, c])),
    orders: new Map(ords.map(o => [o.id, o])),
    days: new Map(Object.entries(next.days || {}).filter(([k]) => /^\d{4}-\d\d-\d\d$/.test(k))),
    log: new Map((Array.isArray(next.log) ? next.log : []).filter(e => e && e.id).map(e => [e.id, e])),
    perf: new Map(Object.entries(next.perf?.days || {}).filter(([k]) => /^\d{4}-\d\d-\d\d$/.test(k))),
  }
  const ops = []
  for (const name of NAMES) {
    onProgress?.(`${name} 확인 중`)
    const snap = await getDocsFromServer(collection(db, COL[name]))
    const keep = name === 'config' ? new Set(['main']) : new Set(plan[name].keys())
    snap.forEach(d => { if (!keep.has(d.id)) ops.push({ t: 'del', name, id: d.id }) })
  }
  S.customers = [...plan.customers.values()]
  S.orders = [...plan.orders.values()]
  S.days = Object.fromEntries(plan.days)
  S.log = [...plan.log.values()].sort((a, b) => b.at - a.at)
  S.perf = { days: Object.fromEntries(plan.perf), since: next.perf?.since || '' }
  S.config = normConfig(next.config)
  for (const name of NAMES) {
    known[name].clear()
    for (const [id, obj] of entities(name)) { const plain = storeShape(name, obj); ops.push({ t: 'set', name, id, data: plain }); known[name].set(id, plain) }
  }
  onProgress?.(`${ops.length}건 저장 중`)
  commitOps(ops)
  emit()
  return ops.length
}
