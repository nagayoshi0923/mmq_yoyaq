import { beforeEach, expect, it, vi } from 'vitest'
const m = vi.hoisted(() => ({ invoke: vi.fn(), insert: vi.fn(), patch: vi.fn(), log: vi.fn(), warn: vi.fn(), error: vi.fn() }))
vi.mock('./supabase', () => ({ supabase: { functions: { invoke: m.invoke }, from: () => ({ insert: m.insert }) } }))
vi.mock('@/lib/apiClient', () => ({ apiClient: { patch: m.patch } }))
vi.mock('@/utils/logger', () => ({ logger: m, generateCorrelationId: () => 'correlation', createCorrelatedLogger: () => ({ info: vi.fn() }) }))
import { reservationApi, markSenshinDiscordCancelled } from './reservationApi'
import { SENSHIN_SCENARIO_MASTER_ID } from './senshinPrivateBooking'
const saved = { id: 'r', status: 'cancelled' }
const context = { id: 'r', organization_id: 'org', title: '作品', customer_email: 'fixture@example.invalid', customer_name: '顧客', schedule_event_id: 'event', participant_count: 2, schedule_events: { id: 'event', store_id: 'store' } }
beforeEach(() => {
  vi.resetAllMocks()
  m.patch.mockResolvedValue({ reservation: saved, contextForNotifications: { reservation: context, organization_slug: 'org', skip_group_cancel: false } })
  m.invoke.mockImplementation(async (name: string) => ({ data: name === 'notify-waitlist' ? { success: true, notifiedCount: 2, totalWaitlist: 2 } : { success: true }, error: null }))
  m.insert.mockResolvedValue({ error: null })
})
it.each([
  { data: { success: false }, error: null },
  { data: { success: true }, error: { message: 'http' } },
  { data: { success: true, skipped: true }, error: null },
  { data: { success: true, skipped: true, reason: 'company_or_manual_reply_required' }, error: null },
  { data: { success: false, skipped: true, reason: 'resend_not_configured' }, error: null },
])('取消メールの%sでも取消成功と待機列処理を維持し、再送を増やさない', async response => {
  m.invoke.mockImplementation(async (name: string) => name === 'send-cancellation-confirmation' ? response : { data: { success: true, notifiedCount: 2, totalWaitlist: 2 }, error: null })
  expect(await reservationApi.cancel('r')).toEqual(saved)
  expect(m.patch).toHaveBeenCalledTimes(1); expect(m.invoke).toHaveBeenCalledTimes(2)
  expect(m.insert).not.toHaveBeenCalled(); expect(m.log).not.toHaveBeenCalledWith('キャンセル確認メール受付確認', expect.anything())
})
it.each([
  { data: { success: true, notifiedCount: 0 }, error: null },
  { data: { success: true, notifiedCount: 0, _debug: 'private error' }, error: null },
  { data: { success: true, notifiedCount: 1, totalWaitlist: 2 }, error: null },
  { data: { success: false }, error: null },
  { data: null, error: { message: 'http' } },
])('待機列の0件・部分失敗・返却エラー%sで二重queueを作らない', async response => {
  m.invoke.mockImplementation(async (name: string) => name === 'notify-waitlist' ? response : { data: { success: true }, error: null })
  expect(await reservationApi.cancel('r')).toEqual(saved)
  expect(m.insert).not.toHaveBeenCalled(); expect(m.patch).toHaveBeenCalledTimes(1)
  expect(m.log).not.toHaveBeenCalledWith('キャンセル待ち通知受付確認', expect.anything())
  expect(JSON.stringify(m.warn.mock.calls)).not.toContain('private error')
})
it.each([null, { message: 'database error' }])('既存の待機列通信例外だけqueueを一度試行し、queue返却%sも取消結果と分離', async error => {
  m.invoke.mockImplementation(async (name: string) => { if(name === 'notify-waitlist') throw Error('disconnected'); return { data: { success: true }, error: null } })
  m.insert.mockResolvedValue({ error })
  expect(await reservationApi.cancel('r')).toEqual(saved)
  expect(m.insert).toHaveBeenCalledTimes(1)
  expect(m.insert).toHaveBeenCalledWith(expect.objectContaining({ organization_id: 'org', schedule_event_id: 'event', status: 'pending' }))
  if(error) expect(m.log).not.toHaveBeenCalledWith('キャンセル待ち通知をリトライキューに記録')
})
it('保存が失敗したら全通知とqueueを実行しない', async () => {
  m.patch.mockRejectedValue(Error('save failed'))
  await expect(reservationApi.cancel('r')).rejects.toThrow('save failed')
  expect(m.invoke).not.toHaveBeenCalled(); expect(m.insert).not.toHaveBeenCalled()
})
it('取消メール通信例外で待機列へ進まない現行順序を維持する', async () => {
  m.invoke.mockRejectedValue(Error('mail transport failed'))
  expect(await reservationApi.cancel('r')).toEqual(saved)
  expect(m.invoke).toHaveBeenCalledTimes(1); expect(m.insert).not.toHaveBeenCalled()
})
it('全件肯定応答時のみ通知受付確認を記録する', async () => {
  expect(await reservationApi.cancel('r')).toEqual(saved)
  expect(m.log).toHaveBeenCalledWith('キャンセル確認メール受付確認', { reservationId: 'r' })
  expect(m.log).toHaveBeenCalledWith('キャンセル待ち通知受付確認', { reservationId: 'r' })
})
it.each([
  { data: { success: false }, error: null },
  { data: { success: true, skipped: true, reason: 'no_rooms' }, error: null },
  { data: { success: true, skipped: true, reason: 'not_senshin' }, error: null },
  { data: { success: true }, error: null },
  { data: null, error: { message: 'http' } },
])('Discord取消の%sをチャンネル更新完了に読み替えずthrowしない', async response => {
  m.invoke.mockResolvedValue(response)
  await expect(markSenshinDiscordCancelled({ reservationId: 'r', organizationId: 'org', scenario_master_id: SENSHIN_SCENARIO_MASTER_ID })).resolves.toBeUndefined()
  expect(m.invoke).toHaveBeenCalledTimes(1)
  expect(m.log).not.toHaveBeenCalledWith('戦塵Discordチャンネル取消受付確認', expect.anything())
})
it('Discordの取消肯定応答はcancelled:trueを確認する', async () => {
  m.invoke.mockResolvedValue({ data: { success: true, cancelled: true }, error: null })
  await markSenshinDiscordCancelled({ reservationId: 'r', organizationId: 'org', scenario_master_id: SENSHIN_SCENARIO_MASTER_ID })
  expect(m.log).toHaveBeenCalledWith('戦塵Discordチャンネル取消受付確認', { reservationId: 'r' })
})
