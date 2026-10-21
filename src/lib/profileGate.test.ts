import { describe, expect, it, vi } from 'vitest'
vi.mock('@/lib/supabase', () => ({ supabase: {} }))
import { isBrowseOnlyPage } from './profileGate'

describe('プロフィール未登録でも見られるページ（点検 9）', () => {
  it.each([
    ['/', ''],
    ['/queens-waltz', ''],
    ['/queens-waltz', '?view=calendar'],
    ['/queens-waltz/scenario/usagi', '?event=e1&count=2'],
    ['/scenario/usagi', ''],
    ['/queens-waltz/catalog', ''],
    ['/stores', ''],
    ['/terms', ''],
    ['/queens-waltz/private-booking-select', ''],
  ])('%s%s は見せる', (path, search) => {
    expect(isBrowseOnlyPage(path, search)).toBe(true)
  })

  it.each([
    ['/queens-waltz/scenario/usagi', '?event=e1&count=2&step=confirm'],
    ['/mypage', ''],
    ['/mypage/reservation/r1', ''],
    ['/group/create', '?scenarioId=s1'],
    ['/group/manage/g1', ''],
    ['/queens-waltz/private-booking-request', '?scenario=s1'],
  ])('%s%s は登録を求める', (path, search) => {
    expect(isBrowseOnlyPage(path, search)).toBe(false)
  })
})
