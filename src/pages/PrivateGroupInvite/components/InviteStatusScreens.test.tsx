// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
vi.mock('@/components/layout/Header', () => ({ Header: () => null }))
vi.mock('@/components/layout/NavigationBar', () => ({ NavigationBar: () => null }))
import { InviteJoinSuccessScreen, InviteNotFoundScreen } from './InviteStatusScreens'
import { privateGroupProgress } from '@/components/patterns/privateGroup/privateGroupScheduleRules'

let root: Root
let host: HTMLDivElement
beforeEach(() => { Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true }); host = document.createElement('div'); document.body.append(host); root = createRoot(host) })
afterEach(async () => { await act(async () => root.unmount()); host.remove() })
const noop = () => {}

it('招待が見つからない時は用意済みの文と、主催者に新しいリンクを頼む案内を出す（#27）', async () => {
  await act(async () => root.render(<InviteNotFoundScreen onBackToTop={noop} />))
  expect(host.textContent).toContain('招待コードが無効か、有効期限が切れています')
  expect(host.textContent).toContain('主催者に新しい招待リンクを送ってもらってください')
  expect(host.textContent).not.toContain('グループを取得できませんでした')
})

it('店舗へ申込済みのグループに参加した時は、店舗の返事待ちと案内する（#49）', async () => {
  await act(async () => root.render(<InviteJoinSuccessScreen generatedPin="1234" guestEmail="g@example.com" progress="requested" onViewGroup={noop} onBackToTop={noop} />))
  expect(host.textContent).toContain('このグループはすでに店舗へ申し込み済みです')
  expect(host.textContent).toContain('店舗の返事をお待ちください')
  expect(host.textContent).not.toContain('主催者が全員の回答を確認後')
})

it('募集中のグループでは従来どおりの案内（#49）', async () => {
  await act(async () => root.render(<InviteJoinSuccessScreen generatedPin={null} isNewMember guestEmail="" isMember onViewGroup={noop} onBackToTop={noop} />))
  expect(host.textContent).toContain('主催者が全員の回答を確認後、貸切予約を申し込みます。')
})

it('会員にはマイページの案内、ゲストにはブックマークの案内を出す（#59）', async () => {
  await act(async () => root.render(<InviteJoinSuccessScreen generatedPin={null} isNewMember guestEmail="" isMember onViewGroup={noop} onBackToTop={noop} />))
  expect(host.textContent).toContain('マイページの貸切タブからいつでも開けます')
  expect(host.textContent).not.toContain('ブックマーク')
  await act(async () => root.render(<InviteJoinSuccessScreen generatedPin="1234" guestEmail="g@example.com" onViewGroup={noop} onBackToTop={noop} />))
  expect(host.textContent).toContain('このページをブックマークしてください')
  expect(host.textContent).not.toContain('マイページの貸切タブ')
})

it('グループの進み具合を判定する', () => {
  expect(privateGroupProgress({ status: 'gathering' }, null)).toBe('gathering')
  expect(privateGroupProgress({ status: 'booking_requested' }, null)).toBe('requested')
  expect(privateGroupProgress({ status: 'gathering', reservation_id: 'r' }, 'pending')).toBe('requested')
  expect(privateGroupProgress({ status: 'gathering', reservation_id: 'r' }, 'cancelled')).toBe('gathering')
  expect(privateGroupProgress({ status: 'booking_requested' }, 'confirmed')).toBe('confirmed')
  expect(privateGroupProgress(null, null)).toBe('gathering')
})
