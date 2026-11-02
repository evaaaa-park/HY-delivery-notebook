// Talking to the `ai` Cloud Function. The app never names the AI model or provider: it is always "AI".
import { httpsCallable } from 'firebase/functions'
import { functions } from '@/firebase'
import { S } from '@/store/state'

const tier = () => S.config.aiTier || 'best'

const call = httpsCallable(functions, 'ai', { timeout: 540_000 })

export const AI_ERRORS = {
  'ai-key': 'AI 키가 아직 설정되지 않았어요. 관리자에게 알려 주세요.',
  refused: '이 요청은 처리하지 못했어요.',
  'rate-limited': '요청이 많아요. 잠시 뒤에 다시 보내 주세요.',
  'too-long': '내용이 길어서 끝까지 읽지 못했어요. 나눠서 보내 주세요.',
  'invalid-json': '읽은 결과를 정리하지 못했어요. 다시 해 보세요.',
}
export function aiErrorText(e) {
  const code = String(e?.code || '').replace(/^functions\//, '')
  const msg = String(e?.message || '').replace(/\s*\[\d+\]$/, '') // the SDK appends the HTTP status, e.g. "ai-key [400]"
  if (e?.name === 'AbortError' || code === 'cancelled') return '멈췄어요.'
  if (AI_ERRORS[msg]) return AI_ERRORS[msg]
  if (code === 'unauthenticated') return '다시 로그인해 주세요.'
  if (code === 'permission-denied') return 'AI를 쓸 권한이 없어요. 승인 상태를 확인해 주세요.'
  if (code === 'resource-exhausted') return AI_ERRORS['rate-limited']
  if (code === 'not-found') return 'AI 기능이 아직 준비되지 않았어요.'
  if (code === 'invalid-argument') return '요청을 처리하지 못했어요. 사진 크기나 내용을 확인해 주세요.'
  if (!navigator.onLine) return 'AI는 인터넷이 연결되어 있을 때만 쓸 수 있어요.'
  return '연결 문제로 끝까지 답하지 못했어요. 다시 보내 주세요.'
}

// One assistant step. onText receives the reply text as it is written.
export async function chatStep({ system, messages, tools }, { onText, signal } = {}) {
  const res = await call.stream({ mode: 'chat', tier: tier(), system, messages, tools }, { signal })
  res.data.catch(() => {}) // if the stream fails first, the same error is thrown below; avoid an unhandled rejection
  for await (const chunk of res.stream) { if (chunk?.text) onText?.(chunk.text) }
  return await res.data
}

// Structured read of customers/orders from text and screenshots.
export async function extract({ kind, prompt, images }) {
  const res = await call({ mode: 'extract', tier: tier(), kind, prompt, images })
  return res.data?.json
}

// Photos -> JPEG base64 (max 1600px, enough to read a phone screenshot, small enough to upload on LTE).
export async function prepareImages(files, max = 1600) {
  const out = []
  for (const f of [...(files || [])].slice(0, 6)) {
    const bmp = await createImageBitmap(f)
    const scale = Math.min(1, max / Math.max(bmp.width, bmp.height))
    const w = Math.round(bmp.width * scale), h = Math.round(bmp.height * scale)
    const cv = document.createElement('canvas'); cv.width = w; cv.height = h
    const x = cv.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, w, h); x.drawImage(bmp, 0, 0, w, h)
    bmp.close?.()
    const url = cv.toDataURL('image/jpeg', 0.85)
    out.push({ type: 'image/jpeg', data: url.slice(url.indexOf(',') + 1), preview: url })
  }
  return out
}
