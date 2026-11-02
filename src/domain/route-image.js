// The day's route list drawn as a PNG (to keep in the photo album or send).
import { S } from '@/store/state'
import { fmt, fmtStamp } from '@/lib/dates'
import { TYPE_NAME } from './constants'
import { pShort } from './model'
import { orderedStops, itemAgg, stopNotes } from './stops'
import { groupKey, groupLabel, subLabel, isNumB } from './location'
import { billShow } from './bills'

function wrapText(x, t, w) {
  const words = String(t || '').split(' '); const lines = []; let cur = ''
  for (const wd of words) {
    const test = cur ? cur + ' ' + wd : wd
    if (x.measureText(test).width <= w) { cur = test; continue }
    if (cur) lines.push(cur)
    if (x.measureText(wd).width <= w) { cur = wd; continue }
    let part = ''; for (const ch of wd) { if (x.measureText(part + ch).width > w && part) { lines.push(part); part = ch } else part += ch } cur = part
  }
  if (cur) lines.push(cur)
  return lines.length ? lines : ['']
}

export async function routeImageBlob(date) {
  const FF = '"IBM Plex Sans KR","Apple SD Gothic Neo","Malgun Gothic",sans-serif'
  const stops = orderedStops(date).filter(s => !s.skipped); const done = S.days[date]?.done || {}
  const W = 1080, P = 32, LH = 30
  const cols = [{ k: 'n', w: 70 }, { k: 'loc', w: 180 }, { k: 'name', w: 170 }, { k: 'items', w: 330 }]
  cols.push({ k: 'note', w: W - P * 2 - cols.reduce((s, c) => s + c.w, 0) })
  const rows = []; let prevG = null; let n = 0
  for (const st of stops) {
    const g = groupKey(st.loc); if (g !== prevG) { rows.push({ g: groupLabel(st.loc) + (subLabel(st.loc) === '지하' && !groupLabel(st.loc).includes('지하') ? ' · 지하' : '') }); prevG = g }
    n++
    const its = itemAgg(st).map(i => `${pShort(i.pid)} ${i.q}`).join(', ')
    const types = [...new Set(st.orders.map(o => o.type))].map(t => '[' + TYPE_NAME[t] + (t === 'sample' ? '·지점 수령' : '') + ']').join('')
    const flags = [billShow(st, date) ? '[청구서]' : '', types, st.cust?.ice ? '아이스팩' : '', st.cust?.bag ? '주머니' : ''].filter(Boolean)
    const note = [flags.join(' '), stopNotes(st)].filter(Boolean).join(' / ')
    rows.push({ n, done: !!done[st.key], loc: `${st.loc.building || '—'}${st.loc.unit ? '-' + st.loc.unit : ''}`, sub: st.loc.label && !isNumB(st.loc.building) ? st.loc.label : '', name: st.name, items: its, note, added: st.orders.length > 0 })
  }
  const live = stops.length, dn = stops.filter(s => done[s.key]).length, qty = stops.reduce((s, st) => s + st.items.reduce((a, i) => a + i.qty, 0), 0)
  const title = `${fmt(date)} 배달 동선`
  const summary = `${live}곳 · 제품 ${qty}개 · 완료 ${dn}/${live} · ${fmtStamp(Date.now())} 저장`
  const footer = '헬리오 배달수첩 · 파란 줄 = 정기 외 주문(일반·견본·선불정기·추가·회수)이 있는 곳'
  // Korean glyphs come in many unicode-range font files: load the ones this text needs before measuring
  const text = [title, summary, footer, '번호 동-호 이름 제품 메모 ✓', ...rows.flatMap(r => r.g ? [r.g] : [String(r.n), r.loc, r.sub, r.name, r.items, r.note])].join(' ')
  try {
    await Promise.all([
      document.fonts.load(`400 21px ${FF}`, text), document.fonts.load(`600 21px ${FF}`, text), document.fonts.load(`700 21px ${FF}`, text),
      document.fonts.load(`400 38px "Do Hyeon",${FF}`, title),
    ])
  } catch { /* draw with whatever font is available */ }
  const cv = document.createElement('canvas'); const x = cv.getContext('2d')
  x.font = `400 21px ${FF}`
  rows.forEach(r => {
    if (r.g) { r.h = 40; return }
    r.L = { name: wrapText(x, r.name, cols[2].w - 14), items: wrapText(x, r.items, cols[3].w - 14), note: wrapText(x, r.note, cols[4].w - 14), sub: r.sub ? wrapText(x, r.sub, cols[1].w - 14) : [] }
    r.h = Math.max(1 + r.L.sub.length, r.L.name.length, r.L.items.length, r.L.note.length) * LH + 18
  })
  const top = 128, th = 42
  const H = top + th + rows.reduce((s, r) => s + r.h, 0) + 56
  // 2x for sharpness, but stay under iPhone/iPad's canvas size limit (~16.7M pixels) on long routes
  const SC = Math.min(2, Math.sqrt(16000000 / (W * H)))
  cv.width = Math.floor(W * SC); cv.height = Math.floor(H * SC); x.scale(SC, SC)
  x.fillStyle = '#ffffff'; x.fillRect(0, 0, W, H)
  x.fillStyle = '#121823'; x.font = `400 38px "Do Hyeon",${FF}`; x.textBaseline = 'alphabetic'
  x.fillText(title, P, 62)
  x.font = `400 20px ${FF}`; x.fillStyle = '#596377'
  x.fillText(summary, P, 98)
  let y = top
  x.fillStyle = '#E7EBF2'; x.fillRect(P, y, W - P * 2, th)
  x.fillStyle = '#3a4456'; x.font = `700 18px ${FF}`; x.textBaseline = 'middle'
  let cx = P; ['번호', '동-호', '이름', '제품', '메모'].forEach((t, i) => { x.fillText(t, cx + 10, y + th / 2); cx += cols[i].w })
  y += th
  for (const r of rows) {
    if (r.g) {
      x.fillStyle = '#F1F3F7'; x.fillRect(P, y, W - P * 2, r.h)
      x.fillStyle = '#2F54EB'; x.font = `700 19px ${FF}`; x.textBaseline = 'middle'; x.fillText(r.g, P + 10, y + r.h / 2)
      y += r.h; continue
    }
    if (r.added) { x.fillStyle = '#F4F6FF'; x.fillRect(P, y, W - P * 2, r.h) }
    x.textBaseline = 'top'; cx = P
    // number + done mark
    if (r.done) { x.fillStyle = '#1C8248'; x.beginPath(); x.arc(cx + 22, y + 9 + LH / 2, 13, 0, Math.PI * 2); x.fill(); x.fillStyle = '#fff'; x.font = `700 17px ${FF}`; x.textAlign = 'center'; x.fillText('✓', cx + 22, y + 9 + 4); x.textAlign = 'left'; x.fillStyle = '#596377'; x.font = `600 18px ${FF}`; x.fillText(String(r.n), cx + 40, y + 13) }
    else { x.fillStyle = '#121823'; x.font = `700 21px ${FF}`; x.fillText(String(r.n), cx + 10, y + 9) }
    cx += cols[0].w
    x.fillStyle = '#121823'; x.font = `700 21px ${FF}`; x.fillText(r.loc, cx + 8, y + 9)
    x.fillStyle = '#596377'; x.font = `400 17px ${FF}`; r.L.sub.forEach((l, i) => x.fillText(l, cx + 8, y + 9 + LH * (i + 1)))
    cx += cols[1].w
    x.fillStyle = '#121823'; x.font = `400 21px ${FF}`; r.L.name.forEach((l, i) => x.fillText(l, cx + 8, y + 9 + LH * i))
    cx += cols[2].w
    x.fillStyle = '#121823'; x.font = `600 21px ${FF}`; r.L.items.forEach((l, i) => x.fillText(l, cx + 8, y + 9 + LH * i))
    cx += cols[3].w
    x.fillStyle = '#9E5E00'; x.font = `400 19px ${FF}`; r.L.note.forEach((l, i) => x.fillText(l, cx + 8, y + 10 + LH * i))
    y += r.h
    x.fillStyle = '#D9DFE8'; x.fillRect(P, y - 1, W - P * 2, 1)
  }
  x.fillStyle = '#8a93a5'; x.font = `400 16px ${FF}`; x.textBaseline = 'alphabetic'
  x.fillText(footer, P, H - 22)
  return await new Promise(res => cv.toBlob(res, 'image/png'))
}
