// Paper bill (종이 청구서) list: who still needs a bill and on which delivery it can go out.
import { useState } from 'react'
import { useStore } from '@/store/state'
import { openSheet, closeSheet, SheetHead, SheetActions } from '@/lib/sheet'
import { fmt } from '@/lib/dates'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Plate } from '@/components/common'
import { STATUS_NAME } from '@/domain/constants'
import { billStatus } from '@/domain/bills'
import { billGive, billUndo, billEnd } from '@/actions/route'

export function openBills() {
  if (!billStatus()) return
  openSheet(<BillsSheet />)
}

function BillsSheet() {
  useStore()
  const [sure, setSure] = useState(false)
  const st = billStatus()
  if (!st) return <SheetHead title="종이 청구서" />
  return (
    <>
      <SheetHead title={st.B.label} />
      <p className="hint">{st.rows.length - st.left.length}/{st.rows.length}명 전달 · 청구서를 주고 나서 동선의 청구서 아이콘을 누르거나, 여기서 “전달함”을 눌러요. 배달 체크만으로는 바뀌지 않아요.</p>
      <div className="card" style={{ padding: '4px 0' }}>
        {st.rows.map(r => (
          <div className="todo" key={r.id}>
            <Plate loc={r.c.loc} sm />
            <div className="t">
              <b>{r.c.name}</b>
              <small>{r.given ? `${fmt(r.given)} 전달함` : r.next ? `${fmt(r.next)} 배달 때 전달` : `배달 없음${r.c.status !== 'active' ? ' · ' + STATUS_NAME[r.c.status] : ''} · 따로 전달`}</small>
            </div>
            {r.given
              ? (st.B.given[r.id] ? <Button size="sm" variant="ghost" onClick={() => billUndo(r.id)}>취소</Button> : <Badge size="xs" variant="ok">완료</Badge>)
              : <Button size="sm" onClick={() => billGive(r.id)}>전달함</Button>}
          </div>
        ))}
      </div>
      <SheetActions>
        <Button onClick={() => { if (!billEnd(sure)) setSure(true) }}>
          {sure && st.left.length ? `${st.left.length}명 남았어요 · 한 번 더 누르면 끝내기` : '목록 끝내기'}
        </Button>
        <Button variant="primary" onClick={closeSheet}>닫기</Button>
      </SheetActions>
    </>
  )
}
