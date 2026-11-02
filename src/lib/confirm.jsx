// confirmDialog({ title, body, yes: '삭제', danger: true }) -> Promise<boolean>
import { useSyncExternalStore } from 'react'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { buttonVariants } from '@/components/ui/button'

let current = null
const subs = new Set()
const notify = () => subs.forEach(f => f())

export function confirmDialog({ title, body, yes = '확인', no = '취소', danger = true }) {
  return new Promise(resolve => {
    current = { title, body, yes, no, danger, resolve }
    notify()
  })
}
function finish(v) { const c = current; current = null; notify(); c?.resolve(v) }

export function ConfirmHost() {
  const cur = useSyncExternalStore(cb => { subs.add(cb); return () => subs.delete(cb) }, () => current)
  return (
    <AlertDialog open={!!cur} onOpenChange={o => { if (!o) finish(false) }}>
      <AlertDialogContent className="bg-bg">
        <AlertDialogHeader>
          <AlertDialogTitle className="font-display text-[22px] font-normal">{cur?.title}</AlertDialogTitle>
          {cur?.body && <AlertDialogDescription className="text-[15px] text-ink">{cur.body}</AlertDialogDescription>}
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel className={buttonVariants({ variant: 'default' })} onClick={() => finish(false)}>{cur?.no}</AlertDialogCancel>
          <AlertDialogAction className={buttonVariants({ variant: cur?.danger ? 'danger' : 'primary' })} onClick={() => finish(true)}>{cur?.yes}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
