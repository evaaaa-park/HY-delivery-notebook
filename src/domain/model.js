// Record lookups and small facts about customers, products and orders.
import { S } from '@/store/state'
import { STATUS_NAME } from './constants'
import { TODAY, MONTH, addDays, fmtShort } from '@/lib/dates'

export const custById = id => S.customers.find(c => c.id === id)
export const prodById = id => S.config.products.find(p => p.id === id)
// 목록에 없는 제품은 productId를 'x:제품명'으로 저장해요. 동선·실적에는 뜨고 발주표에는 절대 안 들어가요.
export const isX = id => typeof id === 'string' && id.startsWith('x:')
export const xId = name => 'x:' + String(name || '').replace(/[*;|]/g, ' ').replace(/\s+/g, ' ').trim()
export const pName = id => isX(id) ? id.slice(2) : (prodById(id)?.name || id)
export const pShort = id => isX(id) ? id.slice(2) : (prodById(id)?.short || prodById(id)?.name || id)
export const pHue = id => isX(id) ? 30 : (prodById(id)?.hue ?? 210)
export const noBuyOrder = o => !!o.noBuy || o.items.some(i => isX(i.productId))

// regular deliveries happen while active, or until the stop date when 해지·중단·이사 is set ahead
export const isOn = (c, d) => c.status === 'active' || (c.status !== 'waiting' && !!c.endDate && d < c.endDate)
export const statusBadge = c => c.status === 'active' ? '' : `${STATUS_NAME[c.status]}${c.endDate ? (c.endDate > TODAY() ? ' 예정 ' : ' ') + fmtShort(c.endDate) : ''}`
export const inCollection = c => c.status === 'active' || isOn(c, TODAY()) || (c.endDate && c.endDate >= addDays(TODAY(), -62))
export const cashUnpaid = c => inCollection(c) && c.payment === 'cash' && c.paidMonth !== MONTH()

export const locShort = loc => loc ? `${loc.building || ''}${loc.unit ? '-' + loc.unit : ''}` : ''
export const itemsText = items => (items || []).map(i => `${pShort(i.productId || i.pid)} ${i.qty}`).join(', ')
export const orderWho = o => { const c = o.customerId ? custById(o.customerId) : null; return { c, name: c ? c.name : o.name, loc: c ? c.loc : o.loc } }
