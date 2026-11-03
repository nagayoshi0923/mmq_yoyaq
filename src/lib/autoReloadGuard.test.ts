// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AUTO_RELOAD_KEY, MAX_REMEMBERED_HASHES, canAutoReloadFor, claimAutoReloadFor, clearAutoReloadRecord } from './autoReloadGuard'

beforeEach(() => sessionStorage.clear())
afterEach(() => vi.restoreAllMocks())

describe('autoReloadGuard', () => {
  it('配信が A・B 交互でも、それぞれの版へは 1 回だけ', () => {
    const claims = ['fixture-a', 'fixture-b', 'fixture-a', 'fixture-b', 'fixture-a'].map(claimAutoReloadFor)
    expect(claims).toEqual([true, true, false, false, false])
  })

  it('さらに新しい版へは改めて 1 回だけ切り替えられる', () => {
    expect(claimAutoReloadFor('v1')).toBe(true)
    expect(claimAutoReloadFor('v2')).toBe(true)
    expect(claimAutoReloadFor('v2')).toBe(false)
    expect(canAutoReloadFor('v3')).toBe(true)
  })

  it('覚える版の数には上限があり、古いものから捨てる', () => {
    for (let i = 0; i <= MAX_REMEMBERED_HASHES; i += 1) claimAutoReloadFor(`v${i}`)
    const stored = JSON.parse(sessionStorage.getItem(AUTO_RELOAD_KEY) ?? '[]') as string[]
    expect(stored).toHaveLength(MAX_REMEMBERED_HASHES)
    expect(stored).not.toContain('v0')
    expect(stored).toContain(`v${MAX_REMEMBERED_HASHES}`)
  })

  it('以前の形式の記録（版 1 つの文字列や "1"）も読める', () => {
    sessionStorage.setItem(AUTO_RELOAD_KEY, 'fixture-a')
    expect(claimAutoReloadFor('fixture-a')).toBe(false)
    sessionStorage.setItem(AUTO_RELOAD_KEY, '1')
    expect(claimAutoReloadFor('fixture-a')).toBe(true)
    expect(claimAutoReloadFor('fixture-a')).toBe(false)
  })

  it('手動の更新で記録を消すと、同じ版へも再び 1 回切り替えられる', () => {
    claimAutoReloadFor('fixture-a')
    clearAutoReloadRecord()
    expect(claimAutoReloadFor('fixture-a')).toBe(true)
  })

  it('保存領域が読めない・書けないときは自動では切り替えない', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked') })
    expect(claimAutoReloadFor('fixture-a')).toBe(false)
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked') })
    expect(canAutoReloadFor('fixture-a')).toBe(false)
    expect(claimAutoReloadFor('fixture-a')).toBe(false)
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => { throw new Error('blocked') })
    expect(() => clearAutoReloadRecord()).not.toThrow()
  })
})
