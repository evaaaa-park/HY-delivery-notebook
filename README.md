# Helio Delivery Notebook · 헬리오 배달수첩

I work as an hy (Korea Yakult) delivery manager in Songpa Helio City, Seoul. I deliver to about 65 regular customers across two apartment complexes, plus shops, a senior center, a community office, and the cleaning and security staff rooms. This is the tool I built to run that route. I use it every working day on my iPad and iPhone.

![Home on iPad](docs/screenshots/home.png)

> All screenshots use made-up customers. Real customer data is never in this repository (see [Privacy](#privacy)).

## The problem

My day was split across several places that do not talk to each other:

- **hy's customer app** has each customer's regular (subscription) order.
- **KakaoTalk notifications** bring in one-time orders: Fredit online orders, free samples, prepaid subscription deliveries, return pickups.
- **The ordering app** needs the stock request **two business days ahead** (T-2). A Monday mistake shows up on Wednesday.
- **A paper sheet** was the route list. Pauses ("we travel next week"), quantity changes for just one day, building entrances, and paper bills were all kept in my head.

When something slipped, a customer got the wrong item, or I ordered too much or too little stock.

## What it does

| Area | What it does |
|---|---|
| **Customers** | Regular items per weekday, every-other-week items, payment method, notes. Status is active, waiting, paused, cancelled, or moved. Cancelled customers stay on the list because I still collect payment from them. |
| **Pauses** | A date range or only certain weekdays. Delivery comes back by itself when the pause ends, and the home screen warns me before it starts and ends. |
| **T-2 ordering sheet** | Adds up demand for the order date. Stock defaults to 0. Rows are grouped and named like in hy's ordering app, so I can copy the list straight into it. |
| **Order types** | Follows hy's own categories: postpaid regular, prepaid regular, general (Fredit), sample, my own extra orders, and return pickup. Only the types I buy myself go into the ordering sheet. Samples become a "pick up at the branch" alert. |
| **Route** | Sorted by my building order, then entrance (1·2호 / 3·4호), then floor. I can drag to reorder, and stops in the same building are grouped. There is a complex map to jump to a building, check-off with timestamps, and export of the finished route as an image. |
| **One-day changes** | "Only this Monday, 2 instead of 5": a per-day override that does not touch the regular contract. |
| **Holidays** | A full day off, or a public holiday where apartments still get delivery and shops and offices are skipped. |
| **Change log** | Every change records two dates: when I entered it, and the date it applies to. Undo is available right after each change. |
| **Monthly performance** | Each finished day is frozen as a snapshot, so later edits do not rewrite past months. If a change is back-dated (for example "cancelled since the 7th"), only the affected days are recomputed. |
| **Daily completion records** | When every stop is checked, the day is saved with the time and item counts. I can look these up later. |
| **Paper bills** | A list of customers who get a paper bill this month. A bill icon shows next to their unit on the route until I tap it. Customers with no upcoming delivery show up on the home screen. |
| **Reminders** | A "to check" list on the home screen, like "ask the branch manager about this customer". |
| **AI assistant** | I can type or paste a KakaoTalk screenshot, for example "Kim at 411-1501 pauses next week". It changes the data through tool calls (add order, pause, set status…), and each AI turn can be undone. |

| Route (iPad) | Ordering sheet | iPhone, dark mode |
|---|---|---|
| ![Route](docs/screenshots/route.png) | ![Order sheet](docs/screenshots/order.png) | ![iPhone dark](docs/screenshots/route-iphone-dark.png) |

## How it is built

- **One HTML file, plain JavaScript, no framework and no build step.** It is added to the iPad Home Screen like an app. The layout works on iPad (split view: list and building map side by side) and on iPhone, in light and dark mode.
- **Storage.** It runs as a published claude.ai page. Data lives in that page's database with an owner-only read/write rule, so only my account can read it.
  - Every write is mirrored to `localStorage`, so the app opens and works offline.
  - Each document has a timestamp, and the newer edit wins.
  - Failed writes wait in a queue and retry. Data is also saved when the page goes to the background.
- **Data model** (simplified):
  ```
  customer  { id, name, loc{building, unit, type}, regular[{productId, qty, days[], every, anchor}],
              pauses[{from, to, days[]}], status, endDate, payment, holidayOff, … }
  order     { id, type, customerId | name+loc, date, items[{productId, qty}], noBuy, status, note }
  day       { ov{custId: {items, skip}}, seq[], done{stopKey: time}, completedAt }
  perf      { days{date: {s{stopKey: "pid*qty*type;…"}}} }   // frozen monthly snapshot
  ```
- **Route order** = building rank → entrance group → floor (high to low), then my saved base order, then that day's drag changes.
- **Product names** keep two names, the short one on my delivery sheet and the exact name in hy's ordering app, so the ordering list can be copied as-is. Items not in the catalog (pet products, gift sets) can be typed in by name. They go on the route but never into the ordering sheet.
- **AI** uses the page's Claude access with a fixed set of tools and a context summary of today's data. The assistant cannot do anything the buttons cannot.

## Privacy

- This repository contains **only code**. No names, phone numbers, addresses, orders, or logs.
- Real data stays in the owner-only database of my private claude.ai page. Someone else who opens the page sees an empty notebook.
- `.gitignore` blocks data exports (`*.json`, `*.csv`, `*.xlsx`, phone screenshots) as a second safety net.
- Screenshots in `docs/` were made with fictional customers.

## Running it

Open `index.html` in a browser. Outside claude.ai it runs in **local mode**: data stays only in that browser, and sync and the AI assistant are turned off. Inside claude.ai it syncs across devices and the assistant works.

## How I made it

The idea, the requirements and the testing are mine. I wrote down what went wrong on the route and turned each problem into a feature request: entrances, back-dated cancellations, holidays where only shops close, bills that were marked as given when they were not. Then I tested every version on the next morning's deliveries.

The code was written together with Claude (Anthropic) as an AI pair programmer. I described the problem and the rules of my job. Claude proposed and wrote the implementation. I checked it against real deliveries and asked for fixes.

The commit history shows how it grew, one real problem at a time. The full list is in [docs/CHANGELOG.md](docs/CHANGELOG.md).

---

### 한국어 요약

송파 헬리오시티에서 hy 배달 매니저로 일하면서 매일 쓰는 배달 관리 앱이에요. 정기 고객 관리, 2영업일 전(T-2) 발주표, 입구·층 순서로 정렬되는 배달 동선, 알림톡 주문 입력(일반·견본·선불정기·추가·회수), 중지와 자동 재개, 공휴일, 변경 기록, 월별 실적, 종이 청구서 전달 표시, AI 도우미가 한 화면에 있어요. 이 저장소에는 코드만 있고 고객 정보는 없어요.
