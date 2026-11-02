import { toast as sonner } from 'sonner'

// toast('저장했어요') or toast('삭제했어요', () => undo())  (undo shows a 되돌리기 button for 6 seconds)
export function toast(msg, undo) {
  sonner(msg, {
    duration: undo ? 6000 : 3200,
    action: undo ? { label: '되돌리기', onClick: () => undo() } : undefined,
  })
}
