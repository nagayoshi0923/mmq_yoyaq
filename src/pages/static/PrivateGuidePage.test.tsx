// @vitest-environment jsdom
import type { ReactNode } from 'react'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PrivateGuidePage } from './PrivateGuidePage'
import { GuidePage } from './GuidePage'
import { PRIVATE_GUIDE_FAQ, PRIVATE_GUIDE_STEPS } from './guide/privateGuideContent'
import { PrivateBookingSection } from '@/components/public-top/InfoSections'
import { parsePath } from '@/pages/adminDashboardRouting'
import { STATIC_PUBLIC_META } from '@/lib/seo'

vi.mock('@/components/layout/PublicLayout', () => ({ PublicLayout: ({ children }: { children: ReactNode }) => <div>{children}</div> }))

let root: Root
let host: HTMLDivElement
beforeEach(() => { Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true }); host = document.createElement('div'); document.body.append(host); root = createRoot(host) })
afterEach(async () => { await act(async () => root.unmount()); host.remove() })

function Where() {
  const location = useLocation()
  return <p data-testid="where">{location.pathname}</p>
}

const render = (node: ReactNode, path = '/') => act(async () => root.render(
  <MemoryRouter initialEntries={[path]}>
    <Routes><Route path="*" element={<>{node}<Where /></>} /></Routes>
  </MemoryRouter>,
))
const hrefs = () => [...host.querySelectorAll('a')].map(a => a.getAttribute('href'))

describe('貸切の流れ（/guide/private）', () => {
  it('手順の見出しとよくある質問がそろっている', async () => {
    await render(<PrivateGuidePage />)
    const headings = [...host.querySelectorAll('h2')].map(h => h.textContent)
    for (const step of PRIVATE_GUIDE_STEPS) expect(headings).toContain(step)
    expect(headings).toContain('貸切でよくある質問')
    const faq = host.querySelector('[data-testid="private-guide-faq"]')
    for (const q of ['主催者を代わってもらえますか', '作ったグループを閉じたい・申込を取り下げたい', 'ゲストで参加しましたが、PIN を忘れました', '参加する人数が減ったらどうなりますか', '途中からメンバーを足せますか', 'クーポンは使えますか']) {
      expect(faq?.textContent).toContain(`Q. ${q}`)
    }
    expect(PRIVATE_GUIDE_FAQ).toHaveLength(6)
  })

  it('今の仕様の要点を書いている（名称は「事前配役アンケート」、古い言い方は使わない）', async () => {
    await render(<PrivateGuidePage />)
    const text = host.textContent ?? ''
    for (const phrase of ['貸切で遊ぶ', '招待リンクを送る', '4 桁の PIN', '候補日を選んで店舗に申し込む', '店舗の返事待ち', '事前配役アンケート', '72 時間', 'マイページから取り消せるのは公演の30日前まで', '開演の 10 分前', '思い出']) {
      expect(text).toContain(phrase)
    }
    expect(text).not.toContain('公演前アンケート')
    // 申込の取り下げはグループを残すか選べる（2026-10-20 社長決定）
    expect(text).toContain('グループを残すか閉じるかを選べます')
    expect(text).toContain('候補日を直してもう一度申し込めます')
    expect(text).not.toContain('別運営')
  })

  it('リンク先: 組織なしは共通のページ、組織付きはその組織のページ', async () => {
    await render(<PrivateGuidePage />)
    expect(hrefs()).toEqual(expect.arrayContaining(['/', '/guide', '/cancel-policy', '/faq']))
    await render(<PrivateGuidePage organizationSlug="queens-waltz" />, '/queens-waltz/guide/private')
    expect(hrefs()).toEqual(expect.arrayContaining(['/queens-waltz', '/queens-waltz/guide', '/queens-waltz/cancel-policy', '/queens-waltz/faq']))
  })

  it('URL と SEO のメタ', () => {
    expect(parsePath('/guide/private')).toEqual({ page: 'guide-private', scenarioId: null, organizationSlug: null })
    expect(parsePath('/queens-waltz/guide/private')).toEqual({ page: 'guide-private', scenarioId: null, organizationSlug: 'queens-waltz' })
    expect(parsePath('/guide').page).toBe('guide')
    expect(parsePath('/queens-waltz/guide')).toMatchObject({ page: 'guide', organizationSlug: 'queens-waltz' })
    expect(STATIC_PUBLIC_META['guide-private'].path).toBe('/guide/private')
  })
})

describe('使い方ガイドとトップからのリンク', () => {
  it('使い方ガイドの貸切の節は貸切の流れへ案内する', async () => {
    await render(<GuidePage />, '/guide')
    expect(host.querySelector('[data-testid="guide-private-link"]')?.getAttribute('href')).toBe('/guide/private')
    expect(host.textContent).not.toContain('貸切でよくある質問')
    await render(<GuidePage organizationSlug="queens-waltz" />, '/queens-waltz/guide')
    expect(host.querySelector('[data-testid="guide-private-link"]')?.getAttribute('href')).toBe('/queens-waltz/guide/private')
  })

  it('使い方ガイドの上に入口が 2 つ（予約の流れは手順 1 へ、貸切の流れは別ページへ）', async () => {
    await render(<GuidePage />, '/guide')
    expect(host.textContent).toContain('公演の予約と、貸切の流れをご案内します')
    expect(host.textContent).not.toContain('4 つの手順でできます')
    const booking = host.querySelector('[data-testid="guide-entry-booking"]')
    expect(booking?.textContent).toContain('公演を予約する流れ')
    expect(booking?.getAttribute('href')).toBe('#booking-steps')
    expect(host.querySelector('#booking-steps')?.textContent).toContain('空いている公演を探す')
    const priv = host.querySelector('[data-testid="guide-entry-private"]')
    expect(priv?.textContent).toContain('貸切の流れ')
    expect(priv?.getAttribute('href')).toBe('/guide/private')
    // 入口は手順 1 より前にある
    expect(booking!.compareDocumentPosition(host.querySelector('#booking-steps')!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()

    const scroll = vi.fn()
    Element.prototype.scrollIntoView = scroll
    await act(async () => (booking as HTMLAnchorElement).click())
    expect(scroll).toHaveBeenCalled()
    delete (Element.prototype as { scrollIntoView?: unknown }).scrollIntoView

    await render(<GuidePage organizationSlug="queens-waltz" />, '/queens-waltz/guide')
    expect(host.querySelector('[data-testid="guide-entry-private"]')?.getAttribute('href')).toBe('/queens-waltz/guide/private')
  })

  it('貸切の流れの上に、公演を予約する流れへの入口がある', async () => {
    await render(<PrivateGuidePage />, '/guide/private')
    const entry = host.querySelector('[data-testid="private-guide-entry-booking"]')
    expect(entry?.textContent).toContain('公演を予約する流れ')
    expect(entry?.getAttribute('href')).toBe('/guide')
    await render(<PrivateGuidePage organizationSlug="queens-waltz" />, '/queens-waltz/guide/private')
    expect(host.querySelector('[data-testid="private-guide-entry-booking"]')?.getAttribute('href')).toBe('/queens-waltz/guide')
  })

  it('以前のリンク（/guide?section=private）は貸切の流れへ移す', async () => {
    await render(<GuidePage />, '/guide?section=private')
    expect(host.querySelector('[data-testid="where"]')?.textContent).toBe('/guide/private')
  })

  it('トップの「貸切の流れ」', async () => {
    await render(<PrivateBookingSection text="t" primaryColor="#000" />)
    expect([...host.querySelectorAll('a')].find(a => a.textContent === '貸切の流れを見る')?.getAttribute('href')).toBe('/guide/private')
    await render(<PrivateBookingSection text="t" scenariosPath="/queens-waltz/private-booking-select" guidePath="/queens-waltz/guide/private" primaryColor="#000" />)
    expect([...host.querySelectorAll('a')].find(a => a.textContent === '貸切の流れ')?.getAttribute('href')).toBe('/queens-waltz/guide/private')
  })
})
