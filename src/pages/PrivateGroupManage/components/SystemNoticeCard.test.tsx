// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { SIMPLE_SYSTEM_MESSAGE_ACTIONS, SystemNoticeCard } from './SystemNoticeCard'
import type { PrivateGroupMessage } from '@/types'

const base = {
  msg: { id: 'm1', member_id: 'mem1', created_at: '2026-10-04T10:00:00Z', message: '' } as unknown as PrivateGroupMessage,
  systemMsgTitles: { candidate_dates_added: '候補日程が追加されました', pre_reading_notice: '事前', survey_notice: 'アンケート', performance_cancelled: '中止' },
  getMemberName: (id: string | null) => (id === 'mem2' ? '花子' : 'メンバー'),
  formatDateTime: () => '今日 19:00',
  formatCandidateDate: (d: string, t: string) => `${d} ${t}`,
  canOpenSurvey: false,
  onOpenSurvey: () => {},
}

describe('チャットの表示だけのお知らせ', () => {
  it('参加: 保存された memberId から今の名前を出す', () => {
    const html = renderToStaticMarkup(<SystemNoticeCard {...base} systemMsg={{ type: 'system', action: 'member_joined', memberId: 'mem2', memberName: '旧名' }} />)
    expect(html).toContain('花子')
    expect(html).toContain('が参加しました')
  })
  it('候補日追加: 件数と候補を出す', () => {
    const html = renderToStaticMarkup(<SystemNoticeCard {...base} systemMsg={{ type: 'system', action: 'candidate_dates_added', count: 1, dates: [{ date: '2026-11-01', time_slot: '夜' }] }} />)
    expect(html).toContain('候補日程が追加されました（1件）')
    expect(html).toContain('2026-11-01 夜')
  })
  it('個別お知らせ・配役は対象外（GroupChat 側で表示）', () => {
    expect(SIMPLE_SYSTEM_MESSAGE_ACTIONS.has('individual_notice')).toBe(false)
    expect(SIMPLE_SYSTEM_MESSAGE_ACTIONS.has('character_assignment')).toBe(false)
    expect(renderToStaticMarkup(<SystemNoticeCard {...base} systemMsg={{ type: 'system', action: 'individual_notice' }} />)).toBe('')
  })
})
