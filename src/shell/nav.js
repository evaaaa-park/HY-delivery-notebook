// Navigation helpers shared by screens.
import { UI, setUI } from '@/store/state'

export function setTab(tab) {
  const patch = { tab }
  if (tab !== 'customers') UI.selected.clear()
  setUI(patch, true)
  window.scrollTo(0, 0)
}
export function gotoOrder(date) { UI.orderDate = date; setTab('order') }
export function gotoRoute(date) { UI.routeDate = date || null; UI.routeMode = 'list'; setTab('route') }
export function gotoRecords(mode) { UI.recMode = mode; setTab('records') }
export function gotoCustomers(filter) { if (filter) UI.custF = filter; setTab('customers') }
