import { describe, expect, it } from 'vitest'
import { chunkChatEntries, closedHandoverRequestIds, formatChatDate, groupMessagesByDate, markDeletedCandidates, noticeLineText, parseSystemMessage } from './groupChatMessages'
import type { PrivateGroupMessage } from '@/types'
import type { SystemMessage } from './groupChatMessages'

const msg = (id: string, created_at: string) => ({ id, created_at, message: 'x' }) as unknown as PrivateGroupMessage

describe('チャットのメッセージの読み方', () => {
  it('システムメッセージは文字でも物でも読み、普通の文や壊れた文は null', () => {
    expect(parseSystemMessage('{"type":"system","action":"member_joined","memberName":"A"}')).toMatchObject({ action: 'member_joined', memberName: 'A' })
    expect(parseSystemMessage({ type: 'system', action: 'group_created' })).toMatchObject({ action: 'group_created' })
    expect(parseSystemMessage('こんにちは')).toBeNull()
    expect(parseSystemMessage('{壊れた')).toBeNull()
    expect(parseSystemMessage('{"type":"user"}')).toBeNull()
    expect(parseSystemMessage(null)).toBeNull()
  })

  it('同じ日のメッセージをまとめる', () => {
    const groups = groupMessagesByDate([msg('1', '2026-10-03T01:00:00Z'), msg('2', '2026-10-03T02:00:00Z'), msg('3', '2026-10-04T12:00:00Z')])
    expect(groups.map(g => g.messages.map(m => m.id))).toEqual([['1', '2'], ['3']])
    expect(groupMessagesByDate([])).toEqual([])
  })

  it('日付の見出しは今日・昨日・○月○日', () => {
    const today = new Date('2026-10-04T12:00:00')
    expect(formatChatDate('2026-10-04T09:00:00', today)).toBe('今日')
    expect(formatChatDate('2026-10-03T09:00:00', today)).toBe('昨日')
    expect(formatChatDate('2026-09-20T03:00:00Z', today)).toBe('9月20日')
  })
})

describe('主催者の引き継ぎ依頼の終わり', () => {
  it('結果（organizer_handover）の記録がある依頼だけを終わったとみなす', () => {
    const msg = (id: string, message: string) => ({ id, group_id: 'g', member_id: null, message, created_at: '2026-10-09T00:00:00Z' }) as never
    const ids = closedHandoverRequestIds([
      msg('1', JSON.stringify({ type: 'system', action: 'individual_notice', handover_request_id: 'h1' })),
      msg('2', JSON.stringify({ type: 'system', action: 'organizer_handover', result: 'declined', handover_request_id: 'h1' })),
      msg('3', JSON.stringify({ type: 'system', action: 'individual_notice', handover_request_id: 'h2' })),
      msg('4', 'こんにちは'),
    ])
    expect([...ids]).toEqual(['h1'])
  })
})

describe('自動のお知らせの 1 行（グループページ刷新 段階 1）', () => {
  const current = [
    { id: 'c1', date: '2026-10-30', time_slot: '夜間', status: 'active', responses: [{ member_id: 'm1' }] },
    { id: 'c2', date: '2026-10-31', time_slot: '午後', status: 'active', responses: [] },
  ]
  const ctx = { getMemberName: (id: string | null) => (id === 'org' ? 'いちこ' : 'メンバー'), current, myMemberId: 'm1', answering: true }

  it('外された候補日に印を付ける', () => {
    expect(markDeletedCandidates([{ date: '2026-10-30', time_slot: '夜' }, { date: '2026-10-20', time_slot: '午後' }], current))
      .toEqual([{ date: '2026-10-30', time_slot: '夜', deleted: false }, { date: '2026-10-20', time_slot: '午後', deleted: true }])
  })
  it('自分が未回答の候補日があればカードで残す', () => {
    const msg = { type: 'system', action: 'candidate_dates_added', count: 1, dates: [{ date: '2026-10-31', time_slot: '午後' }] } as SystemMessage
    expect(noticeLineText(msg, 'org', ctx)).toBeNull()
  })
  it('回答済み・削除済みは 1 行（削除の数を添える）', () => {
    const msg = { type: 'system', action: 'candidate_dates_added', count: 2, dates: [{ date: '2026-10-30', time_slot: '夜' }, { date: '2026-10-20', time_slot: '午後' }] } as SystemMessage
    expect(noticeLineText(msg, 'org', ctx)).toBe('いちこさんが候補日を 2 件追加（うち 1 件は削除済み）')
    const gone = { ...msg, dates: [{ date: '2026-10-20', time_slot: '午後' }], count: 1 }
    expect(noticeLineText(gone, 'org', ctx)).toBe('いちこさんが候補日を 1 件追加（その後削除）')
  })
  it('参加・外れた は 1 行、日程確定はカード', () => {
    expect(noticeLineText({ type: 'system', action: 'member_removed', memberName: '三郎' }, null, ctx)).toBe('三郎さんが外れました')
    expect(noticeLineText({ type: 'system', action: 'schedule_confirmed' }, null, ctx)).toBeNull()
  })
  it('続けて並ぶ 1 行はまとめる', () => {
    const m = (id: string, message: string) => ({ id, group_id: 'g', member_id: null, message, created_at: '2026-10-10T00:00:00Z' }) as never
    const entries = chunkChatEntries([m('1', 'a'), m('2', 'b'), m('3', 'c'), m('4', 'd')], msg => ((msg as { message: string }).message === 'c' ? null : (msg as { message: string }).message))
    expect(entries.map(e => (e.kind === 'line' ? e.texts.join('+') : 'msg'))).toEqual(['a+b', 'msg', 'd'])
  })
})
