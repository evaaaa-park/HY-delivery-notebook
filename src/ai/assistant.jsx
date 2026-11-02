// AI 도우미: type or paste a KakaoTalk notification ("411-1501 김하늘 다음 주 중지"), or attach a screenshot.
// The AI changes the data through the tools in tools.js; each turn can be undone.
// The conversation is shared between devices (Firestore `chat`), the last 40 messages are kept.
import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { collection, doc, setDoc, updateDoc, onSnapshot, query, orderBy, limit, writeBatch } from 'firebase/firestore'
import { db } from '@/firebase'
import { S } from '@/store/state'
import { save } from '@/store/sync'
import { session } from '@/store/auth'
import { normCust, normOrder, normConfig } from '@/domain/normalize'
import { ensureRouteOrder } from '@/domain/location'
import { uid, clone, stable } from '@/lib/util'
import { openSheet, SheetHead } from '@/lib/sheet'
import { toast } from '@/lib/toast'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Chip } from '@/components/common'
import { IconImage, IconSend, IconStop, IconUndo } from '@/components/icons'
import { STATIC_RULES, dataContext } from './context'
import { makeTools, toolSchemas } from './tools'
import { chatStep, prepareImages, aiErrorText } from './client'

const MAX_STEPS = 12
const chat = { list: [], live: null, running: false, ctl: null, unsub: null }
const AI_UNDO = new Map() // message id -> { before, after } snapshots (this session only)
const subs = new Set()
const bump = () => { chat.v = (chat.v || 0) + 1; subs.forEach(f => f()) }
const useChat = () => useSyncExternalStore(cb => { subs.add(cb); return () => subs.delete(cb) }, () => chat.v || 0)

function listenChat() {
  if (chat.unsub) return
  chat.unsub = onSnapshot(query(collection(db, 'chat'), orderBy('at', 'desc'), limit(40)), snap => {
    chat.list = snap.docs.map(d => ({ ...d.data(), id: d.id })).reverse()
    bump()
  }, () => { chat.unsub = null })
}
function saveMsg(m) {
  const { pending: _p, ...rest } = m
  setDoc(doc(db, 'chat', m.id), { ...rest, by: (session.user?.email || '').toLowerCase() }).catch(() => {})
}

/* ---------- undo: put back only the records this turn changed ---------- */
const snapshot = () => clone({ customers: S.customers, orders: S.orders, log: S.log, days: S.days, perf: S.perf.days, perfSince: S.perf.since, config: S.config })
function undoTurn(mid) {
  const u = AI_UNDO.get(mid); if (!u) return
  const touched = new Set()
  const norm = { customers: normCust, orders: normOrder, log: x => x }
  for (const name of ['customers', 'orders', 'log']) {
    const b = new Map(u.before[name].map(x => [x.id, x])), a = new Map(u.after[name].map(x => [x.id, x]))
    for (const id of new Set([...b.keys(), ...a.keys()])) {
      if (stable(b.get(id)) === stable(a.get(id))) continue
      touched.add(name)
      const i = S[name].findIndex(x => x.id === id)
      if (b.has(id)) { const v = norm[name](b.get(id)); if (i >= 0) S[name][i] = v; else S[name].push(v) }
      else if (i >= 0) S[name].splice(i, 1)
    }
  }
  for (const [name, target] of [['days', S.days], ['perf', S.perf.days]]) {
    const b = u.before[name], a = u.after[name]
    for (const k of new Set([...Object.keys(b), ...Object.keys(a)])) {
      if (stable(b[k]) === stable(a[k])) continue
      touched.add(name)
      if (b[k] !== undefined) target[k] = b[k]; else delete target[k]
    }
  }
  if (stable(u.before.config) !== stable(u.after.config)) { S.config = normConfig(u.before.config); touched.add('config') }
  if (u.before.perfSince !== u.after.perfSince) { S.perf.since = u.before.perfSince; touched.add('perf') }
  S.log.sort((x, y) => y.at - x.at)
  AI_UNDO.delete(mid)
  save(...touched)
  updateDoc(doc(db, 'chat', mid), { undone: true }).catch(() => {})
  const m = chat.list.find(x => x.id === mid); if (m) m.undone = true
  bump(); toast('AI가 바꾼 내용을 되돌렸어요')
}

/* ---------- one user turn ---------- */
async function send(text, files) {
  if (chat.running) return
  text = (text || '').trim()
  if (!text && !files.length) return
  if (!navigator.onLine) { toast('AI는 인터넷이 연결되어 있을 때만 쓸 수 있어요.'); return false }
  let images
  try { images = files.length ? await prepareImages(files) : [] } catch { toast('사진을 읽지 못했어요. 다른 사진으로 해 보세요.'); return false }
  const now = Date.now()
  const um = { id: uid('m_'), role: 'user', text: text || `(사진 ${images.length}장)`, at: now, pics: images.length }
  const history = chat.list.filter(m => m.text && !m.pending).slice(-10).map(m => ({ role: m.role, content: m.text + (m.actions?.length ? '\n[반영함: ' + m.actions.join(' / ') + ']' : '') }))
  while (history.length && history[0].role !== 'user') history.shift()
  chat.list.push(um); saveMsg(um)
  const am = { id: uid('m_'), role: 'assistant', text: '', actions: [], err: '', at: now + 1, pending: true }
  chat.live = am; chat.running = true; bump()

  const before = snapshot()
  const changed = new Set()
  const tools = makeTools({ changed, action: t => { am.actions.push(t); bump() } })
  const defs = toolSchemas(tools)
  const userContent = [
    ...images.map(im => ({ type: 'image', source: { type: 'base64', media_type: im.type, data: im.data } })),
    { type: 'text', text: text || '이 사진의 주문·변경 사항을 반영해 줘.' },
  ]
  // fresh data goes in as a system message after the question, so the fixed instructions stay cached
  const messages = [...history, { role: 'user', content: userContent }, { role: 'system', content: dataContext() }]
  chat.ctl = new AbortController()
  const texts = []
  try {
    for (let step = 0; step < MAX_STEPS; step++) {
      let cur = ''
      const res = await chatStep({ system: STATIC_RULES, messages, tools: defs }, {
        signal: chat.ctl.signal,
        onText: t => { cur += t; am.text = [...texts, cur].filter(Boolean).join('\n\n'); bump() },
      })
      const stepText = (res.content || []).filter(b => b.type === 'text').map(b => b.text).join('').trim()
      if (stepText) texts.push(stepText)
      am.text = texts.join('\n\n')
      messages.push({ role: 'assistant', content: res.content })
      if (res.stop_reason === 'refusal') { am.err = '이 요청은 처리하지 못했어요.'; break }
      if (res.stop_reason === 'max_tokens') { am.err = '답이 길어서 중간에 끊겼어요.'; break }
      const uses = (res.content || []).filter(b => b.type === 'tool_use')
      if (res.stop_reason !== 'tool_use' || !uses.length) break
      const results = []
      for (const u of uses) {
        const tool = tools.find(t => t.name === u.name)
        try {
          if (!tool) throw new Error('없는 도구예요: ' + u.name)
          const out = await tool.run(u.input || {})
          results.push({ type: 'tool_result', tool_use_id: u.id, content: JSON.stringify(out ?? { ok: true }) })
        } catch (e) {
          results.push({ type: 'tool_result', tool_use_id: u.id, content: String(e?.message || e), is_error: true })
        }
      }
      if (changed.size) { ensureRouteOrder(); save(...changed, 'config') } // keep every round, even if a later step fails
      messages.push({ role: 'user', content: results })
    }
  } catch (e) {
    am.err = aiErrorText(e)
  } finally {
    am.pending = false; chat.running = false; chat.ctl = null; chat.live = null
    if (changed.size) AI_UNDO.set(am.id, { before, after: snapshot() })
    chat.list.push(am); saveMsg(am); bump()
  }
  return true
}

async function clearChat() {
  const ids = chat.list.map(m => m.id)
  chat.list = []; AI_UNDO.clear(); bump()
  for (let i = 0; i < ids.length; i += 400) {
    const b = writeBatch(db); ids.slice(i, i + 400).forEach(id => b.delete(doc(db, 'chat', id))); b.commit().catch(() => {})
  }
}

/* ---------- UI ---------- */
const SUGGEST = ['내일 배달 몇 곳이야?', '402-903 이번 주 금요일만 엠프로 2개로 바꿔줘', '이번 주 발주할 거 알려줘', '이번 달 실적 알려줘']

function Msg({ m }) {
  if (m.role === 'user') return <div className="msg me">{m.text}</div>
  const canUndo = AI_UNDO.has(m.id) && !m.undone
  return (
    <div className="msg ai">
      <div>{m.text || (m.pending ? <span className="muted">생각하는 중…</span> : '')}</div>
      {m.actions?.length > 0 && <ul className="acts">{m.actions.map((a, i) => <li key={i}>{a}</li>)}</ul>}
      {m.err && <div className="warnbox" style={{ marginTop: 6 }}>{m.err}</div>}
      {canUndo ? <Button size="sm" className="justify-self-start" onClick={() => undoTurn(m.id)}><IconUndo />되돌리기</Button>
        : m.undone ? <span className="hint">되돌렸어요</span> : null}
    </div>
  )
}

function Assistant() {
  const v = useChat()
  const [text, setText] = useState('')
  const [files, setFiles] = useState([])
  const box = useRef(null)
  const list = chat.live ? [...chat.list, chat.live] : chat.list
  useEffect(() => { listenChat() }, [])
  useEffect(() => { box.current?.scrollIntoView({ block: 'end' }) }, [v])
  const go = async () => {
    const t = text, f = files
    setText(''); setFiles([])
    const ok = await send(t, f)
    if (ok === false) { setText(t); setFiles(f) }
  }
  return (
    <div className="chat">
      <SheetHead title="AI 도우미" />
      <div className="msgs" aria-live="polite">
        {list.length ? list.map(m => <Msg key={m.id} m={m} />) : (
          <div className="hint" style={{ display: 'grid', gap: 8 }}>
            <span>변경 사항을 말하면 바로 반영하고, 궁금한 건 데이터를 보고 답해요. 카카오톡 알림을 붙여 넣거나 캡처를 올려도 돼요.</span>
            <div className="chips" style={{ flexWrap: 'wrap' }}>{SUGGEST.map(s => <Chip key={s} onClick={() => setText(s)}>{s}</Chip>)}</div>
          </div>
        )}
        <div ref={box} />
      </div>
      <div className="composer">
        {files.length > 0 && <div className="hint">사진 {files.length}장 첨부 <button type="button" className="underline" onClick={() => setFiles([])}>빼기</button></div>}
        <Textarea rows={2} value={text} onChange={e => setText(e.target.value)} placeholder="예: 411-1501 금요일만 우유 2개로 / 내일 몇 곳이야?"
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); go() } }} />
        <div className="row">
          <Button size="sm" asChild><label className="cursor-pointer"><IconImage />사진<input type="file" accept="image/*" multiple hidden onChange={e => { setFiles([...(e.target.files || [])]); e.target.value = '' }} /></label></Button>
          {chat.list.length > 0 && !chat.running && <Button size="sm" variant="ghost" onClick={clearChat}>대화 지우기</Button>}
          <span style={{ flex: 1 }} />
          {chat.running && <Button size="sm" onClick={() => chat.ctl?.abort()}><IconStop />멈추기</Button>}
          <Button variant="primary" disabled={chat.running || (!text.trim() && !files.length)} onClick={go}><IconSend />보내기</Button>
        </div>
      </div>
    </div>
  )
}

export function openAssistant() { openSheet(<Assistant />) }
