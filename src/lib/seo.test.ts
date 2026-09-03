import { describe, expect, it } from 'vitest'
import {
  isPublicStoresPath,
  orgBookingTitle,
  orgHasPublicBookingStore,
  scenarioPageDescription,
  scenarioPageTitle,
  shouldNoindexPath,
  slugifyScenarioTitle,
  stripSeoQuery,
  toCanonicalUrl,
} from './seo'

describe('seo', () => {
  it('_v クエリを canonical から除く', () => {
    expect(stripSeoQuery('/scenario/foo?_v=2')).toBe('/scenario/foo')
    expect(stripSeoQuery('/scenario/foo?tab=private&_v=2')).toBe('/scenario/foo?tab=private')
    expect(toCanonicalUrl('/scenario/foo?_v=2')).toBe('https://mmq.game/scenario/foo')
  })

  it('作品名タイトルを検索向けに組み立てる', () => {
    expect(scenarioPageTitle('白いウサギは歌わない')).toContain('白いウサギは歌わない')
    expect(scenarioPageTitle('白いウサギは歌わない')).toContain('マーダーミステリー')
    expect(scenarioPageDescription('作品A', 'あ'.repeat(80)).length).toBeLessThanOrEqual(120)
    expect(orgBookingTitle('クインズワルツ')).toContain('クインズワルツ')
  })

  it('管理パスは noindex、公開 /stores は index', () => {
    expect(shouldNoindexPath('stores', '/stores')).toBe(false)
    expect(shouldNoindexPath('stores', '/queens-waltz/stores')).toBe(true)
    expect(shouldNoindexPath('login', '/login')).toBe(true)
    expect(shouldNoindexPath('blog-detail', '/queens-waltz/blog/hello')).toBe(false)
    expect(shouldNoindexPath('blog', '/queens-waltz/blog')).toBe(true)
    expect(shouldNoindexPath('platform-top', '/')).toBe(false)
  })

  it('公開 /stores はゲスト追い出し対象外、管理 /{org}/stores は対象', () => {
    expect(isPublicStoresPath('stores', '/stores')).toBe(true)
    expect(isPublicStoresPath('stores', '/queens-waltz/stores')).toBe(false)
    expect(isPublicStoresPath('schedule', '/stores')).toBe(false)
  })

  it('店舗のない組織は sitemap に載せない', () => {
    expect(orgHasPublicBookingStore([])).toBe(false)
    expect(orgHasPublicBookingStore([{ status: 'active', ownership_type: 'office' }])).toBe(false)
    expect(orgHasPublicBookingStore([{ status: 'inactive', ownership_type: 'owned' }])).toBe(false)
    expect(orgHasPublicBookingStore([{ status: 'active', ownership_type: 'owned' }])).toBe(true)
    expect(orgHasPublicBookingStore([{ status: 'active', ownership_type: null }])).toBe(true)
  })

  it('日本語タイトルの slug は id フォールバックになる', () => {
    expect(slugifyScenarioTitle('SORCIER', 'abc')).toBe('sorcier')
    expect(slugifyScenarioTitle('白いウサギは歌わない', 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee')).toBe(
      's-aaaaaaaabbbbcccc',
    )
  })
})
