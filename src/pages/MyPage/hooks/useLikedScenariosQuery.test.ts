import { expect, it, vi } from 'vitest'
vi.mock('@/lib/supabase', () => ({ supabase: {} }))
import { pickNextEvents } from './useLikedScenariosQuery'

const row = (o: Record<string, unknown>) => ({ id: 'e', date: '2026-10-12', start_time: '13:00:00', venue: '本店', organization_id: 'org', scenario_master_id: 'S', current_participants: 0, max_participants: 6, ...o })
const NOW = { date: '2026-10-09', time: '12:00' }

it('作品ごとに残席のある最も早い公演を 1 件選び、作品ページの公演選択へのリンクを作る', () => {
  const result = pickNextEvents([
    row({ id: 'full', date: '2026-10-10', current_participants: 6 }),
    row({ id: 'open', date: '2026-10-12', current_participants: 2 }),
    row({ id: 'other', scenario_master_id: 'T', date: '2026-10-20', max_participants: null }),
  ], NOW, { org: 'queens-waltz' })
  expect(result.S).toEqual({ eventId: 'open', date: '2026-10-12', startTime: '13:00', venue: '本店', remaining: 4, href: '/queens-waltz/scenario/S?event=open' })
  expect(result.T.remaining).toBeNull()
})

it('今日の開始済みは除き、全部満席なら最も早い公演を満席として出す', () => {
  const result = pickNextEvents([
    row({ id: 'started', date: '2026-10-09', start_time: '10:00:00' }),
    row({ id: 'full1', date: '2026-10-11', current_participants: 6 }),
    row({ id: 'full2', date: '2026-10-12', current_participants: 6 }),
  ], NOW, {})
  expect(result.S).toMatchObject({ eventId: 'full1', remaining: 0, href: '/scenario/S?event=full1' })
})

it('公演が無い作品は結果に含めない（画面は「予定なし・貸切リクエストできます」）', () => {
  expect(pickNextEvents([], NOW, {})).toEqual({})
})
