import { useSyncExternalStore, useReducer, useRef } from 'react'

export function useMediaQuery(q) {
  return useSyncExternalStore(
    cb => { const m = matchMedia(q); m.addEventListener('change', cb); return () => m.removeEventListener('change', cb) },
    () => matchMedia(q).matches,
  )
}

// A mutable form object plus a refresh(): lets sheet code keep the original notebook's style
// (change the draft object, then re-render) without one useState per field.
export function useDraft(init) {
  const ref = useRef(null)
  if (ref.current === null) ref.current = typeof init === 'function' ? init() : init
  const [, refresh] = useReducer(x => x + 1, 0)
  return [ref.current, refresh]
}
