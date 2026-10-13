import { describe, expect, it } from 'vitest'
import type { PrivateGroupMessage } from '@/types'
import { applyMyReaction, fitWithin, groupReactions, isUserMessage, photoLayout, pinnedMessages, quoteText, readCountFor, typingText } from './chatModel'

const msg = (over: Partial<PrivateGroupMessage>): PrivateGroupMessage => ({ id: 'm1', group_id: 'g', member_id: 'a', message: 'こんにちは', created_at: '2026-10-10T01:00:00Z', ...over })

describe('チャット 段階 2 の決まり', () => {
  it('既読の人数は自分以外でその時刻まで読んだ人', () => {
    expect(readCountFor('2026-10-10T01:00:00Z', ['2026-10-10T00:59:00Z', '2026-10-10T01:00:00Z', '2026-10-10T02:00:00Z'])).toBe(2)
    expect(readCountFor('2026-10-10T03:00:00Z', ['2026-10-10T02:00:00Z'])).toBe(0)
  })
  it('リアクションは 1 人 1 種類（同じなら外す・別なら付け替え）', () => {
    const rows = [{ message_id: 'm1', emoji: '👍', count: 2, mine: true }, { message_id: 'm1', emoji: '❤️', count: 1, mine: false }]
    expect(applyMyReaction(rows, 'm1', '👍')).toEqual([{ message_id: 'm1', emoji: '👍', count: 1, mine: false }, { message_id: 'm1', emoji: '❤️', count: 1, mine: false }])
    expect(applyMyReaction(rows, 'm1', '❤️')).toEqual([{ message_id: 'm1', emoji: '👍', count: 1, mine: false }, { message_id: 'm1', emoji: '❤️', count: 2, mine: true }])
    expect(applyMyReaction([], 'm2', '🎉')).toEqual([{ message_id: 'm2', emoji: '🎉', count: 1, mine: true }])
    expect(applyMyReaction([{ message_id: 'm1', emoji: '👍', count: 1, mine: true }], 'm1', '👍')).toEqual([])
    expect(groupReactions(rows).get('m1')?.length).toBe(2)
  })
  it('返信の引用は名前と先頭 30 文字', () => {
    expect(quoteText('二郎', msg({ message: '30日なら行けそう！' }))).toBe('二郎: 30日なら行けそう！')
    expect(quoteText('二郎', msg({ message: 'あ'.repeat(31) }))).toBe(`二郎: ${'あ'.repeat(30)}…`)
    expect(quoteText('三郎', msg({ message: '', photos: [{ position: 1, width: 1, height: 1 }, { position: 2, width: 1, height: 1 }] }))).toBe('三郎: 写真 2 枚')
    expect(quoteText('三郎', msg({ deleted_at: '2026-10-10T02:00:00Z', message: '' }))).toBe('削除されたメッセージ')
  })
  it('写真の並べ方', () => {
    expect(photoLayout(1)).toBe('one')
    expect(photoLayout(2)).toBe('two')
    expect(photoLayout(3)).toBe('grid')
    expect(photoLayout(10)).toBe('grid')
  })
  it('長辺 2000px に収める（小さい写真は大きくしない）', () => {
    expect(fitWithin(4000, 3000, 2000)).toEqual({ width: 2000, height: 1500 })
    expect(fitWithin(3000, 4032, 2000)).toEqual({ width: 1488, height: 2000 })
    expect(fitWithin(800, 600, 2000)).toEqual({ width: 800, height: 600 })
  })
  it('ピン留めは新しい順・削除済みは除く', () => {
    const list = pinnedMessages([
      msg({ id: 'a', pinned_at: '2026-10-10T01:00:00Z' }),
      msg({ id: 'b', pinned_at: '2026-10-10T03:00:00Z' }),
      msg({ id: 'c', pinned_at: '2026-10-10T04:00:00Z', deleted_at: '2026-10-10T05:00:00Z' }),
      msg({ id: 'd' }),
    ])
    expect(list.map(m => m.id)).toEqual(['b', 'a'])
  })
  it('普通の発言かどうか', () => {
    expect(isUserMessage(msg({}))).toBe(true)
    expect(isUserMessage(msg({ message: '{"type":"system","action":"member_joined"}' }))).toBe(false)
    expect(isUserMessage(msg({ member_id: null }))).toBe(false)
    expect(isUserMessage(msg({ deleted_at: '2026-10-10T02:00:00Z' }))).toBe(false)
  })
  it('入力中の表示', () => {
    expect(typingText([])).toBeNull()
    expect(typingText(['るい'])).toBe('るいさんが入力中…')
    expect(typingText(['るい', '二郎'])).toBe('るいさん、二郎さんが入力中…')
    expect(typingText(['a', 'b', 'c'])).toBe('3人が入力中…')
  })
})
