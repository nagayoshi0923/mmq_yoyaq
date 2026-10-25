import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { TopHero } from './TopHero'

function render(catalogPath: string, accessLabel?: string) {
  return renderToStaticMarkup(
    <MemoryRouter>
      <TopHero name="n" tagline="t" accessLabel={accessLabel} backgroundColor="#000" headerImageUrl={null}
        onFirstTime={() => {}} onAccess={() => {}} onPrivate={() => {}} catalogPath={catalogPath} />
    </MemoryRouter>,
  )
}
const labels = (html: string) => [...html.matchAll(/<(?:button|a)[^>]*>([^<]+)<\/(?:button|a)>/g)].map((m) => m[1])

describe('トップの上の帯のボタン', () => {
  it('組織トップ: 「貸切で遊ぶ」の隣に、その組織のカタログへの「カタログ」', () => {
    const html = render('/queens-waltz/catalog')
    expect(labels(html)).toEqual(['はじめての方へ', '店舗とアクセス', '貸切で遊ぶ', 'カタログ'])
    expect(html).toMatch(/<a[^>]*href="\/queens-waltz\/catalog"[^>]*>カタログ<\/a>/)
  })

  it('全体トップ: 全体カタログ（/scenario）へ', () => {
    const html = render('/scenario', '参加店舗')
    expect(labels(html)).toEqual(['はじめての方へ', '参加店舗', '貸切で遊ぶ', 'カタログ'])
    expect(html).toMatch(/<a[^>]*href="\/scenario"[^>]*>カタログ<\/a>/)
  })

  it('スマホは 2 列 × 2 行（下段が貸切で遊ぶ・カタログ）、PC（sm 以上）は横一列', () => {
    const html = render('/scenario')
    expect(html).toContain('grid grid-cols-2 gap-2 sm:flex sm:flex-wrap')
  })
})
