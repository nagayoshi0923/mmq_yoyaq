import { describe, expect, it } from 'vitest'
import { parseNextGroupSource } from './nextPrivateGroup'

const now = 1_800_000_000_000
const raw = (over: Record<string, unknown> = {}) => JSON.stringify({ groupId: 'g', memberId: 'm', organizationId: 'o', title: '告別詩', memberCount: 5, savedAt: now - 1000, ...over })

describe('同じメンバーで次の貸切（もとのグループの記憶）', () => {
  it('6 時間以内なら読める', () => {
    expect(parseNextGroupSource(raw(), now)).toMatchObject({ groupId: 'g', memberId: 'm', organizationId: 'o', title: '告別詩', memberCount: 5 })
  })
  it('古い・壊れている・足りないものは捨てる', () => {
    expect(parseNextGroupSource(raw({ savedAt: now - 7 * 60 * 60 * 1000 }), now)).toBeNull()
    expect(parseNextGroupSource('{', now)).toBeNull()
    expect(parseNextGroupSource(raw({ groupId: 1 }), now)).toBeNull()
    expect(parseNextGroupSource(null, now)).toBeNull()
  })
})
