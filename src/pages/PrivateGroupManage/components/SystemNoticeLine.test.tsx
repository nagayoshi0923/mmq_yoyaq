// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SystemNoticeLine } from './SystemNoticeLine'
import type { NoticeLine } from './groupChatMessages'

let root: Root
let container: HTMLDivElement
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  container = document.createElement('div'); document.body.append(container); root = createRoot(container)
})
afterEach(async () => { await act(async () => root.unmount()); container.remove() })
const render = async (lines: NoticeLine[], handlers = {}) => {
  await act(async () => root.render(<MemoryRouter><SystemNoticeLine lines={lines} handlers={handlers} /></MemoryRouter>))
}
const link = () => container.querySelector<HTMLElement>('[data-testid="system-notice-link"]')

describe('自動のお知らせの灰色の 1 行', () => {
  it('まとめた文を「・」でつなぎ、リンクは末尾に 1 つだけ', async () => {
    const onGoToSchedule = vi.fn()
    await render([
      { kind: 'candidate_dates_added', text: 'いちこさんが候補日を 2 件追加', link: { label: '日程を見る', target: 'dates' } },
      { kind: 'candidate_dates_added', text: 'いちこさんが候補日を 1 件追加', link: { label: '日程を見る', target: 'dates' } },
    ], { onGoToSchedule })
    expect(container.textContent).toBe('いちこさんが候補日を 2 件追加 ・ いちこさんが候補日を 1 件追加› 日程を見る')
    expect(container.querySelectorAll('[data-testid="system-notice-link"]')).toHaveLength(1)
    await act(async () => link()!.click())
    expect(onGoToSchedule).toHaveBeenCalledOnce()
  })
  it('行き先の操作が無ければリンクを出さない（文だけ）', async () => {
    await render([{ kind: 'schedule_confirmed', text: '店舗が日程を確定しました', link: { label: '概要を見る', target: 'overview' } }])
    expect(link()).toBeNull()
    expect(container.textContent).toBe('店舗が日程を確定しました')
  })
  it('「読む」で本文を開き、URL はリンクにする', async () => {
    await render([{ kind: 'pre_reading_notice', text: '事前読み込みについて', link: { label: '読む', target: 'expand' }, detail: '資料 https://example.com' }])
    expect(container.querySelector('[data-testid="system-notice-detail"]')).toBeNull()
    await act(async () => link()!.click())
    expect(container.querySelector('[data-testid="system-notice-detail"] a')?.getAttribute('href')).toBe('https://example.com')
    expect(link()!.textContent).toBe('› 閉じる')
  })
  it('引き継ぎの「確認する」は依頼 id を渡す・お誘いは招待ページへ', async () => {
    const onOpenHandover = vi.fn()
    await render([{ kind: 'individual_notice', text: 'えいきちさんから主催者の引き継ぎの依頼', personal: true, link: { label: '確認する', target: 'handover', requestId: 'h1' } }], { onOpenHandover })
    await act(async () => link()!.click())
    expect(onOpenHandover).toHaveBeenCalledWith('h1')
    const code = 'a'.repeat(32)
    await render([{ kind: 'next_group_created', text: '次の貸切のお誘い', link: { label: '参加する', target: 'invite', inviteCode: code } }])
    expect(link()!.getAttribute('href')).toBe(`/group/invite/${code}`)
  })
})
