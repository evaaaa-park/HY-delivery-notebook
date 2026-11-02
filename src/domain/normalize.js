// Every record goes through these on the way in (Firestore, backup import, forms), so older or partial
// data always comes out in the current shape.
import { DEFAULT_CONFIG, DEFAULT_PRODUCTS, DEFAULT_ROUTE, HOL_OFF_TYPES, STATUS_NAME, TYPES, AI_TIERS } from './constants'
import { clone, uid } from '@/lib/util'

export function normCust(c) {
  c = c || {}
  const st = STATUS_NAME[c.status] ? c.status : (c.active === false ? 'stopped' : 'active')
  return {
    status: st, endDate: st === 'active' ? '' : (c.endDate || ''), statusNote: c.statusNote || '',
    id: c.id || uid('c_'), name: c.name || '', contractNo: c.contractNo || '', phone: c.phone || '',
    loc: { type: c.loc?.type || 'apt', building: String(c.loc?.building ?? ''), unit: String(c.loc?.unit ?? ''), label: c.loc?.label || '' },
    course: c.course ?? null, slot: c.slot || '',
    regular: (c.regular || []).filter(r => r && r.productId).map(r => ({ productId: r.productId, qty: Math.max(0, +r.qty || 0), days: (r.days && r.days.length ? r.days : [1, 2, 3, 4, 5]).map(Number), every: +r.every === 2 ? 2 : 1, anchor: r.anchor || '' })),
    payment: c.payment || 'card', member: !!c.member, bill: c.bill || 'mobile', ice: !!c.ice, bag: !!c.bag,
    notes: c.notes || '', pauses: (c.pauses || []).filter(p => p && p.from && p.to).map(p => ({ id: p.id || uid('p_'), from: p.from, to: p.to, reason: p.reason || '', ack: !!p.ack, days: Array.isArray(p.days) ? p.days.map(Number) : [] })),
    holidayOff: typeof c.holidayOff === 'boolean' ? c.holidayOff : HOL_OFF_TYPES.includes(c.loc?.type),
    paidMonth: c.paidMonth || '', tags: Array.isArray(c.tags) ? c.tags : [], active: st === 'active', createdAt: c.createdAt || Date.now(),
  }
}

export function normOrder(o) {
  return {
    id: o.id || uid('o_'), type: TYPES.includes(o.type) && o.type !== 'regular' ? o.type : 'adhoc',
    customerId: o.customerId || null, name: o.name || '', loc: o.loc ? { type: o.loc.type || 'apt', building: String(o.loc.building ?? ''), unit: String(o.loc.unit ?? ''), label: o.loc.label || '' } : null,
    date: o.date, items: (o.items || []).filter(i => i && i.productId && +i.qty > 0).map(i => ({ productId: i.productId, qty: +i.qty })),
    note: o.note || '', noBuy: !!o.noBuy, status: o.status === 'cancelled' ? 'cancelled' : 'open', createdAt: o.createdAt || Date.now(), tags: Array.isArray(o.tags) ? o.tags : [],
  }
}

export function normConfig(b) {
  b = b || {}
  const c = { ...clone(DEFAULT_CONFIG), ...b }
  delete c.perfSince
  c.purchase = { ...DEFAULT_CONFIG.purchase, ...(b.purchase || {}) }
  c.stock = b.stock && typeof b.stock === 'object' ? { ...b.stock } : {}
  if (!Array.isArray(c.products) || !c.products.length) c.products = clone(DEFAULT_PRODUCTS)
  if (!Array.isArray(c.routeOrder) || !c.routeOrder.length) c.routeOrder = clone(DEFAULT_ROUTE)
  if (!Array.isArray(c.deliveryDays)) c.deliveryDays = [1, 2, 3, 4, 5]
  if (!Array.isArray(c.holidays)) c.holidays = []
  c.holidays = c.holidays.filter(h => h && h.date).map(h => ({ date: h.date, name: h.name || '휴무', mode: h.mode === 'partial' ? 'partial' : 'full' }))
  if (!Array.isArray(c.todos)) c.todos = []
  c.bills = b.bills && Array.isArray(b.bills.ids) ? { label: b.bills.label || '종이 청구서', since: b.bills.since || '', ids: [...b.bills.ids], given: b.bills.given && typeof b.bills.given === 'object' ? { ...b.bills.given } : {} } : null
  c.todos = c.todos.filter(t => t && t.text).map(t => ({ id: t.id || uid('t_'), text: String(t.text), at: t.at || Date.now(), due: t.due || '', done: !!t.done, doneAt: t.doneAt || 0 }))
  // entrances: { '209': [[1,2,3],[4,5,6]] }. Firestore cannot hold arrays inside arrays, so it is
  // stored as { '209': ['1,2,3','4,5,6'] } (see entrancesForStore); both forms are read here.
  c.entrances = {}
  if (b.entrances && typeof b.entrances === 'object' && !Array.isArray(b.entrances)) {
    for (const [bld, groups] of Object.entries(b.entrances)) {
      if (!Array.isArray(groups)) continue
      const gs = groups.map(g => (Array.isArray(g) ? g : String(g).split(',')).map(Number).filter(n => n > 0)).filter(g => g.length)
      if (gs.length) c.entrances[bld] = gs
    }
  }
  if (!Array.isArray(c.baseSeq)) c.baseSeq = null
  c.aiTier = AI_TIERS.includes(b.aiTier) ? b.aiTier : 'best'
  return c
}

export const entrancesForStore = ent => Object.fromEntries(Object.entries(ent || {}).map(([b, gs]) => [b, gs.map(g => g.join(','))]))
