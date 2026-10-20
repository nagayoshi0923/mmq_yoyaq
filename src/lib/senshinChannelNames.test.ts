import { describe, expect, it, vi } from 'vitest'
import { buildSenshinChannelNames, senshinGmSuffix } from '../../supabase/functions/_shared/senshin-discord'

const base = { eventDate: '2026-10-25', startTime: '10:00', storeName: 'クインズワルツ大塚' }

describe('戦塵の日付別Discordチャンネル名', () => {
  it('日時・店舗・観戦識別を維持し、明示されたメインと複数のサブを追加する', () => {
    const names = buildSenshinChannelNames({ ...base, gms: ['渚咲', 'える', 'りんな'], gmRoles: { える: 'main', りんな: 'sub', 渚咲: 'sub' }, staffNames: ['える', 'りんな', '渚咲'] })
    expect(names.playerName).toBe('2026-10-25日9時半開場大塚メインえるサブりんな・渚咲')
    expect(names.spectatorName).toBe(names.playerName + '-観戦用')
  })

  it('担当の空欄は役割ごとに未定とし、配列順で補完しない', () => {
    expect(senshinGmSuffix()).toBe('メイン未定サブ未定')
    expect(senshinGmSuffix(['える'], { える: 'main' })).toBe('メインえるサブ未定')
    expect(senshinGmSuffix(['りんな'], { りんな: 'sub' })).toBe('メイン未定サブりんな')
  })

  it.each<{ gms: string[]; gmRoles: Record<string, string>; staffNames: string[] }>([
    { gms: ['える', 'ソラ'], gmRoles: { '00テストくん': 'main', ソラ: 'sub' }, staffNames: ['える', 'ソラ'] },
    { gms: ['える'], gmRoles: {}, staffNames: ['える'] },
    { gms: ['える'], gmRoles: { える: 'main' }, staffNames: [] },
    { gms: ['あ'.repeat(90)], gmRoles: { ['あ'.repeat(90)]: 'main' }, staffNames: ['あ'.repeat(90)] },
  ])('不整合や長すぎるGM名で従来の作成を止めず、誤表示せず警告する: %j', (assignment) => {
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      const names = buildSenshinChannelNames({ ...base, ...assignment })
      expect(names.playerName).toBe('2026-10-25日9時半開場大塚')
      expect(names.spectatorName).toBe(names.playerName + '-観戦用')
      expect(warning).toHaveBeenCalledWith('senshin_channel_gm_name_skipped', expect.objectContaining({ eventDate: base.eventDate }))
    } finally {
      warning.mockRestore()
    }
  })
})
