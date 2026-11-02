# Changelog · 변경 내역

Each version came from a real problem on the route. Dates are KST.
버전마다 실제 배달하다 생긴 문제에서 나왔어요.

| Date | What changed | Why |
|---|---|---|
| 2026-10-18 | First version: customers, T-2 ordering sheet (stock defaults to 0), route checklist with drag reorder, order intake, pause with auto-resume | Replace the paper sheet and the ordering math I did in my head |
| 2026-10-18 | Light/dark theme, iPad split view (route list + complex map) | I use it on an iPad Home Screen, early morning and in dark hallways |
| 2026-10-18 | Cross-device sync: offline-first, retry queue | Edit on iPad, check on iPhone; some basements have no signal |
| 2026-10-18 | Every-other-week items, weekday-only pauses | Real customers: milk every two weeks; "skip Wednesdays only" |
| 2026-10-21 | Route by entrance (1·2호 / 3·4호), compact list, inline stop editor, export route as an image | Too much text on one screen; I walk entrance by entrance |
| 2026-10-21 | Change log (entry date + effective date), customer status (cancelled/paused/moved, kept on the list), monthly performance, AI assistant | Monthly performance reporting; cancelled customers still owe payment |
| 2026-10-22 | Delivered orders leave the home list; daily completion records | Keep the home screen clean, keep proof of each finished day |
| 2026-10-22 | Order types follow hy's categories: general (Fredit), sample, prepaid regular, extra, return pickup | Too many order names; each type has a different ordering rule |
| 2026-10-25 | Partial holidays (shops and offices off, apartments delivered), home "to check" list | On public holidays only some places close |
| 2026-10-29 | Items not in the catalog, "paid separately, don't order" | Pet products and gift sets come paid through the app |
| 2026-11-01 | Paper bill list with route markers | Monthly paper bills have to go out with the delivery |
| 2026-11-01 | Bill counts as given only when its icon is tapped | Checking a delivery did not mean the bill went out |
| 2026-11-03 | Rebuilt as a regular project (React + shadcn/ui on Firebase). Every feature and rule kept; Google sign-in, new accounts wait for approval | The notebook lived only inside one claude.ai page; the data needed its own home and the code a normal structure |
| 2026-11-03 | Works fully offline as a Home Screen app; changes made without signal sync when back online; two devices editing different things no longer overwrite each other | Basements and stairwells have no signal; an offline edit could replace a whole list |
| 2026-11-03 | Nothing is deleted anymore (old orders, logs and performance stay on the server), daily server backups | Version 1 pruned orders after 60 days and logs after 200 |
| 2026-11-03 | Product photos instead of names: big photos with the count under each stop on the route, and photos in orders, customers and records | Reading product names while walking is slow; photos are recognised at a glance |
| 2026-11-03 | AI assistant through a server function; chat shared between iPad and iPhone; undo reverts only what that AI turn changed | The AI key must stay off the device; undo used to roll back unrelated edits made after it |
