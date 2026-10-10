import { describe, expect, it } from 'vitest'
import { photoSummary } from './groupPageModel'

const names: Record<string, string> = { a: 'いちこ', b: '二郎', c: 'るい', d: '四郎' }
const nameOf = (id: string | null) => (id ? names[id] : '退出したメンバー')

describe('写真の見出し', () => {
  it('枚数と投稿者（新しい順に 3 人まで）', () => {
    expect(photoSummary([{ memberId: 'a' }, { memberId: 'b' }, { memberId: 'a' }, { memberId: 'c' }], nameOf)).toBe('4 枚・いちこ、二郎、るい')
    expect(photoSummary([{ memberId: 'a' }, { memberId: 'b' }, { memberId: 'c' }, { memberId: 'd' }], nameOf)).toBe('4 枚・いちこ、二郎、るい ほか 1 人')
    expect(photoSummary([], nameOf)).toBe('0 枚')
  })
})
