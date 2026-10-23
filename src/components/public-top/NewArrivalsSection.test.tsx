import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { NewArrivalsSection } from './NewArrivalsSection'
import { scenarioBrowseCard } from './scenarioCards'

const card = (id: string, title: string) => scenarioBrowseCard({ id, title, key_visual_url: null, player_count_min: 4, player_count_max: 6 }, [], `/qw/scenario/${id}`)

function render(items: Parameters<typeof NewArrivalsSection>[0]['items'], catalogPath = '/qw/catalog') {
  return renderToStaticMarkup(
    <MemoryRouter>
      <NewArrivalsSection items={items} lead="この組織で遊べる、新しく掲載された作品" allPath={catalogPath} onOpen={() => {}} />
    </MemoryRouter>,
  )
}

describe('新作一覧の区画', () => {
  it('見出し・一言・すべて見る（カタログへ）と、渡した順のカードと公開日を出す', () => {
    const html = render([
      { card: card('a', '新しい作品'), date: { date: '2026-10-13', kind: 'listed' as const } },
      { card: card('b', '少し前の作品'), date: { date: '2026-09-16', kind: 'release' as const } },
    ])
    expect(html).toContain('新作一覧')
    expect(html).toContain('この組織で遊べる、新しく掲載された作品')
    expect(html).toContain('href="/qw/catalog"')
    expect(html.indexOf('新しい作品')).toBeLessThan(html.indexOf('少し前の作品'))
    expect(html).toContain('掲載登録日：2026.10.13')
    expect(html).toContain('リリース日：2026.09.16')
  })

  it('0 件なら区画ごと出さない', () => {
    expect(render([])).toBe('')
  })
})
