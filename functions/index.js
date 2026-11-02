// 헬리오 배달수첩 server functions.
//
// `ai` is the only function: a thin proxy between the app and the AI API so the API key stays on the
// server (Secret Manager) instead of inside the app, where anyone could copy it.
//   mode 'chat'    one assistant step: the app sends the conversation and its tool list, gets the model's
//                  reply back (text streamed while it is written). Tools run in the app, on the app's data,
//                  and the app calls again with the tool results until the reply is final.
//   mode 'extract' read customers or orders out of pasted text / screenshots, as schema-checked JSON.
//
// Only signed-in, approved users can call it (same rule as the database).
// Set the key once with:  firebase functions:secrets:set ANTHROPIC_API_KEY
import { onCall, HttpsError } from 'firebase-functions/v2/https'
import { setGlobalOptions } from 'firebase-functions/v2'
import { defineSecret } from 'firebase-functions/params'
import { logger } from 'firebase-functions'
import { initializeApp } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'
import Anthropic from '@anthropic-ai/sdk'

initializeApp()
setGlobalOptions({ region: 'asia-northeast3', maxInstances: 5 })

const AI_KEY = defineSecret('ANTHROPIC_API_KEY')
// Keep in sync with firestore.rules (isOwner) and src/store/auth.js (OWNER_EMAILS).
const OWNERS = ['goochoi913@gmail.com']
// AI level chosen in the app (설정 > AI). The app only shows the level, never the model.
//   fast      cheapest and quickest; fine for questions and simple changes
//   balanced  most changes done right at about half the cost of best
//   best      most reliable with ambiguous customers/dates and messy screenshots (default)
const TIERS = {
  fast: { model: 'claude-haiku-5-5', fallback: false }, // no server-side fallback exists for this model
  balanced: { model: 'claude-sonnet-5-5', fallback: true },
  best: { model: 'claude-opus-5-5', fallback: true },
}
const tierOf = t => TIERS[t] || TIERS.best
const CHAT_EFFORT = 'medium' // thinking depth for the assistant; 'low' is faster/cheaper, 'high' more careful
const FALLBACK = { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' } // a declined request is retried on another model

async function requireApproved(auth) {
  if (!auth) throw new HttpsError('unauthenticated', 'sign-in required')
  const email = String(auth.token?.email || '').toLowerCase()
  if (auth.token?.email_verified === true && OWNERS.includes(email)) return
  const snap = await getFirestore().doc(`users/${auth.uid}`).get()
  if (snap.get('status') !== 'approved') throw new HttpsError('permission-denied', 'not approved')
}

function toHttpsError(e) {
  if (e instanceof HttpsError) return e
  if (e instanceof Anthropic.AuthenticationError || e instanceof Anthropic.PermissionDeniedError) return new HttpsError('failed-precondition', 'ai-key')
  if (e instanceof Anthropic.RateLimitError) return new HttpsError('resource-exhausted', 'rate-limited')
  if (e instanceof Anthropic.BadRequestError) return new HttpsError('invalid-argument', e.message?.slice(0, 500) || 'bad request')
  if (e instanceof Anthropic.APIConnectionError || e instanceof Anthropic.InternalServerError) return new HttpsError('unavailable', 'ai-unavailable')
  if (e instanceof Anthropic.APIError && (e.status === 529 || e.status >= 500)) return new HttpsError('unavailable', 'ai-unavailable')
  return new HttpsError('internal', 'ai-error')
}

/* ---------- chat: one model step with the app's tools ---------- */
async function chatStep(client, d, request, response) {
  const { system, messages, tools } = d
  if (typeof system !== 'string' || !system.trim()) throw new HttpsError('invalid-argument', 'system required')
  if (!Array.isArray(messages) || !messages.length) throw new HttpsError('invalid-argument', 'messages required')
  const T = tierOf(d.tier)
  const stream = client.beta.messages.stream({
    model: T.model,
    max_tokens: 16000,
    ...(T.fallback ? FALLBACK : {}),
    thinking: { type: 'adaptive' },
    output_config: { effort: CHAT_EFFORT },
    // static instructions are cached; the conversation prefix is cached automatically within a step loop
    system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }],
    cache_control: { type: 'ephemeral' },
    tools: Array.isArray(tools) && tools.length ? tools : undefined,
    messages,
  })
  let chain = Promise.resolve()
  stream.on('text', delta => { chain = chain.then(() => response?.sendChunk({ text: delta })).catch(() => {}) })
  const msg = await stream.finalMessage()
  await chain
  logger.info('ai chat step', { uid: request.auth?.uid, model: T.model, stop: msg.stop_reason, usage: msg.usage })
  return { content: msg.content, stop_reason: msg.stop_reason, usage: msg.usage }
}

/* ---------- extract: customers / orders as JSON ---------- */
const str = { type: 'string' }
const SCHEMAS = {
  customers: {
    type: 'object', additionalProperties: false, required: ['customers'],
    properties: {
      customers: {
        type: 'array',
        items: {
          type: 'object', additionalProperties: false,
          required: ['name', 'contractNo', 'building', 'unit', 'label', 'type', 'phone', 'course', 'payment', 'member', 'bill'],
          properties: {
            name: str, contractNo: str, building: str, unit: str, label: str, phone: str,
            type: { type: 'string', enum: ['apt', 'office', 'security', 'store', 'community'] },
            course: { anyOf: [{ type: 'integer' }, { type: 'null' }] },
            payment: { type: 'string', enum: ['card', 'account', 'cash'] },
            member: { type: 'boolean' },
            bill: { type: 'string', enum: ['mobile', 'paper'] },
          },
        },
      },
    },
  },
  orders: {
    type: 'object', additionalProperties: false, required: ['orders'],
    properties: {
      orders: {
        type: 'array',
        items: {
          type: 'object', additionalProperties: false,
          required: ['type', 'customerId', 'name', 'building', 'unit', 'date', 'items', 'note'],
          properties: {
            type: { type: 'string', enum: ['fredit', 'sample', 'prepaid', 'adhoc', 'pickup'] },
            customerId: { anyOf: [{ type: 'string' }, { type: 'null' }] },
            name: str, building: str, unit: str, note: str,
            date: { type: 'string', format: 'date' },
            items: {
              type: 'array',
              items: { type: 'object', additionalProperties: false, required: ['productId', 'qty'], properties: { productId: str, qty: { type: 'integer' } } },
            },
          },
        },
      },
    },
  },
}

async function extract(client, d, request) {
  const schema = SCHEMAS[d.kind]
  if (!schema) throw new HttpsError('invalid-argument', 'kind must be customers or orders')
  if (typeof d.prompt !== 'string' || !d.prompt.trim()) throw new HttpsError('invalid-argument', 'prompt required')
  const images = (Array.isArray(d.images) ? d.images : []).slice(0, 8)
  const content = [
    ...images.map(img => ({ type: 'image', source: { type: 'base64', media_type: img.type, data: img.data } })),
    { type: 'text', text: d.prompt },
  ]
  const T = tierOf(d.tier)
  const msg = await client.beta.messages.create({
    model: T.model,
    max_tokens: 16000,
    ...(T.fallback ? FALLBACK : {}),
    thinking: { type: 'adaptive' },
    output_config: { effort: 'low', format: { type: 'json_schema', schema } },
    messages: [{ role: 'user', content }],
  })
  logger.info('ai extract', { uid: request.auth?.uid, model: T.model, kind: d.kind, stop: msg.stop_reason, usage: msg.usage })
  if (msg.stop_reason === 'refusal') throw new HttpsError('failed-precondition', 'refused')
  if (msg.stop_reason === 'max_tokens') throw new HttpsError('out-of-range', 'too-long')
  const text = msg.content.filter(b => b.type === 'text').map(b => b.text).join('')
  try { return { json: JSON.parse(text) } } catch { throw new HttpsError('data-loss', 'invalid-json') }
}

export const ai = onCall(
  { secrets: [AI_KEY], timeoutSeconds: 540, memory: '512MiB', concurrency: 10 },
  async (request, response) => {
    await requireApproved(request.auth)
    const d = request.data || {}
    if (JSON.stringify(d).length > 15_000_000) throw new HttpsError('invalid-argument', 'too large')
    const client = new Anthropic({ apiKey: AI_KEY.value() || 'missing', maxRetries: 2, timeout: 500_000 })
    try {
      if (d.mode === 'extract') return await extract(client, d, request)
      return await chatStep(client, d, request, response)
    } catch (e) {
      logger.warn('ai failed', { uid: request.auth?.uid, err: e?.message, status: e?.status })
      throw toHttpsError(e)
    }
  },
)
