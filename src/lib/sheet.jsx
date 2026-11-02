// One edit sheet at a time (bottom sheet on phones, right-side panel on iPad), like the original notebook.
//   openSheet(<CustomerSheet id={...} />)   closeSheet()
// A sheet component renders <SheetHead title="..."/> first and <SheetActions> at the end.
import { useSyncExternalStore, useEffect } from 'react'
import { Dialog as SheetPrimitive } from 'radix-ui'
import { Sheet, SheetContent } from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { useMediaQuery } from '@/lib/hooks'
import { cn } from '@/lib/util'

let current = null // { key, el, onClose }
const subs = new Set()
const notify = () => subs.forEach(f => f())
const subscribe = cb => { subs.add(cb); return () => subs.delete(cb) }

export function openSheet(el, onClose) {
  const prev = current
  current = { key: Date.now() + Math.random(), el, onClose }
  notify()
  prev?.onClose?.()
}
export function closeSheet() {
  const c = current
  if (!c) return
  current = null
  notify()
  c.onClose?.()
}
export const sheetOpen = () => !!current

export function SheetHost() {
  const cur = useSyncExternalStore(subscribe, () => current)
  const tablet = useMediaQuery('(min-width: 744px)')
  useEffect(() => {
    const onKey = e => { if (e.key === 'Escape' && current) closeSheet() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
  return (
    <Sheet open={!!cur} onOpenChange={o => { if (!o) closeSheet() }}>
      <SheetContent
        key={cur?.key}
        side={tablet ? 'right' : 'bottom'}
        showCloseButton={false}
        aria-describedby={undefined}
        overlayClassName="bg-[rgba(8,12,20,.45)] supports-backdrop-filter:backdrop-blur-none"
        onOpenAutoFocus={e => { if (!tablet) e.preventDefault() }}
        className={cn(
          'app-panel grid content-start gap-3.5 overflow-y-auto overscroll-contain bg-bg text-[15px] text-ink shadow-none',
          'data-[side=bottom]:max-h-[92dvh] data-[side=bottom]:rounded-t-[18px] data-[side=bottom]:border-line',
          'data-[side=bottom]:px-[max(16px,env(safe-area-inset-left))] data-[side=bottom]:pt-1.5 data-[side=bottom]:pb-[calc(18px+env(safe-area-inset-bottom))]',
          'data-[side=right]:w-[min(500px,100%)] data-[side=right]:sm:max-w-none data-[side=right]:border-line',
          'data-[side=right]:px-[max(22px,env(safe-area-inset-right))] data-[side=right]:pt-[calc(16px+env(safe-area-inset-top))] data-[side=right]:pb-[calc(18px+env(safe-area-inset-bottom))]',
        )}
      >
        {!tablet && <div aria-hidden className="mx-auto mt-1 h-1 w-10 rounded-full bg-line" />}
        {cur?.el}
      </SheetContent>
    </Sheet>
  )
}

export function SheetHead({ title, children }) {
  return (
    <div className="sh">
      <SheetPrimitive.Title asChild><h2>{title}</h2></SheetPrimitive.Title>
      <div className="row" style={{ gap: 6 }}>
        {children}
        <Button size="sm" variant="ghost" onClick={closeSheet}>닫기</Button>
      </div>
    </div>
  )
}

export function SheetActions({ children, className }) {
  return <div className={cn('sact', className)}>{children}</div>
}
