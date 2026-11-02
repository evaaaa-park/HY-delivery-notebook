// Light / dark / auto, chosen per device (localStorage). index.html applies it before first paint.
import { emit, useStore } from '@/store/state'

const LS = 'helio-theme'
export const THEME_NAME = { auto: '자동', light: '라이트', dark: '다크' }
const mq = typeof matchMedia !== 'undefined' ? matchMedia('(prefers-color-scheme: dark)') : null

export function getTheme() {
  try { const t = localStorage.getItem(LS); return t === 'light' || t === 'dark' ? t : 'auto' } catch { return 'auto' }
}
export const resolvedTheme = (m = getTheme()) => (m === 'auto' ? (mq?.matches ? 'dark' : 'light') : m)

function paint() {
  const dark = resolvedTheme() === 'dark'
  document.documentElement.classList.toggle('dark', dark)
  document.querySelectorAll('meta[name="theme-color"]').forEach(m => m.setAttribute('content', dark ? '#0E121A' : '#F1F3F7'))
}
export function applyTheme(m) {
  try { localStorage.setItem(LS, m) } catch { /* ignore */ }
  paint(); emit()
}
mq?.addEventListener?.('change', () => { if (getTheme() === 'auto') { paint(); emit() } })
paint()

export function useResolvedTheme() { useStore(); return resolvedTheme() }
