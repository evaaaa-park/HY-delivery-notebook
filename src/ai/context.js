// What the AI knows. Nothing is "remembered" inside the AI itself: every message carries
//   1) the fixed instructions below (cached on the AI side, so they are cheap to resend),
//   2) a fresh snapshot of the notebook (dataContext): today, products, every customer with their regular
//      items and pauses, the next two weeks of orders, holidays, bills and reminders,
//   3) the last few chat messages,
// and the tools in tools.js let it look up anything else (a customer's history, a day's route, the
// ordering sheet, monthly performance, the change log) and change the data the same way the buttons do.
import { S } from '@/store/state'
import { STATUS_NAME } from '@/domain/constants'
import { TODAY, DL, dow, addDays } from '@/lib/dates'
import { custById, locShort, itemsText } from '@/domain/model'
import { routeDefaultDate, orderTarget, pauseDays } from '@/domain/calendar'
import { regularText } from '@/domain/log'
import { billStatus } from '@/domain/bills'
import { TYPE_NAME } from '@/domain/constants'

export const STATIC_RULES = `너는 '헬리오 배달수첩' 앱 안의 AI 도우미야. 사용자는 hy(한국야쿠르트) 송파 헬리오시티 배달 매니저야. 한국어로 짧고 분명하게 답해.
자신을 소개할 때는 'AI 도우미'라고만 해. 모델 이름이나 회사 이름은 말하지 마.
매 메시지마다 앱이 오늘 날짜와 최신 데이터(제품, 고객, 주문, 휴무일, 확인할 것)를 system 메시지로 붙여 줘. 그 데이터를 기준으로 판단해. 요일 번호: 1=월 2=화 3=수 4=목 5=금 6=토.
규칙:
- 사용자가 나중에 확인하거나 물어볼 게 있다고 하면 add_reminder로 홈 화면 "확인할 것"에 넣어.
- 사용자가 변경·주문·중지·해지 같은 걸 말하면 도구로 바로 반영하고, 무엇을 바꿨는지 한두 줄로 알려 줘. 앱에서 되돌리기 버튼을 줄 거야.
- "그날만/이번만/하루만"은 set_day_items 또는 skip_day. "앞으로/매주/계속"은 set_regular.
- 기간 동안 쉬는 건 add_pause(끝나면 자동 재개). 해지·이사·중단은 set_status(명단에서 지우지 않아).
- 지난 날짜에 대한 요청(미전달, 그날 바꿔 드림 등)도 해당 날짜로 반영하고, 데이터에 넣을 게 없으면 add_log로 기록만 남겨.
- 바꾸는 도구는 자동으로 변경 기록이 남으니 add_log를 또 부르지 마.
- 고객이 애매하면 바꾸기 전에 물어봐. 동-호(예: 411-1501)로 찾아.
- 질문에는 get_ 도구로 확인하고 답해. 모르는 건 지어내지 마.
- 주문 종류는 hy 앱 주문구분대로 나눠: 후불정기=고객 정기(regular), (선불)정기=prepaid, 일반=fredit, 견본=sample(0원, 지점에서 받아옴), hy 앱에 없는 포스트잇·전화 주문=adhoc, 반품·회수=pickup. 결제금액 0원이면 견본이야. 택배는 배달 대상이 아니야.
- 매번 오는 (선불)정기 고객은 add_customer/update_customer로 payment=prepaid 고객으로 만들고 정기 품목으로 넣어.
- 정기 외 주문(일반·선불정기·견본·추가)은 자동 발주나 지점 수령이라 발주표에 안 들어가. 회수는 발주·실적 모두 제외.
- 사진(카카오톡 알림, hy 앱 화면 캡처)이 오면 내용을 읽고 위 규칙대로 반영해.`

function custLine(c) {
  const t = TODAY()
  const ps = c.pauses.filter(p => p.to >= t).map(p => `중지 ${p.from}~${p.to >= '2099' ? '계속' : p.to}${pauseDays(p)}`).join(', ')
  return `${c.id} | ${c.name} | ${locShort(c.loc)}${c.loc.label ? ' (' + c.loc.label + ')' : ''} | ${STATUS_NAME[c.status]}${c.endDate ? ' ' + c.endDate + '부터' : ''} | ${regularText(c)}${ps ? ' | ' + ps : ''}`
}

export function dataContext() {
  const t = TODAY(); const tgt = orderTarget()
  const up = S.orders.filter(o => o.status === 'open' && o.date >= t && o.date <= addDays(t, 14)).map(o => {
    const c = o.customerId ? custById(o.customerId) : null
    return `${o.id} | ${o.date} | ${TYPE_NAME[o.type]} | ${c ? c.name + ' ' + locShort(c.loc) : o.name + ' ' + locShort(o.loc)} | ${itemsText(o.items)}${o.note ? ' | ' + o.note : ''}`
  }).join('\n')
  const b = billStatus()
  return `[앱 데이터 · 지금 기준]
오늘: ${t}(${DL[dow(t)]}). 다음 배달일: ${routeDefaultDate()}. 오늘 기준 발주할 배달일: ${tgt}. 배달 요일: ${S.config.deliveryDays.map(d => DL[d]).join('')}.
휴무일: ${S.config.holidays.map(h => `${h.date} ${h.name}(${h.mode === 'partial' ? '공휴일: 아파트만 배달, 공휴일 쉼 고객 제외' : '전체 휴무'})`).join(', ') || '없음'}
공휴일에 쉬는 고객: ${S.customers.filter(c => c.holidayOff).map(c => c.id + ' ' + c.name).join(', ') || '없음'}
종이 청구서: ${b ? `${b.B.label} · 남은 고객 ${b.left.map(r => r.c.name + (r.next ? '(' + r.next + ' 배달)' : '(배달 없음)')).join(', ') || '없음'}` : '없음'}
확인할 것 (id | 내용): ${S.config.todos.filter(x => !x.done).map(x => `${x.id} | ${x.text}`).join(' / ') || '없음'}
제품 (id | 배달표 이름 | 출고신청 이름):
${S.config.products.map(p => `${p.id} | ${p.name} | ${p.orderName}`).join('\n')}
고객 (id | 이름 | 동-호 | 상태 | 정기 | 중지):
${S.customers.map(custLine).join('\n') || '없음'}
앞으로 2주 주문 (id | 날짜 | 종류 | 받는 곳 | 제품 | 메모):
${up || '없음'}`
}
