// New app version available: offer a reload instead of reloading in the middle of a delivery.
import { useEffect } from 'react'
import { useRegisterSW } from 'virtual:pwa-register/react'
import { toast } from 'sonner'

export default function UpdatePrompt() {
  const { needRefresh: [needRefresh], updateServiceWorker } = useRegisterSW({
    onRegisteredSW(_url, reg) {
      // home-screen apps can stay open for days: look for a new version every hour and when reopened
      if (!reg) return
      setInterval(() => { if (navigator.onLine) reg.update().catch(() => {}) }, 60 * 60 * 1000)
      document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && navigator.onLine) reg.update().catch(() => {}) })
    },
  })
  useEffect(() => {
    if (!needRefresh) return
    toast('새 버전이 있어요', {
      duration: Infinity, id: 'sw-update',
      action: { label: '새로고침', onClick: () => updateServiceWorker(true) },
    })
  }, [needRefresh, updateServiceWorker])
  return null
}
