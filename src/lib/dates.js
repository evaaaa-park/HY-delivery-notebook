// Calendar helpers. Dates are 'YYYY-MM-DD' strings.
// The business runs on Korea time: "today", clock times and month boundaries are always KST,
// so the app shows the same day whether it is opened in Seoul or in the US.
const KST_OFFSET = 9 * 3600 * 1000 // Korea has no daylight saving time
export const TZ = 'Asia/Seoul'

export const pad = n => String(n).padStart(2, '0')
export const ymd = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
export const parseD = s => { const [y, m, d] = String(s).split('-').map(Number); return new Date(y, m - 1, d) }
export const addDays = (s, n) => { const d = parseD(s); d.setDate(d.getDate() + n); return ymd(d) }
export const dow = s => parseD(s).getDay()
export const DL = ['일', '월', '화', '수', '목', '금', '토']
export const fmt = s => { if (!s) return ''; const d = parseD(s); return `${d.getMonth() + 1}/${d.getDate()}(${DL[d.getDay()]})` }
export const fmtShort = s => { if (!s) return ''; const d = parseD(s); return `${d.getMonth() + 1}/${d.getDate()}` }
export const daysBetween = (a, b) => Math.round((parseD(b) - parseD(a)) / 86400000)

// KST wall-clock parts of a timestamp
export function kst(ts = Date.now()) {
  const d = new Date(+ts + KST_OFFSET)
  return { y: d.getUTCFullYear(), m: d.getUTCMonth() + 1, d: d.getUTCDate(), h: d.getUTCHours(), mi: d.getUTCMinutes(), w: d.getUTCDay() }
}
export const dayOf = ts => { const k = kst(ts); return `${k.y}-${pad(k.m)}-${pad(k.d)}` }
export const TODAY = () => dayOf(Date.now())
export const MONTH = () => TODAY().slice(0, 7)
export const hm = ts => { const k = kst(ts); return `${pad(k.h)}:${pad(k.mi)}` }
export const minutesOfDay = ts => { const k = kst(ts); return k.h * 60 + k.mi }
export const fmtStamp = (ts, opts = { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) =>
  new Date(ts).toLocaleString('ko-KR', { timeZone: TZ, ...opts })
export const headerDate = () => { const k = kst(); return `${k.m}월 ${k.d}일 ${DL[k.w]}요일` }

export function daysText(days) {
  const s = [...days].sort()
  if (s.join() === '1,2,3,4,5') return '월–금'
  if (s.join() === '1,3,5') return '월수금'
  if (s.join() === '2,4') return '화목'
  return s.map(d => DL[d]).join('')
}
