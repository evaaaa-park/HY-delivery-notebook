# 헬리오 배달수첩 (HY Delivery Notebook)

Route, ordering and customer notebook for one hy (Korea Yakult) delivery manager in Songpa Helio City, Seoul.
She uses it every working day as a home-screen app on iPad and iPhone, often without a connection.
It is an offline-first PWA: Vite + React (JavaScript) + shadcn/ui + Firebase (Auth, Firestore, Functions, Hosting).

She built version 1 (a single `index.html`) with Claude chat. This repo is version 2 and keeps all of its behaviour.
She owns the app and the GitHub repo (`evaaaa-park/HY-delivery-notebook`) and now develops it herself with Claude Code while studying computer science; `goochoi913` also contributes.
With her: say in plain words what you changed and why, and teach when she asks how something works. She knows the delivery work better than anyone, so ask her about real-world behaviour instead of guessing.

## Strict rules

- **AI naming (permanent rule):** the app never names the AI model or provider in labels, settings, messages, or errors; it is always "AI."
- **UI:** shadcn/ui components, icons from react-icons.
- **Secrets:** never commit API keys, service-account files, tokens, passwords, or PINs.
- **Commits carry no attribution trailers.** No co-authored-by line, no session line, and no "generated with" footer—in commit messages or pull request bodies. Every commit is authored solely as the git user is configured.
- **Conventional Commits v1.0.0:** `<type>[(scope)][!]: <imperative description>`, blank line, body, blank line, footers. Types: feat, fix, docs, refactor, test, chore, perf, build, ci, style.
- **Commit far less often:** one commit per meaningful, self-contained piece of work—a feature, a fix, a refactor, or a runbook. Small things join the commit they belong to. Never commit to one file, per review round, or per step of a session. A day's work is a handful of commits split by type and scope, not by when the edits were made.
- **Git identity:** each clone commits and pushes only as the personal GitHub account of the person who works in it, set in the repo's own (local) git config, never a global, work, or other person's account:
  - her computer: `evaaaa-park` (repo owner), `user.email` = that account's GitHub noreply address (`<id>+evaaaa-park@users.noreply.github.com`, from `gh api user`);
  - his computer: `goochoi913`, `goochoi913@gmail.com`, never the work account `goo913`.

  Pushes go over HTTPS through a credential helper in the same local config that runs `gh auth token --user <account>`, so no other logged-in account can push here. When setting up a new clone, ask whose computer it is.
- **Real customer data never goes into the repo** (the repo is public). `.gitignore` blocks data exports; demo data is generated in code and tagged `예시`.

## Every session

- **Start from the latest code.** Two computers push straight to `main` (no pull requests). Before changing anything, run `git status`; if it is clean, `git pull --rebase`. If there are uncommitted changes from an earlier session, say what they are and ask whether to commit them first.
- **Check before calling it done** (see "Checking a change"). Show the result; a screenshot beats a description.
- **Save:** when a piece of work is done and checked, offer to commit and push it (rules above). Never leave finished work only on one computer.
- **Deploy only when asked.** The live app is her working tool and holds her real customers.
- Keep "Current state" below and `docs/CHANGELOG.md` up to date when they change.

## Product rules that are easy to break

- **Korean UI.** All user-facing text is Korean. Keep her wording when touching existing screens.
- **Korea time.** Business dates and clock times are KST (`src/lib/dates.js`: `TODAY()`, `hm()`, `dayOf()`, `fmtStamp()`), whichever device opens the app. Never use `new Date().getHours()` / `toLocale*` without `timeZone` for business logic.
- **Never prune data.** History is kept forever on the server. The app only loads a window (orders/days 62 days, perf 100 days, newest 600 log entries) and fetches older data on demand (`ensurePerfMonth`, `loadOlderLog`).
- **Photos only where they help, names elsewhere.** The route shows each stop's products as big photos with a large count under the row (`ProductQty big`), because she recognises items at a glance while walking. Photos are also used where she picks a product (order form grid) and in 설정 > 제품. Everywhere else (records, ordering sheet, home, customer cards, sheets) products are a colour dot + name + count (`ProductName`); small thumbnails next to text are not useful.
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
- **Complex map (route):** one tile per building with the unit numbers to deliver, one box per entrance from `config.entrances` (설정 > 출입구 나누기; default 1·2 / 3·4). Do not invent entrance layouts: the real ones come from her saved settings.
- **Auth (`store/auth.js`, `firestore.rules`, `firebase.json` > auth):** Google sign-in, provisioned with `firebase deploy --only auth` (provider, consent-screen name, authorized redirect URIs for web.app and firebaseapp.com). New accounts start `pending` in `users/{uid}`; any approved user can approve others (Settings > 사용자). The owner email is approved by the rules themselves. Keep the owner list in sync in `firestore.rules`, `src/store/auth.js` and `functions/index.js`.
- **AI level (설정 > AI):** `fast` / `balanced` / `best`, stored in `settings/main` (`aiTier`, shared by all users). `functions/index.js` maps it to the model (claude-haiku-5-5 / claude-sonnet-5-5 / claude-opus-5-5); the app shows only the level.
- **AI:** the browser runs the tool loop (tools act on local data, so they work like the buttons), the `ai` function only forwards one step to the AI API and streams text back. Fixed instructions are cached; the current data snapshot is appended as a mid-conversation system message each turn; the last 10 chat messages give conversational memory; the chat is shared between devices (`chat` collection). Each AI turn can be undone (only the records it touched).
- **PWA:** `vite-plugin-pwa` precaches the app shell, product photos and icons; fonts are cached on first use. `/__/` is excluded from the navigation fallback (Firebase sign-in handler).

## Commands

```bash
npm install && (cd functions && npm install)
cp .env.example .env.local     # Firebase web config (gitignored); values: firebase apps:sdkconfig web --project hy-delivery-notebook
npm run dev                    # against the real Firebase project (her real data)
npm run emulators              # Auth + Firestore + Functions emulators (needs Java 21+)
npm run dev:emu                # app against the emulators; sign in from the console: __devSignIn('you@example.com')
npm run lint
npm run build
npm run images                 # rebuild product photos/icons (see "Product photos")
npm run deploy                 # hosting + Firestore rules
npm run deploy:functions       # the AI function (needs the ANTHROPIC_API_KEY secret)
```

Firebase project: `hy-delivery-notebook` (Firestore in `asia-northeast3`, daily backups kept 14 days). Hosting: https://hy-delivery-notebook.web.app

## Setting up a new computer

1. Tools: Git, Node.js 22+, GitHub CLI (`gh`), Firebase CLI (`npm install -g firebase-tools`), and Java 21+ for the emulators.
2. Logins are interactive, so the person runs them: `gh auth login` (their own GitHub account) and `firebase login` (their Google account that is a member of the Firebase project). Tell them exactly what to type and wait.
3. `npm install && (cd functions && npm install)`.
4. `.env.local`: copy `.env.example` and fill in the values from `firebase apps:sdkconfig web --project hy-delivery-notebook`.
5. Local git config: identity and credential helper as in "Git identity".
6. Check: `npm run lint && npm run build`, then open the app against the emulators (below).

## Checking a change

- `npm run lint` and `npm run build` pass.
- Look at UI changes against the emulators with demo data, never against her real data: `npm run emulators` + `npm run dev:emu`, sign in from the browser console with `__devSignIn('you@example.com')`, then 설정 > 데이터 > 예시 데이터 넣기.
- Check phone width (about 390px) and iPad width (about 1024px), light and dark; when saving is involved, also offline and back online.
- `npm run dev` uses the real project and her real customers: use it to look, not to try out changes that write data.
- After `npm run deploy`, open devices show "새 버전이 있어요"; tapping 새로고침 loads the new version.

## Product photos

The app uses `public/products/<productId>.webp` (256px, in git) and the list in `src/generated/product-photos.js`. The source photos (`hyFredit_누끼_80개/`, `product-images-found/`) are gitignored and exist only on his computer; `npm run images` keeps every photo that is already built when its source is missing. To add or replace one photo on any computer: save a background-removed PNG as `product-images-found/cutout/<productId>.png`, then run `npm run images`.

## Current state (keep this up to date)

- Live at https://hy-delivery-notebook.web.app with the `ai` function deployed. The `ANTHROPIC_API_KEY` secret is goochoi913's key, so AI usage is billed to his account.
- Her real data is not imported yet. She does it in the app: 설정 > 데이터 > 백업 불러오기 with the backup JSON from her old single-file app. It replaces everything on the server, demo data included. The per-building entrances (출입구 나누기) arrive with that backup.
- Product photos to check against the real packages: 하루야채 라이트 (`haru_lt`), 이츠온 폴드포크 샐러드 (`eo_salad`, a food photo), 이츠온 하루연두부 (`eo_tofu`).
