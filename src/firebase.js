// Firebase setup. The web config comes from .env.local (never committed).
import { initializeApp } from 'firebase/app'
import { getAuth, connectAuthEmulator } from 'firebase/auth'
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager, connectFirestoreEmulator } from 'firebase/firestore'
import { getFunctions, connectFunctionsEmulator } from 'firebase/functions'

const env = import.meta.env
export const EMULATOR = env.MODE === 'emulator'

// On Firebase Hosting, sign in through the app's own domain (/__/auth/handler is served there).
// Same-origin sign-in keeps working in iPhone/iPad home-screen apps, where cross-site storage is blocked.
const host = typeof location !== 'undefined' ? location.hostname : ''
const onHosting = /\.(web\.app|firebaseapp\.com)$/.test(host)

export const firebaseConfig = {
  apiKey: env.VITE_FIREBASE_API_KEY,
  authDomain: onHosting ? host : env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: env.VITE_FIREBASE_APP_ID,
}

export const app = initializeApp(firebaseConfig)
export const auth = getAuth(app)
auth.languageCode = 'ko'

// Offline-first: every read and write goes through Firestore's IndexedDB cache. Writes made without
// a connection are queued on the device (they survive closing the app) and sent when it comes back.
export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
  ignoreUndefinedProperties: true,
})

export const functions = getFunctions(app, env.VITE_FUNCTIONS_REGION || 'asia-northeast3')

if (EMULATOR) {
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true })
  connectFirestoreEmulator(db, '127.0.0.1', 8080)
  connectFunctionsEmulator(functions, '127.0.0.1', 5001)
}
