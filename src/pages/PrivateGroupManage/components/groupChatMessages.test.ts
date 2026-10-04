import { describe, expect, it } from 'vitest'
import { formatChatDate, groupMessagesByDate, parseSystemMessage } from './groupChatMessages'
import type { PrivateGroupMessage } from '@/types'

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
