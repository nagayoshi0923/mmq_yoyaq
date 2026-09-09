import { expect, it } from 'vitest'
import { publicAnalyticsTarget } from './analytics'
it('公開導線だけを計測し、認証・予約情報・管理画面を除外する',()=>{
  expect(publicAnalyticsTarget('/queens-waltz')).toBe('G-1JLE1C4K9W')
  expect(publicAnalyticsTarget('/queens-waltz/scenario/work')).toBe('G-1JLE1C4K9W')
  expect(publicAnalyticsTarget('/scenario/work')).toBe('G-QSE4VBLEVF')
  for(const route of ['/login','/mypage','/coupon-claim','/queens-waltz/sales','/group/invite/token','/recruitment-response']) expect(publicAnalyticsTarget(route)).toBeNull()
})

it('予約の保存成功を一度だけ数え、予約IDや参照元のクエリを送信しない', async () => {
  const {vi}=await import('vitest')
  const send=vi.fn()
  vi.stubGlobal('window',{location:{hostname:'mmq.game'},gtag:send,dataLayer:[]})
  vi.stubGlobal('document',{referrer:'https://queenswaltz.jp/?email=private@example.test',getElementById:()=>({})})
  const {trackReservationComplete}=await import('./analytics')
  trackReservationComplete('private-reservation-id','queens-waltz')
  trackReservationComplete('private-reservation-id','queens-waltz')
  const events=send.mock.calls.filter(c=>c[0]==='event'&&c[1]==='reservation_complete')
  expect(events).toHaveLength(1)
  expect(JSON.stringify(send.mock.calls)).not.toContain('private-reservation-id')
  expect(JSON.stringify(send.mock.calls)).not.toContain('private@example.test')
  expect(events[0][2].page_referrer).toBe('https://queenswaltz.jp')
  vi.unstubAllGlobals()
})
