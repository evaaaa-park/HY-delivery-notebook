// Route side sheets: move a stop to a position, reset/save the order, the route as a picture.
import { useMemo, useState } from 'react'
import { S, useStore } from '@/store/state'
import { openSheet, closeSheet, SheetHead, SheetActions } from '@/lib/sheet'
import { fmt } from '@/lib/dates'
import { toast } from '@/lib/toast'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Field, Plate } from '@/components/common'
import { orderedStops } from '@/domain/stops'
import { routeImageBlob } from '@/domain/route-image'
import { setSeq, seqReset, saveAsBase } from '@/actions/route'

const wide = () => matchMedia('(min-width:700px)').matches

/* ---------- 순서 옮기기 ---------- */
export function openMoveTo(date, key) { openSheet(<MoveToSheet date={date} stopKey={key} />) }

function MoveToSheet({ date, stopKey }) {
  useStore()
  const stops = orderedStops(date); const i = stops.findIndex(s => s.key === stopKey); const st = stops[i]
  const [n, setN] = useState(String(i + 1))
  const go = () => {
    const v = Math.max(1, Math.min(stops.length, Math.round(+n || 1)))
    const keys = stops.map(s => s.key).filter(k => k !== stopKey); keys.splice(v - 1, 0, stopKey)
    closeSheet(); setSeq(date, keys)
  }
  return (
    <>
      <SheetHead title="순서 옮기기" />
      <p style={{ margin: 0 }}><b>{st?.name || ''}</b> <Plate loc={st?.loc} /> · 지금 {i + 1}번</p>
      <Field label={`몇 번으로? (1–${stops.length})`} htmlFor="mvN">
        <Input type="number" id="mvN" min={1} max={stops.length} inputMode="numeric" value={n} autoFocus={wide()}
          onChange={e => setN(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') go() }} />
      </Field>
      <div className="row">
        <Button onClick={() => setN('1')}>맨 앞</Button>
        <Button onClick={() => setN(String(stops.length))}>맨 뒤</Button>
      </div>
      <SheetActions>
        <Button onClick={closeSheet}>취소</Button>
        <Button variant="primary" onClick={go}>옮기기</Button>
      </SheetActions>
    </>
  )
}

/* ---------- 순서 (reset / save as base) ---------- */
export function openRouteMore(date) { openSheet(<RouteMoreSheet date={date} />) }

function RouteMoreSheet({ date }) {
  useStore()
  const custom = !!S.days[date]?.seq
  return (
    <>
      <SheetHead title={`${fmt(date)} 순서`} />
      <Button disabled={!custom} onClick={() => seqReset(date)}>자동 동선으로 되돌리기</Button>
      <p className="hint">이 날짜에 끌어서 바꾼 순서를 지우고, 기본 동선 순서(동 순서 → 출입구 라인 → 층)로 다시 정렬해요.</p>
      <Button variant="primary" onClick={() => saveAsBase(date)}>지금 순서를 기본 동선으로 저장</Button>
      <p className="hint">다른 날짜에도 이 고객들은 이 순서로 나와요. 새 고객은 가까운 위치에 자동으로 끼워져요.</p>
    </>
  )
}

/* ---------- route list as a picture ---------- */
export async function saveRouteImage(date) {
  toast('사진을 만드는 중이에요')
  let blob
  try { blob = await routeImageBlob(date) } catch { blob = null }
  if (!blob) { toast('사진을 만들지 못했어요. 다시 눌러 주세요.'); return }
  const url = URL.createObjectURL(blob)
  openSheet(<RouteImageSheet date={date} blob={blob} url={url} />, () => URL.revokeObjectURL(url))
}

function RouteImageSheet({ date, blob, url }) {
  const filename = `배달동선_${date}.png`
  const file = useMemo(() => { try { return new File([blob], filename, { type: 'image/png' }) } catch { return null } }, [blob, filename])
  const canShare = !!(file && navigator.canShare?.({ files: [file] }))
  const share = async () => {
    try { await navigator.share({ files: [file], title: `${fmt(date)} 배달 동선` }) }
    catch (e) { if (e?.name !== 'AbortError') toast('공유하지 못했어요. 사진을 길게 눌러 저장해 보세요.') }
  }
  return (
    <>
      <SheetHead title={`${fmt(date)} 동선 사진`} />
      <img src={url} alt={`${fmt(date)} 배달 동선 리스트`} style={{ width: '100%', border: '1px solid var(--line)', borderRadius: 10, background: '#fff' }} />
      <p className="hint">iPad·iPhone에서는 사진을 길게 누르면 “사진 앱에 저장”이 나와요.</p>
      <SheetActions>
        <Button onClick={closeSheet}>닫기</Button>
        {canShare
          ? <Button variant="primary" onClick={share}>공유·저장</Button>
          : <Button variant="primary" asChild><a href={url} download={filename}>파일로 저장</a></Button>}
      </SheetActions>
    </>
  )
}
