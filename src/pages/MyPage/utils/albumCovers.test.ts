import { describe, expect, it } from 'vitest'
import { findAlbumCover, memoriesHref } from './albumCovers'
import type { AlbumCover } from '@/lib/privateGroupChat'

const cover = (extra: Partial<AlbumCover>): AlbumCover => ({
  groupId: 'g1', inviteCode: 'abc', reservationId: 'r1', scenarioMasterId: 's1', performanceDate: '2026-11-07', photoCount: 3, url: 'u', ...extra,
})

describe('アルバムとグループの写真', () => {
  const covers = [cover({}), cover({ groupId: 'g2', inviteCode: 'def', reservationId: 'r2', scenarioMasterId: 's2', performanceDate: '2026-10-01' })]
  it('予約（主催者）は予約で突き合わせる', () => {
    expect(findAlbumCover({ reservation_id: 'r2', scenario_id: 's2', date: '2026-10-01' }, covers)?.groupId).toBe('g2')
  })
  it('手動の履歴（メンバー）は作品と公演日で突き合わせる', () => {
    expect(findAlbumCover({ scenario_id: 's1', date: '2026-11-07' }, covers)?.groupId).toBe('g1')
    expect(findAlbumCover({ scenario_id: 's1', date: '2026-11-08' }, covers)).toBeNull()
    expect(findAlbumCover({ scenario_id: 's9', date: '2026-11-07' }, covers)).toBeNull()
  })
  it('予約が合わなければ作品と日付で探す', () => {
    expect(findAlbumCover({ reservation_id: 'other', scenario_id: 's1', date: '2026-11-07' }, covers)?.groupId).toBe('g1')
  })
  it('思い出タブへのリンク', () => {
    expect(memoriesHref({ inviteCode: 'abc' })).toBe('/group/invite/abc?tab=memories')
  })
})
