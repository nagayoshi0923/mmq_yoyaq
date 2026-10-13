import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { PerformanceSearchState } from '@/components/public-top/usePerformanceSearchParams'
import { PlatformSearchForm } from './PlatformSearchForm'

const state: PerformanceSearchState = {
  preset: 'week', date: null, onlyAvailable: true, beginnerOnly: false, storeIds: [], area: null, view: 'cards',
}

describe('MMQ 全体トップの横断検索', () => {
  it('人数の選択が無く、日付の既定は「今週」', () => {
    const html = renderToStaticMarkup(
      <PlatformSearchForm
        state={state}
        range={{ from: '2026-10-12', to: '2026-10-18' }}
        prefectures={['東京都']}
        today="2026-10-12"
        maxDate="2026-12-31"
        markedDates={new Set()}
        primaryColor="#E60012"
        onChange={() => {}}
        onSubmit={() => {}}
      />,
    )
    expect(html).toContain('今週')
    expect(html).not.toContain('今週末')
    expect(html).not.toContain('人数')
    expect(html).not.toContain('名</span>')
    expect(html).toContain('空いている公演を探す')
  })
})
