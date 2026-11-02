// Google sign-in with manual approval.
// - The owner email is approved by the Firestore rules themselves (cannot be locked out).
// - Everyone else gets users/{uid} with status 'pending' on first sign-in and waits until an approved
//   user approves them (Settings > 사용자). Every approved user has the same role.
// - Approval is remembered on the device so the app opens offline.
import {
  onAuthStateChanged, GoogleAuthProvider, signInWithPopup, signInWithRedirect, getRedirectResult,
  signInWithCredential, signOut as fbSignOut,
} from 'firebase/auth'
import { doc, onSnapshot, setDoc, updateDoc, collection, serverTimestamp } from 'firebase/firestore'
import { auth, db, EMULATOR } from '@/firebase'
import { emit } from './state'
import { startSync, stopSync, hasPending } from './sync'

// Keep in sync with firestore.rules (isOwner) and functions/index.js (OWNERS).
export const OWNER_EMAILS = ['goochoi913@gmail.com']
export const isOwnerEmail = e => OWNER_EMAILS.includes(String(e || '').toLowerCase())

// status: loading | signedOut | checking | pending | rejected | approved
export const session = { status: 'loading', user: null, profile: null, error: '' }

const LS_APPROVED = 'helio-approved-uid'
let unsubProfile = null

function setStatus(s) { session.status = s; emit() }
function approve(user) {
  try { localStorage.setItem(LS_APPROVED, user.uid) } catch { /* ignore */ }
  startSync()
  setStatus('approved')
}
function holdBack(status) {
  try { localStorage.removeItem(LS_APPROVED) } catch { /* ignore */ }
  stopSync()
  setStatus(status)
}

async function createProfile(user) {
  try {
    await setDoc(doc(db, 'users', user.uid), {
      uid: user.uid, email: (user.email || '').toLowerCase(), name: user.displayName || '', photo: user.photoURL || '',
      status: isOwnerEmail(user.email) ? 'approved' : 'pending', createdAt: serverTimestamp(),
    })
  } catch (e) { session.error = e?.code || 'error'; emit() }
}

onAuthStateChanged(auth, user => {
  unsubProfile?.(); unsubProfile = null
  session.user = user; session.profile = null; session.error = ''
  if (!user) { holdBack('signedOut'); return }
  let cached = false
  try { cached = localStorage.getItem(LS_APPROVED) === user.uid } catch { /* ignore */ }
  if (cached || isOwnerEmail(user.email)) approve(user)
  else setStatus('checking')
  unsubProfile = onSnapshot(doc(db, 'users', user.uid), snap => {
    if (!snap.exists()) {
      if (!snap.metadata.fromCache) createProfile(user)
      return
    }
    const p = snap.data(); session.profile = p
    if (p.status === 'approved' || isOwnerEmail(user.email)) { if (session.status !== 'approved') approve(user); else emit() }
    else holdBack(p.status === 'rejected' ? 'rejected' : 'pending')
  }, err => { session.error = err?.code || 'error'; emit() })
})

getRedirectResult(auth).catch(e => { session.error = e?.code || 'error'; emit() })

const provider = new GoogleAuthProvider()
provider.setCustomParameters({ prompt: 'select_account' })

const isStandalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true
const isMobile = () => /iPhone|iPad|iPod|Android/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)

export async function signIn() {
  session.error = ''; emit()
  if (EMULATOR) return signInWithPopup(auth, provider)
  // Home-screen apps and phones: full-page redirect (popups are unreliable there).
  if (isStandalone() || isMobile()) return signInWithRedirect(auth, provider)
  try { await signInWithPopup(auth, provider) }
  catch (e) {
    if (e?.code === 'auth/popup-blocked' || e?.code === 'auth/operation-not-supported-in-this-environment') return signInWithRedirect(auth, provider)
    if (e?.code !== 'auth/popup-closed-by-user' && e?.code !== 'auth/cancelled-popup-request') { session.error = e?.code || 'error'; emit() }
  }
}

export async function signOut() {
  try { localStorage.removeItem(LS_APPROVED) } catch { /* ignore */ }
  stopSync()
  await fbSignOut(auth)
}
export const signOutRisky = () => hasPending()

// Emulator only: sign in as any Google account without the Google page (used for local testing).
if (EMULATOR && typeof window !== 'undefined') {
  window.__devSignIn = (email, name = '테스트') => signInWithCredential(auth, GoogleAuthProvider.credential(JSON.stringify({ sub: 'dev-' + email, email, email_verified: true, name })))
}

/* ---------- user management (approved users) ---------- */
export function listenUsers(cb) {
  return onSnapshot(collection(db, 'users'), snap => cb(snap.docs.map(d => ({ id: d.id, ...d.data() }))), () => cb([]))
}
export function setUserStatus(uid, status) {
  return updateDoc(doc(db, 'users', uid), { status, decidedBy: (session.user?.email || '').toLowerCase(), decidedAt: serverTimestamp() })
}
