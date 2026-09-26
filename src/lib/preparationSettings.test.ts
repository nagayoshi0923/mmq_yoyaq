import { describe,expect,it } from 'vitest'
import { resolvePreparationMinutes, type PreparationSettings } from '../../supabase/functions/_shared/preparation-settings'
import { checkTimeOverlapWithPreparation,computePlacedStartTimeWithPreparation } from '../utils/eventOperationUtils'
const data: PreparationSettings = { organization: 120, stores: { store: 90 }, scenarios: { scenario: 30, master: 30 }, performances: { event: 0 } }
describe('準備時間の適用と配置', () => {
  it('公演、作品、店舗、組織、標準の順に適用する', () => {
    expect(resolvePreparationMinutes(data,{ storeId:'store',scenarioId:'scenario',eventId:'event' })).toBe(0)
    expect(resolvePreparationMinutes(data,{ storeId:'store',scenarioMasterId:'master' })).toBe(30)
    expect(resolvePreparationMinutes(data,{ storeId:'store' })).toBe(90)
    expect(resolvePreparationMinutes(data,{})).toBe(120)
    expect(resolvePreparationMinutes({ ...data,organization:null },{})).toBe(60)
  })
  it('個別指定解除は下位の適用値を使う', () => {
    expect(resolvePreparationMinutes({ ...data, scenarios:{ scenario:null },performances:{ event:null } },{ storeId:'store',scenarioId:'scenario',eventId:'event' })).toBe(90)
  })
  it('0分なら終演直後に次の公演を置ける', () => {
    expect(checkTimeOverlapWithPreparation('10:00','12:00','12:00','14:00',60,0).overlap).toBe(false)
    expect(computePlacedStartTimeWithPreparation('11:00',[{ start_time:'10:00',end_time:'12:00' }],0)).toBe('12:00')
  })
  it('前後どちらも後から始まる公演の準備時間を守る', () => {
    expect(checkTimeOverlapWithPreparation('10:00','12:00','12:29','14:00',90,30).overlap).toBe(true)
    expect(checkTimeOverlapWithPreparation('14:00','16:00','10:00','12:31',90,30).overlap).toBe(true)
    expect(computePlacedStartTimeWithPreparation('11:00',[{ start_time:'10:00',end_time:'12:00' }],90)).toBe('13:30')
  })
})

describe('日付境界の準備時間判定', () => {
 it('前日の公演と翌日の公演の間隔を判定する', () => {
  expect(checkTimeOverlapWithPreparation('20:00','23:00','10:00','13:00',0,720,'2026-09-25','2026-09-26').overlap).toBe(true)
  expect(checkTimeOverlapWithPreparation('20:00','23:00','11:00','14:00',0,720,'2026-09-25','2026-09-26').overlap).toBe(false)
  expect(checkTimeOverlapWithPreparation('10:00','13:00','20:00','23:00',720,0,'2026-09-27','2026-09-26').overlap).toBe(true)
 })
})
