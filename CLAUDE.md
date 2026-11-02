# 헬리오 배달수첩 (HY Delivery Notebook)

Route, ordering and customer notebook for one hy (Korea Yakult) delivery manager in Songpa Helio City, Seoul.
She uses it every working day as a home-screen app on iPad and iPhone, often without a connection.
It is an offline-first PWA: Vite + React (JavaScript) + shadcn/ui + Firebase (Auth, Firestore, Functions, Hosting).

## Strict rules

- **AI naming (permanent rule):** the app never names the AI model or provider in labels, settings, messages, or errors; it is always "AI."
- **UI:** shadcn/ui components, icons from react-icons.
- **Secrets:** never commit API keys, service-account files, tokens, passwords, or PINs.
- **Commits carry no attribution trailers.** No co-authored-by line, no session line, and no "generated with" footer—in commit messages or pull request bodies. Every commit is authored solely as the git user is configured.
- **Conventional Commits v1.0.0:** `<type>[(scope)][!]: <imperative description>`, blank line, body, blank line, footers. Types: feat, fix, docs, refactor, test, chore, perf, build, ci, style.
- **Commit far less often:** one commit per meaningful, self-contained piece of work—a feature, a fix, a refactor, or a runbook. Small things join the commit they belong to. Never commit to one file, per review round, or per step of a session. A day's work is a handful of commits split by type and scope, not by when the edits were made.
- **Git identity:** only the personal GitHub account `goochoi913` (never the work account `goo913`). The repo's own git config sets `user.name goochoi913`, `user.email goochoi913@gmail.com` and a credential helper that pushes with `gh auth token --user goochoi913`.
- **Real customer data never goes into the repo** (the repo is public). `.gitignore` blocks data exports; demo data is generated in code and tagged `예시`.

## Product rules that are easy to break

- **Korean UI.** All user-facing text is Korean. Keep her wording when touching existing screens.
- **Korea time.** Business dates and clock times are KST (`src/lib/dates.js`: `TODAY()`, `hm()`, `dayOf()`, `fmtStamp()`), whichever device opens the app. Never use `new Date().getHours()` / `toLocale*` without `timeZone` for business logic.
- **Never prune data.** History is kept forever on the server. The app only loads a window (orders/days 62 days, perf 100 days, newest 600 log entries) and fetches older data on demand (`ensurePerfMonth`, `loadOlderLog`).
- **Products are shown as photos** (`ProductQty` "[photo] ×4", `ProductImage`). On the route each stop shows its products as big photos under the row; she recognises items at a glance instead of reading names.
- **Offline first.** Every change must work offline: mutate `S`, then `save(...)`. Never block a user action on the network (AI and backup/restore are the only online-only features, and they say so).
- **Order types follow hy's categories:** regular (후불정기), prepaid (선불정기), fredit (일반), sample (견본), adhoc (추가), pickup (회수). Only the types switched on in settings go into the ordering sheet; pickup never does.

## Architecture

```
src/
  domain/      business logic ported from the original single-file app (pure functions over S)
               constants, normalize, model, calendar, location, stops, bills, alerts, log, perf, route-image
  store/       state.js (S + UI + useStore), sync.js (Firestore), auth.js (Google sign-in + approval)
  views/       Home, Customers, Order (T-2 sheet), Route, Records, Settings
  sheets/      bottom/side sheets (stop editor, order form, customer form, bulk edits, bills, records, sync)
  ai/          AI assistant: context.js (what the AI sees), tools.js (what it can do), client.js, assistant.jsx, import-sheet.jsx
  components/  ui/ (shadcn, restyled to the app's look), common.jsx (ProductQty, Plate, Seg, Chip, DayPick…), icons.js (react-icons)
  demo/        demo data (tagged 예시)
functions/     Cloud Function `ai`: proxy to the AI API (key in Secret Manager), approved users only
scripts/       build-images.mjs: product photos (public/products/*.webp) and icons from local sources
```

- **State:** `S` = `{ customers, orders, config, days, log, perf }` exactly like the original app; `UI` = screen state. Components call `useStore()` and read `S`/`UI` directly; mutations change `S` and call `save('customers', 'log', …)`, which persists and re-renders.
- **Sync (`store/sync.js`):** one Firestore document per record (`customers/{id}`, `orders/{id}`, `days/{date}`, `log/{id}`, `perf/{date}`, `settings/main`). `save()` diffs against the last known server version and writes only changed fields (merge), so two devices editing different fields of one record both keep their change. Firestore's IndexedDB cache makes reads and writes work offline; writes queue and sync when online.
- **Auth (`store/auth.js`, `firestore.rules`, `firebase.json` > auth):** Google sign-in, provisioned with `firebase deploy --only auth` (provider, consent-screen name, authorized redirect URIs for web.app and firebaseapp.com). New accounts start `pending` in `users/{uid}`; any approved user can approve others (Settings > 사용자). The owner email is approved by the rules themselves. Keep the owner list in sync in `firestore.rules`, `src/store/auth.js` and `functions/index.js`.
- **AI:** the browser runs the tool loop (tools act on local data, so they work like the buttons), the `ai` function only forwards one step to the AI API and streams text back. Fixed instructions are cached; the current data snapshot is appended as a mid-conversation system message each turn; the last 10 chat messages give conversational memory; the chat is shared between devices (`chat` collection). Each AI turn can be undone (only the records it touched).
- **PWA:** `vite-plugin-pwa` precaches the app shell, product photos and icons; fonts are cached on first use. `/__/` is excluded from the navigation fallback (Firebase sign-in handler).

## Commands

```bash
npm install && (cd functions && npm install)
cp .env.example .env.local     # Firebase web config (gitignored)
npm run dev                    # against the real Firebase project
npm run emulators              # Auth + Firestore + Functions emulators (needs Java 21+)
npm run dev:emu                # app against the emulators; sign in from the console: __devSignIn('you@example.com')
npm run lint
npm run build
npm run images                 # rebuild product photos/icons after adding source images
npm run deploy                 # hosting + Firestore rules
npm run deploy:functions       # the AI function (needs the ANTHROPIC_API_KEY secret)
```

Firebase project: `hy-delivery-notebook` (Firestore in `asia-northeast3`, daily backups kept 14 days). Hosting: https://hy-delivery-notebook.web.app
