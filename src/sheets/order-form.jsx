// 주문 추가: one-off orders by hy order type (일반·견본·선불정기·추가·회수) for customers or new addresses.
import { S, useStore } from '@/store/state'
import { save } from '@/store/sync'
import { TODAY, fmt } from '@/lib/dates'
import { clone, compact, cn } from '@/lib/util'
import { openSheet, closeSheet, SheetHead, SheetActions } from '@/lib/sheet'
import { toast } from '@/lib/toast'
import { useDraft } from '@/lib/hooks'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { ProductImage, PDot, Plate, Stepper, Seg, Chip, Field, CheckRow } from '@/components/common'
import { ORDER_TYPES, TYPE_NAME, TYPE_LONG, TYPE_HINT } from '@/domain/constants'
import { normOrder } from '@/domain/normalize'
import { custById, xId, locShort, itemsText } from '@/domain/model'
import { locText, isNumB, ensureRouteOrder } from '@/domain/location'
import { nextDeliveryDay, orderTarget, orderDayFor, isDeliveryDay, defaultOrderDate } from '@/domain/calendar'
import { logChange, logMark, dropLogsSince } from '@/domain/log'
import { refreshPerfKey } from '@/domain/perf'
import { openAIImport } from '@/ai/import-sheet'

function newDraft(opts) {
  return {
    type: opts.type || 'fredit', ids: opts.customerIds ? [...opts.customerIds] : [], useNew: false,
    nl: { name: '', building: '', unit: '', label: '' }, date: opts.date || defaultOrderDate(),
    items: {}, extra: [], noBuy: false, note: '', q: '',
  }
}

// opts: { type, customerIds, date, draft } — draft restores a form that was left for the AI import sheet
export function openOrderSheet(opts = {}) {
  openSheet(<OrderForm opts={opts} />)
}

// compact stepper so a product cell fits photo + name + stepper in two columns on a phone
function MiniStepper({ value, onDec, onInc, label }) {
  return (
    <span className="inline-flex w-fit items-center rounded-lg border border-line bg-surface">
      <button type="button" className="grid h-8 w-8 place-items-center text-lg leading-none" onClick={onDec} aria-label={`${label} 줄이기`}>−</button>
      <b className="min-w-5 text-center font-mono tabular-nums">{value}</b>
      <button type="button" className="grid h-8 w-8 place-items-center text-lg leading-none" onClick={onInc} aria-label={`${label} 늘리기`}>+</button>
    </span>
  )
}

function Impact({ F }) {
  const xq = F.extra.filter(x => x.name.trim()).reduce((s, x) => s + x.qty, 0)
  const qty = F.noBuy ? 0 : Object.values(F.items).reduce((s, q) => s + q, 0)
  const n = F.ids.length + (F.useNew ? 1 : 0)
  if (!(qty + xq) || !n) return null
  if (!qty) return <div className="infobox">{fmt(F.date)} 동선에 {n}곳 추가 · 따로 결제된 거라 발주표에는 안 들어가요</div>
  const counted = S.config.purchase[F.type]; const tgt = orderTarget(); const od = orderDayFor(F.date)
  let msg = `${fmt(F.date)} 동선에 ${n}곳 추가`
  if (!counted) msg += F.type === 'sample' ? ' · 발주표 대신 “지점에서 받아오기”에 떠요' : ' · 자동 발주라 발주표에는 안 들어가요'
  else if (F.date === tgt) msg += ` · 오늘 발주표에 +${qty * n}개 바로 반영`
  else if (F.date > tgt) msg += ` · ${fmt(od)} 발주표에 +${qty * n}개 들어가요`
  const late = counted && F.date < tgt && F.date >= TODAY()
  const past = F.date < TODAY()
  return (
    <div className={late || past ? 'warnbox' : 'infobox'}>
      {msg}
      {late && <><br /><b>발주일({fmt(od)})이 지난 날짜예요.</b> 재고로 채우거나 지점에 추가 요청이 필요해요.</>}
      {past && <><br />지난 날짜예요.</>}
      {!isDeliveryDay(F.date) && <><br />배달 요일이 아니거나 휴무일이에요.</>}
    </div>
  )
}

function saveOF(F) {
  const items = Object.entries(F.items).filter(([, q]) => q > 0).map(([productId, qty]) => ({ productId, qty }))
  F.extra.forEach(x => { const id = xId(x.name); if (id.length > 2 && x.qty > 0) items.push({ productId: id, qty: x.qty }) })
  if (!items.length) { toast('제품 수량을 하나 이상 넣어 주세요.'); return }
  if (!F.ids.length && !(F.useNew && (F.nl.name || F.nl.building))) { toast('받는 고객을 고르거나 새 배달지를 입력해 주세요.'); return }
  if (!F.date) { toast('배달일을 골라 주세요.'); return }
  const made = []
  const nb = F.noBuy && S.config.purchase[F.type]
  F.ids.forEach(id => made.push(normOrder({ type: F.type, customerId: id, date: F.date, items: clone(items), note: F.note, noBuy: nb })))
  if (F.useNew) made.push(normOrder({ type: F.type, customerId: null, name: F.nl.name, loc: { type: isNumB(F.nl.building) ? 'apt' : 'store', ...F.nl }, date: F.date, items: clone(items), note: F.note, noBuy: nb }))
  const mark = logMark()
  S.orders.push(...made)
  let perf = false
  made.forEach(o => {
    const c = o.customerId ? custById(o.customerId) : null
    logChange({ cid: o.customerId, name: c ? '' : o.name, loc: c ? '' : locShort(o.loc), from: o.date, kind: '주문', text: `${TYPE_NAME[o.type]} 주문 ${itemsText(o.items)}${o.note ? ' · ' + o.note : ''}` })
    if (o.date < TODAY() && refreshPerfKey(o.date, c ? c.id : 'o:' + o.id)) perf = true
  })
  ensureRouteOrder()
  const ids = made.map(o => o.id); const date = F.date
  save('orders', 'config', 'log', ...(perf ? ['perf'] : []))
  closeSheet()
  toast(`${fmt(date)} 동선·발주표에 ${made.length}건 반영했어요`, () => {
    S.orders = S.orders.filter(o => !ids.includes(o.id)); dropLogsSince(mark); save('orders', 'log')
  })
}

function OrderForm({ opts }) {
  useStore()
  const [F, refresh] = useDraft(() => (opts.draft ? clone(opts.draft) : newDraft(opts)))
  const set = patch => { Object.assign(F, patch); refresh() }
  const addQty = (pid, d) => { F.items[pid] = Math.max(0, (F.items[pid] || 0) + d); refresh() }
  const hint = TYPE_HINT[F.type] || ''
  const quick = []; let d = TODAY(); for (let i = 0; i < 5; i++) { d = nextDeliveryDay(d); quick.push(d) }
  const q = compact(F.q)
  const hits = q
    ? S.customers.filter(c => !F.ids.includes(c.id) && compact(c.name + c.loc.building + '-' + c.loc.unit + c.loc.building + c.loc.unit + locText(c.loc)).includes(q)).slice(0, 8)
    : []
  const setNl = (f, v) => { F.nl[f] = v; refresh() }
  const addExtra = () => {
    F.extra.push({ name: '', qty: 1 }); refresh()
    setTimeout(() => { const ins = document.querySelectorAll('[data-xname]'); ins[ins.length - 1]?.focus() }, 0)
  }
  const toAI = () => {
    const draft = clone(F)
    openAIImport('orders', { onBack: () => openOrderSheet({ draft }) })
  }

  return (
    <>
      <SheetHead title="주문 추가" />
      <Seg className="flex-wrap" value={F.type} onChange={v => set({ type: v })} options={ORDER_TYPES.map(t => [t, TYPE_NAME[t]])} />
      <p className="hint"><b>{TYPE_LONG[F.type]}</b> · {hint} {F.type === 'pickup' ? '' : S.config.purchase[F.type] ? '발주표에 포함돼요.' : '발주표에서는 빠져요.'}</p>
      <Button onClick={toAI}>메시지·사진으로 주문 채우기 (AI)</Button>

      <div className="field">
        <span className="lbl">받는 곳</span>
        {F.ids.length > 0 && (
          <div className="picked" style={{ marginBottom: 8 }}>
            {F.ids.map(id => {
              const c = custById(id)
              return c ? (
                <span className="pk" key={id}>
                  {c.name} {c.loc.building}-{c.loc.unit}
                  <button type="button" aria-label="빼기" onClick={() => set({ ids: F.ids.filter(x => x !== id) })}>×</button>
                </span>
              ) : null
            })}
          </div>
        )}
        <Input type="search" placeholder="이름 또는 동-호 검색 (예: 411-304)" value={F.q} onChange={e => set({ q: e.target.value })} autoComplete="off" aria-label="받는 고객 검색" />
        {q && (
          <div className="results" style={{ marginTop: 6 }}>
            {hits.length ? hits.map(c => (
              <button type="button" className="res" key={c.id} onClick={() => { F.ids.push(c.id); set({ q: '' }) }}>
                <Plate loc={c.loc} />
                <span className="t"><b>{c.name}</b> <span className="muted">{c.loc.label}</span></span>
                <span className="muted">선택</span>
              </button>
            )) : <div className="hint">맞는 고객이 없어요. 아래 “고객 목록에 없는 배달지”로 넣을 수 있어요.</div>}
          </div>
        )}
        <Button size="sm" variant="ghost" style={{ justifySelf: 'start', marginTop: 6 }} onClick={() => set({ useNew: !F.useNew })}>
          {F.useNew ? '− 새 배달지 닫기' : '+ 고객 목록에 없는 배달지'}
        </Button>
        {F.useNew && (
          <div className="grid2" style={{ marginTop: 6 }}>
            <Input placeholder="이름" value={F.nl.name} onChange={e => setNl('name', e.target.value)} aria-label="이름" />
            <Input placeholder="동 (예: 411, 상가B)" value={F.nl.building} onChange={e => setNl('building', e.target.value)} aria-label="동" />
            <Input placeholder="호 (예: 304, B3)" value={F.nl.unit} onChange={e => setNl('unit', e.target.value)} aria-label="호" />
            <Input placeholder="장소 설명 (선택)" value={F.nl.label} onChange={e => setNl('label', e.target.value)} aria-label="장소 설명" />
          </div>
        )}
      </div>

      <Field label="배달일" htmlFor="ofdate">
        <Input type="date" id="ofdate" value={F.date} onChange={e => { if (e.target.value) set({ date: e.target.value }) }} />
        <div className="chips" style={{ marginTop: 6 }}>
          {quick.map(qd => <Chip key={qd} pressed={F.date === qd} onClick={() => set({ date: qd })}>{fmt(qd)}</Chip>)}
        </div>
      </Field>

      <Field label="제품 · 수량">
        <div className="pgrid">
          {S.config.products.map(p => {
            const qn = F.items[p.id] || 0
            return (
              <div key={p.id} className={cn('pcell items-start', qn > 0 && 'on')}>
                <button type="button" className="pbtn flex-none" onClick={() => addQty(p.id, 1)} aria-label={`${p.name} 1개 더`}>
                  <ProductImage pid={p.id} size={44} />
                </button>
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <button type="button" className="pbtn flex-none" tabIndex={-1} onClick={() => addQty(p.id, 1)}><span className="n">{p.name}</span></button>
                  <MiniStepper value={qn} onDec={() => addQty(p.id, -1)} onInc={() => addQty(p.id, 1)} label={p.name} />
                </div>
              </div>
            )
          })}
        </div>
      </Field>

      <div className="field">
        <span className="lbl">목록에 없는 제품 <span className="muted" style={{ fontWeight: 400 }}>· 동선에만 넣고 발주는 안 해요</span></span>
        {F.extra.map((x, i) => (
          <div className="xrow" key={i}>
            <PDot hue={30} />
            <Input data-xname value={x.name} placeholder="제품 이름 (예: 펫쿠르트 영양트릿 치킨)" onChange={e => { x.name = e.target.value; refresh() }} aria-label="제품 이름" />
            <Stepper value={x.qty} label="" onDec={() => { x.qty = Math.max(1, x.qty - 1); refresh() }} onInc={() => { x.qty = Math.max(1, x.qty + 1); refresh() }} />
            <Button size="sm" variant="ghost" aria-label="빼기" onClick={() => { F.extra.splice(i, 1); refresh() }}>✕</Button>
          </div>
        ))}
        <Button size="sm" variant="ghost" style={{ justifySelf: 'start' }} onClick={addExtra}>+ 제품 이름으로 추가</Button>
      </div>

      {F.type !== 'pickup' && S.config.purchase[F.type] && (
        <CheckRow checked={F.noBuy} onChange={v => set({ noBuy: v })} title="따로 결제됨 · 발주 안 함" sub="앱이나 다른 곳에서 결제돼서 물건이 따로 오는 주문이면 켜요. 동선에만 들어가요." />
      )}
      <Field label="메모" htmlFor="ofnote">
        <Textarea id="ofnote" placeholder="예: 경비실에 맡기기, 오전 중" value={F.note} onChange={e => set({ note: e.target.value })} />
      </Field>
      <Impact F={F} />
      <SheetActions>
        <Button onClick={closeSheet}>취소</Button>
        <Button variant="primary" onClick={() => saveOF(F)}>저장</Button>
      </SheetActions>
    </>
  )
}
