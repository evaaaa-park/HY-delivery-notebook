import { useEffect } from 'react'
import { useStore } from '@/store/state'
import { session } from '@/store/auth'
import { onSaveError } from '@/store/sync'
import { SheetHost } from '@/lib/sheet'
import { ConfirmHost } from '@/lib/confirm'
import { toast } from '@/lib/toast'
import { Toaster } from '@/components/ui/sonner'
import { Splash, Login, Waiting } from '@/shell/Gate'
import Notebook from '@/shell/Notebook'
import UpdatePrompt from '@/shell/UpdatePrompt'

const SAVE_ERRORS = {
  'permission-denied': '서버 저장 권한이 없어요. 승인 상태를 확인해 주세요.',
  'resource-exhausted': '저장 공간이나 사용량 한도에 걸렸어요. 잠시 뒤에 다시 해 주세요.',
  'invalid-argument': '저장할 수 없는 값이 있어요.',
}

export default function App() {
  useStore()
  useEffect(() => {
    onSaveError(err => toast(SAVE_ERRORS[err?.code] || `서버에 저장하지 못했어요 (${err?.code || '오류'}). 이 기기에는 남아 있어요.`))
    // ask the browser to keep this app's storage (offline data) even when the device is low on space
    navigator.storage?.persist?.().catch(() => {})
  }, [])
  let screen
  if (session.status === 'loading' || session.status === 'checking') screen = <Splash />
  else if (session.status === 'signedOut') screen = <Login />
  else if (session.status === 'pending' || session.status === 'rejected') screen = <Waiting />
  else screen = <Notebook />
  return (
    <>
      {screen}
      <SheetHost />
      <ConfirmHost />
      <Toaster position="bottom-center" offset={{ bottom: 'calc(var(--nav-h) + 80px + env(safe-area-inset-bottom))' }} mobileOffset={{ bottom: 'calc(var(--nav-h) + 80px + env(safe-area-inset-bottom))' }} />
      <UpdatePrompt />
    </>
  )
}
