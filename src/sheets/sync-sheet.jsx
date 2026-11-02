// "저장 상태": where the data is and what has not reached the server yet.
import { useStore } from '@/store/state'
import { sync, NAMES, pendingNames, reconnect } from '@/store/sync'
import { DOC_NAME } from '@/domain/constants'
import { fmtStamp } from '@/lib/dates'
import { openSheet, closeSheet, SheetHead } from '@/lib/sheet'
import { toast } from '@/lib/toast'
import { Button } from '@/components/ui/button'

function SyncSheet() {
  useStore()
  const online = navigator.onLine !== false
  const pend = pendingNames()
  const live = NAMES.every(n => sync.server[n])
  const when = sync.lastAck ? fmtStamp(sync.lastAck, { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '이 기기에서는 아직 없음'
  return (
    <>
      <SheetHead title="저장 상태" />
      <p style={{ margin: 0 }}>입력하는 순간 이 기기에 먼저 저장되고, 인터넷이 연결되어 있으면 바로 서버에도 저장돼요. 앱을 닫거나 iPad를 꺼도 남아 있고, 같은 데이터를 쓰는 iPhone·iPad·컴퓨터에 실시간으로 나타나요.</p>
      <div className="card slist">
        <div className="it"><div className="t">서버 연결</div><b>{!online ? '오프라인' : live ? '실시간 연결됨' : '연결하는 중'}</b></div>
        <div className="it"><div className="t">이 기기에서 마지막 서버 저장</div><b className="num">{when}</b></div>
        <div className="it"><div className="t">서버에 아직 안 올라간 것</div><b>{pend.length || sync.commits ? (pend.map(n => DOC_NAME[n]).join(', ') || '저장 중') : '없음'}</b></div>
      </div>
      {(pend.length > 0 || sync.commits > 0) && (
        <>
          <p className="hint">신호가 약한 곳(지하 주차장 등)에서는 이 기기에 보관했다가 연결되면 자동으로 올려요. 앱을 닫아도 다음에 열 때 이어서 올려요.</p>
          <Button variant="primary" onClick={() => { reconnect(); closeSheet(); toast('서버에 다시 연결하는 중이에요') }}>지금 다시 연결</Button>
        </>
      )}
      {sync.error === 'permission-denied' && <p className="warnbox" style={{ margin: 0 }}>서버가 저장을 거절했어요. 승인 상태를 확인해 주세요.</p>}
      <p className="hint">두 기기에서 같은 고객이나 같은 날을 오프라인으로 동시에 고치면, 같은 칸은 나중에 저장된 쪽이 남고 서로 다른 칸은 둘 다 남아요.</p>
    </>
  )
}

export function openSyncSheet() { openSheet(<SyncSheet />) }
