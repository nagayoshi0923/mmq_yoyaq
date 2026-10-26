// 点検 F12: 直リンクで開いたグループから「同じメンバーで次の貸切」を押すと /catalog（無い画面）へ行き 404 だった
import { describe, expect, it, vi } from 'vitest'
const org = vi.hoisted(() => ({ get: vi.fn() }))
vi.mock('@/lib/organization', () => ({ getOrganizationById: org.get }))
import { nextGroupCatalogPath } from './nextGroupCatalogPath'

describe('次の貸切のカタログ', () => {
  it('slug が分かればその組織のカタログ', async () => {
    expect(await nextGroupCatalogPath('queens-waltz', 'org-1')).toBe('/queens-waltz/catalog')
    expect(org.get).not.toHaveBeenCalled()
  })
  it('slug がまだ分からなければグループの組織から引く', async () => {
    org.get.mockResolvedValueOnce({ slug: 'queens-waltz' })
    expect(await nextGroupCatalogPath(null, 'org-1')).toBe('/queens-waltz/catalog')
  })
  it('引けなければ全体のカタログ（/catalog には行かない）', async () => {
    org.get.mockRejectedValueOnce(new Error('offline'))
    expect(await nextGroupCatalogPath(null, 'org-1')).toBe('/scenario')
    expect(await nextGroupCatalogPath(null, null)).toBe('/scenario')
  })
})
