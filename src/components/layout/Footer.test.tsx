// @vitest-environment jsdom
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { Footer } from './Footer'

describe('フッター', () => {
  it('「店舗の方へ」は出さず、ほかのリンクは残す', () => {
    const html = renderToStaticMarkup(<MemoryRouter><Footer /></MemoryRouter>)
    expect(html).not.toContain('店舗の方へ')
    expect(html).not.toContain('href="/for-business"')
    for (const href of ['/stores', '/guide', '/faq', '/terms', '/privacy', '/security', '/contact']) {
      expect(html).toContain(`href="${href}"`)
    }
  })
})
