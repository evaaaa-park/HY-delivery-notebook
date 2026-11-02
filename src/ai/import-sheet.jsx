// Read customers (hy 고객조회 screenshots / lines of text) or orders (KakaoTalk messages / screenshots) with AI,
// show them as a checklist, and add the checked ones. Without a connection, customers can still be read
// line by line.
import { useState } from 'react'
import { S } from '@/store/state'
import { save } from '@/store/sync'
import { PAY, LOC_TYPES, ORDER_TYPES, TYPE_NAME } from '@/domain/constants'
import { normCust, normOrder } from '@/domain/normalize'
import { custById, prodById, isX, xId, locShort, itemsText } from '@/domain/model'
import { isNumB, ensureRouteOrder } from '@/domain/location'
import { defaultOrderDate } from '@/domain/calendar'
import { logChange, logMark, dropLogsSince } from '@/domain/log'
import { TODAY, DL, dow, fmt } from '@/lib/dates'
import { openSheet, closeSheet, SheetHead, SheetActions } from '@/lib/sheet'
import { toast } from '@/lib/toast'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Checkbox } from '@/components/ui/checkbox'
import { Badge } from '@/components/ui/badge'
import { Plate, ProductName } from '@/components/common'
import { IconImage } from '@/components/icons'
import { extract, prepareImages, aiErrorText } from './client'

const prodListText = () => S.config.products.map(p => `${p.id} | ${p.name} | ${p.orderName} | ${p.short}`).join('\n')
const custListText = () => S.customers.map(c => `${c.id} | ${c.name} | ${c.loc.building}-${c.loc.unit} | ${c.loc.label}`).join('\n')
const dupOf = c => S.customers.find(x => (c.contractNo && x.contractNo === c.contractNo) || (x.name === c.name && x.loc.building === String(c.building) && x.loc.unit === String(c.unit)))

function parseCustLines(text) {
  return text.split(/\n+/).map(l => l.trim()).filter(Boolean).map(l => {
    const parts = l.split(/[,\t]/).map(s => s.trim())
    const m = l.match(/(\d{3})\s*[-동\s]\s*(\d{3,4}|B\d)/i); const ph = l.match(/01\d[-\s]?\d{3,4}[-\s]?\d{4}/)
    const pay = /현금/.test(l) ? 'cash' : /계좌/.test(l) ? 'account' : 'card'
    return { name: parts[0] || '', building: m ? m[1] : '', unit: m ? m[2] : '', phone: ph ? ph[0] : '', payment: pay, type: 'apt', label: '', contractNo: '', course: null, member: false, bill: 'mobile' }
  }).filter(x => x.name || x.building)
}

function customersPrompt(text) {
  return `hy(한국야쿠르트) 배달 매니저의 고객 목록을 정리해. 아래 글이나 사진(hy 모바일 고객관리 "고객조회" 화면)에서 고객을 찾아 customers 목록으로 답해.
각 항목: name 이름, contractNo 정기계약번호(없으면 빈 문자열), building 동 번호, unit 호 또는 층, label 세대가 아니면 장소 설명(아니면 빈 문자열), type apt|office|security|store|community, phone 010-0000-0000 형식(없으면 빈 문자열), course 코스 숫자(없으면 null), payment card|account|cash, member 회원 여부, bill mobile|paper.
규칙: "헬리오시티) 411-304" → building "411", unit "304", type "apt". "403동 지하3층 휴게실" → building "403", unit "B3", label "403동 지하3층 휴게실", type "office". 보안실은 security, 상가는 store, 주민센터·경로당은 community. 카드자동이체 → card, 계좌자동이체 → account, 현금 → cash. "회원" 표시는 member true, "비회원"은 false. "종이 청구서" → paper, "모바일 청구서" → mobile. 화면에서 잘린 고객은 빼.
${text ? `글:\n"""\n${text.slice(0, 12000)}\n"""` : '사진을 읽어.'}`
}
function ordersPrompt(text) {
  const t = TODAY(); const dd = defaultOrderDate()
  return `hy(한국야쿠르트) 배달 매니저의 주문 메시지를 정리해서 orders 목록으로 답해. 오늘은 ${t}(${DL[dow(t)]}). 날짜가 없으면 "${dd}". "수요일"처럼 요일만 있으면 오늘 이후 가장 가까운 그 요일.
주문 종류 (hy 앱 주문구분 기준): fredit(일반주문, 카드결제), sample(견본주문, 0원), prepaid((선불)정기배송), adhoc(hy 앱에 없는 직접 받은 추가주문), pickup(반품·회수). 결제금액 0원이면 sample.
제품 목록 (id | 배달표 이름 | 출고신청 이름 | 줄임말):
${prodListText()}
고객 목록 (id | 이름 | 동-호 | 장소):
${custListText().slice(0, 30000)}
각 항목: type, customerId(고객 목록에 같은 사람이나 같은 동-호가 있으면 그 id, 없으면 null), name, building, unit, date(YYYY-MM-DD), items(productId와 qty), note(요청사항).
제품 목록에 없는 제품(펫쿠르트 등)은 productId를 "x:원문 제품명"으로 넣어. 그래도 애매하면 items에서 빼고 note에 원문을 남겨.
${text ? `메시지:\n"""\n${text.slice(0, 12000)}\n"""` : '사진을 읽어.'}`
}

function ImportSheet({ mode, onBack }) {
  const isC = mode === 'customers'
  const [text, setText] = useState('')
  const [files, setFiles] = useState([])
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [results, setResults] = useState(null)
  const [checked, setChecked] = useState([])
  const online = navigator.onLine !== false

  const run = async () => {
    if (!text.trim() && !files.length) { toast('글을 붙여 넣거나 사진을 골라 주세요.'); return }
    setErr('')
    if (!online) {
      if (!isC) { setErr('인터넷이 연결되어 있을 때만 읽을 수 있어요. 주문 추가 양식을 이용해 주세요.'); return }
      const r = parseCustLines(text); setResults(r); setChecked(r.map(() => true)); return
    }
    setBusy(true)
    try {
      const images = files.length ? await prepareImages(files) : []
      const json = await extract({ kind: mode, prompt: isC ? customersPrompt(text.trim()) : ordersPrompt(text.trim()), images })
      const r = (isC ? json?.customers : json?.orders) || []
      setResults(r)
      setChecked(r.map(o => isC || (o.items || []).some(it => prodById(it.productId) || isX(it.productId))))
    } catch (e) { setErr(aiErrorText(e)) }
    finally { setBusy(false) }
  }

  const apply = () => {
    const picks = (results || []).filter((_, i) => checked[i])
    if (!picks.length) { toast('넣을 항목을 골라 주세요.'); return }
    if (isC) {
      let add = 0, upd = 0
      picks.forEach(c => {
        const dup = dupOf(c)
        const fields = { name: c.name, contractNo: c.contractNo || '', phone: c.phone || '', course: c.course ?? null, payment: PAY[c.payment] ? c.payment : 'card', member: !!c.member, bill: c.bill === 'paper' ? 'paper' : 'mobile' }
        const loc = { type: LOC_TYPES[c.type] ? c.type : 'apt', building: String(c.building || ''), unit: String(c.unit || ''), label: c.label || '' }
        if (dup) { Object.assign(dup, Object.fromEntries(Object.entries(fields).filter(([, v]) => v !== '' && v != null))); dup.loc = { ...dup.loc, ...Object.fromEntries(Object.entries(loc).filter(([, v]) => v)) }; upd++ }
        else { const n = normCust({ ...fields, loc, regular: [] }); S.customers.push(n); logChange({ cid: n.id, from: TODAY(), to: '', kind: '고객 정보', text: '새 고객 (가져오기)', by: 'AI' }); add++ }
      })
      ensureRouteOrder(); save('customers', 'config', 'log'); closeSheet()
      toast(`새 고객 ${add}명, 갱신 ${upd}명. 정기 품목은 고객 카드에서 넣어 주세요.`)
    } else {
      const made = picks.map(o => {
        const c = o.customerId ? custById(o.customerId) : null
        return normOrder({
          type: ORDER_TYPES.includes(o.type) ? o.type : 'adhoc', customerId: c ? c.id : null, name: c ? '' : o.name,
          loc: c ? null : { type: isNumB(o.building) ? 'apt' : 'store', building: String(o.building || ''), unit: String(o.unit || ''), label: '' },
          date: /^\d{4}-\d\d-\d\d$/.test(o.date || '') ? o.date : defaultOrderDate(),
          items: (o.items || []).filter(it => prodById(it.productId) || isX(it.productId)).map(it => ({ productId: isX(it.productId) ? xId(it.productId.slice(2)) : it.productId, qty: Math.max(1, Math.round(+it.qty || 1)) })),
          note: o.note || '',
        })
      }).filter(o => o.items.length)
      if (!made.length) { toast('제품이 확인된 주문이 없어요. 주문 추가 양식으로 넣어 주세요.'); return }
      const mark = logMark()
      S.orders.push(...made)
      made.forEach(o => { const c = o.customerId ? custById(o.customerId) : null; logChange({ cid: o.customerId, name: c ? '' : o.name, loc: c ? '' : locShort(o.loc), from: o.date, kind: '주문', text: `${TYPE_NAME[o.type]} 주문 ${itemsText(o.items)}${o.note ? ' · ' + o.note : ''}`, by: 'AI' }) })
      ensureRouteOrder(); save('orders', 'config', 'log'); closeSheet()
      const ids = made.map(o => o.id)
      toast(`주문 ${made.length}건을 동선·발주표에 넣었어요`, () => { S.orders = S.orders.filter(o => !ids.includes(o.id)); dropLogsSince(mark); save('orders', 'log') })
    }
  }

  const back = () => { if (onBack) onBack(); else closeSheet() }
  return (
    <>
      <SheetHead title={isC ? '고객 가져오기' : '메시지·사진으로 주문 넣기'} />
      <p className="hint">{isC
        ? 'hy 모바일 고객관리의 “고객조회” 목록 화면을 캡처해서 올리거나, 한 줄에 한 명씩 붙여 넣으세요. 예: 김하늘, 411-304, 010-1234-5678, 카드'
        : '카톡 주문 메시지를 붙여 넣거나 캡처를 올리면 AI가 고객·제품·날짜를 찾아서 주문 초안을 만들어요. 확인 후 넣어요.'}</p>
      <Textarea value={text} onChange={e => setText(e.target.value)} placeholder={isC ? '이름, 동-호, 연락처, 수금(카드/계좌/현금)' : '예: 411동 304호 윌 저지방 2개 수요일에 부탁드려요'} />
      {online && (
        <div className="row">
          <Button asChild><label className="cursor-pointer"><IconImage />사진 고르기<input type="file" accept="image/*" multiple hidden onChange={e => { setFiles([...(e.target.files || [])]); e.target.value = '' }} /></label></Button>
          {files.length > 0 && <span className="hint">사진 {files.length}장</span>}
        </div>
      )}
      {!online && <p className="hint">{isC ? '인터넷이 없어서 줄 단위로만 읽어요.' : '인터넷이 연결되어 있을 때만 읽을 수 있어요. 주문 추가 양식을 이용해 주세요.'}</p>}
      {busy && <p className="hint">AI가 읽는 중…</p>}
      {err && <p className="warnbox" style={{ margin: 0 }}>{err}</p>}
      {results && (
        <div className="aires">
          {!results.length ? <p className="warnbox" style={{ margin: 0 }}>찾은 항목이 없어요.</p> : <b>{isC ? `${results.length}명 찾음` : `주문 ${results.length}건`}</b>}
          {results.map((r, i) => {
            const toggle = v => setChecked(ch => ch.map((x, j) => (j === i ? !!v : x)))
            if (isC) {
              const dup = dupOf(r)
              return (
                <label key={i}><Checkbox checked={!!checked[i]} onCheckedChange={toggle} className="mt-0.5 size-[18px]" />
                  <span><b>{r.name}</b> <Plate loc={{ building: r.building, unit: r.unit }} sm /> <span className="muted">{r.label} {r.phone} · {PAY[r.payment] || ''}</span>{dup && <> <Badge variant="acc">기존 고객 정보 갱신</Badge></>}</span>
                </label>
              )
            }
            const c = r.customerId ? custById(r.customerId) : null
            const items = (r.items || []).filter(it => prodById(it.productId) || isX(it.productId))
            return (
              <label key={i}><Checkbox checked={!!checked[i]} onCheckedChange={toggle} className="mt-0.5 size-[18px]" />
                <span style={{ display: 'grid', gap: 4 }}>
                  <span className="row" style={{ gap: 6 }}>
                    <Badge variant={ORDER_TYPES.includes(r.type) ? r.type : 'adhoc'}>{TYPE_NAME[r.type] || '추가'}</Badge>
                    <b>{c ? c.name : (r.name || '이름 없음')}</b> <Plate loc={c ? c.loc : { building: r.building, unit: r.unit }} sm />
                    {!c && <Badge variant="warn">새 배달지</Badge>}
                  </span>
                  <span className="muted">{fmt(r.date)}{r.note ? ' · ' + r.note : ''}</span>
                  <span className="its">{items.length ? items.map((it, k) => <ProductName key={k} full pid={isX(it.productId) ? xId(it.productId.slice(2)) : it.productId} qty={Math.max(1, Math.round(+it.qty || 1))} />) : <span className="muted">제품 확인 필요</span>}</span>
                </span>
              </label>
            )
          })}
          {results.length > 0 && <Button variant="primary" onClick={apply}>{isC ? '선택한 고객 넣기' : '선택한 주문 넣기'}</Button>}
        </div>
      )}
      <SheetActions>
        <Button onClick={back}>{onBack ? '주문 양식으로' : '닫기'}</Button>
        <Button variant="primary" disabled={busy} onClick={run}>{busy ? '읽는 중…' : online ? '읽기' : (isC ? '줄 단위로 읽기' : '읽기')}</Button>
      </SheetActions>
    </>
  )
}

export function openAIImport(mode, opts = {}) {
  openSheet(<ImportSheet mode={mode} onBack={opts.onBack} />)
}
