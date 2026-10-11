import { describe, expect, it } from 'vitest'
import { buildInvitePreview } from './invitePreviewModel'

const cand = (date: string, start: string, status: string | null = null) => ({ date, time_slot: '午後', start_time: start, status })

describe('参加前の「このグループのいま」（点検 51）', () => {
  it('募集中は候補日を日付順に並べ、作品の料金から 1 人あたりを出す', () => {
    const p = buildInvitePreview({
      progress: 'gathering',
      candidates: [cand('2026-11-05', '13:00:00'), cand('2026-11-03', '13:00:00'), cand('2026-11-04', '13:00:00', 'rejected')],
      savedPerPerson: null,
      fee: 4500,
      costs: [],
    })
    expect(p.statusLabel).toBe('募集中')
    expect(p.datesTitle).toBe('候補日')
    expect(p.dates).toEqual(['11/3(火) 午後 13:00', '11/5(木) 午後 13:00'])
    expect(p.perPerson).toBe('¥4,500')
  })

  it('申込済みは「店舗の返事待ち」と回答の締め切りを書く', () => {
    const p = buildInvitePreview({ progress: 'requested', candidates: [cand('2026-11-03', '13:00')], savedPerPerson: null, fee: null, costs: null })
    expect(p.statusLabel).toBe('店舗の返事待ち')
    expect(p.statusText).toContain('日程の回答は締め切っています')
    expect(p.datesTitle).toContain('店舗がこの中から確定します')
    expect(p.perPerson).toBeNull()
  })

  it('確定は日時を出さず参加後に確認できると書き、保存済みの 1 人あたりを使う', () => {
    const p = buildInvitePreview({ progress: 'confirmed', candidates: [cand('2026-11-03', '13:00')], savedPerPerson: 5000, fee: 4500, costs: [] })
    expect(p.statusLabel).toBe('確定')
    expect(p.dates).toEqual([])
    expect(p.datesTitle).toBeNull()
    expect(p.statusText).toContain('参加後にグループページで確認できます')
    expect(p.perPerson).toBe('¥5,000')
  })

  it('候補日が多いときは 6 件まで出し、残りの数を返す', () => {
    const many = Array.from({ length: 8 }, (_, i) => cand(`2026-11-${String(10 + i).padStart(2, '0')}`, '13:00'))
    const p = buildInvitePreview({ progress: 'gathering', candidates: many, savedPerPerson: null, fee: null, costs: null })
    expect(p.dates).toHaveLength(6)
    expect(p.moreDates).toBe(2)
  })
})
