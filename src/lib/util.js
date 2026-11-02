export { cn } from 'cn'

export const uid = (p = '') => p + Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-4)
export const clone = o => (o === undefined ? undefined : JSON.parse(JSON.stringify(o)))

// JSON with sorted object keys, for comparing two values regardless of key order
export function stable(v) {
  return JSON.stringify(v, (k, x) => (x && typeof x === 'object' && !Array.isArray(x))
    ? Object.keys(x).sort().reduce((o, kk) => (o[kk] = x[kk], o), {})
    : x)
}

export const compact = s => String(s ?? '').replace(/\s+/g, '').toLowerCase()
