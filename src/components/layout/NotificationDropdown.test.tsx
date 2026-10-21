// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { Notification } from '@/hooks/useNotifications'

const nav = vi.hoisted(() => ({ navigate: vi.fn(), location: { pathname: '/', search: '' } }))
vi.mock('react-router-dom', () => ({ useNavigate: () => nav.navigate, useLocation: () => nav.location }))
const hook = vi.hoisted(() => ({
  notifications: [] as Notification[],
  markAsRead: vi.fn(),
  markAllAsRead: vi.fn(),
  markBellSeen: vi.fn(async () => {}),
}))
vi.mock('@/hooks/useNotifications', () => {
  return {
    useNotifications: () => ({
      notifications: hook.notifications,
      loading: false,
      unreadCount: hook.notifications.filter((n) => !n.read).length,
      newCount: 0,
      markBellSeen: hook.markBellSeen,
      fetchNotifications: vi.fn(),
      markAsRead: hook.markAsRead,
      markAllAsRead: hook.markAllAsRead,
    }),
  }
})
import { NotificationDropdown } from './NotificationDropdown'

const releaseNote: Notification = {
  id: '11111111-1111-4111-8111-111111111111',
  type: 'system',
  title: '予約サイトが新しくなりました',
  message: '貸切グループのチャットで写真が共有できるようになりました。詳しくはこのお知らせを開いてご覧ください。',
  timestamp: new Date(Date.now() - 60_000),
  read: false,
  link: '/mypage?tab=reservations&sub=private',
  data: { kind: 'release_note', key: 'release-2026-10' },
  details: ['写真を共有できます（1 グループ 10 枚まで）。', 'クーポンは来店時に「もぎる」で提示できます。'],
}
const normal: Notification = {
  id: '22222222-2222-4222-8222-222222222222',
  type: 'reservation_confirmed',
  title: '予約が確定しました',
  message: '「作品」のご予約を承りました',
  timestamp: new Date(Date.now() - 120_000),
  read: false,
  link: '/mypage',
  data: { kind: 'reservation_confirmed' },
}

let host: HTMLDivElement
let root: ReturnType<typeof createRoot>
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  nav.navigate.mockReset(); nav.location = { pathname: '/', search: '' }; hook.markAsRead.mockReset(); hook.markAllAsRead.mockReset()
  hook.notifications = [releaseNote, normal]
  host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host)
})
afterEach(async () => {
  await act(async () => root.unmount())
  host.remove(); document.body.innerHTML = ''
})

async function openBellAndClick(title: string) {
  await act(async () => root.render(<NotificationDropdown />))
  const bell = host.querySelector('button[title="通知"]') as HTMLButtonElement
  await act(async () => { bell.click() })
  const item = [...document.body.querySelectorAll('p')].find((p) => p.textContent === title)!.closest('div.cursor-pointer') as HTMLElement
  await act(async () => { item.click() })
}
const dialog = () => document.body.querySelector('[role="dialog"]') as HTMLElement | null
const buttonIn = (el: HTMLElement, label: string) => [...el.querySelectorAll('button')].find((b) => b.textContent?.trim() === label) as HTMLButtonElement | undefined

it('お知らせ（details つき）を押すと遷移せずに詳細ウィンドウが開き、本文と項目が出て既読 API が 1 回だけ呼ばれる', async () => {
  await openBellAndClick('予約サイトが新しくなりました')
  const d = dialog()
  expect(d).not.toBeNull()
  expect(d!.textContent).toContain('予約サイトが新しくなりました')
  expect(d!.textContent).toContain('詳しくはこのお知らせを開いてご覧ください。')
  expect([...d!.querySelectorAll('li')].map((li) => li.textContent)).toEqual(releaseNote.details)
  expect(hook.markAsRead).toHaveBeenCalledTimes(1)
  expect(hook.markAsRead).toHaveBeenCalledWith(releaseNote.id)
  expect(nav.navigate).not.toHaveBeenCalled()
})

it('ふつうの通知も押しただけでは遷移せず、全文（改行つき）を詳細ウィンドウで見せる。項目が無ければ箇条書きは出ない', async () => {
  const long = '一行目\n二行目\n' + 'あ'.repeat(1600)
  hook.notifications = [{ ...normal, message: long }]
  await openBellAndClick('予約が確定しました')
  const d = dialog()!
  expect(nav.navigate).not.toHaveBeenCalled()
  const body = [...d.querySelectorAll('p')].find((p) => p.textContent?.startsWith('一行目'))!
  expect(body.textContent).toBe(long)
  expect(body.className).toContain('whitespace-pre-wrap')
  expect(d.querySelector('ul')).toBeNull()
  expect(hook.markAsRead).toHaveBeenCalledWith(normal.id)
})

it('「開く」で link へ遷移してウィンドウを閉じる', async () => {
  await openBellAndClick('予約が確定しました')
  await act(async () => { buttonIn(dialog()!, '開く')!.click() })
  expect(nav.navigate).toHaveBeenCalledTimes(1)
  expect(nav.navigate).toHaveBeenCalledWith('/mypage')
  expect(dialog()).toBeNull()
})

it('link が無い通知には「開く」が出ない', async () => {
  hook.notifications = [{ ...normal, link: undefined }]
  await openBellAndClick('予約が確定しました')
  const d = dialog()!
  expect(buttonIn(d, '開く')).toBeUndefined()
  expect(buttonIn(d, '閉じる')).toBeDefined()
})

it('既読の通知を開いても既読 API は呼ばない', async () => {
  hook.notifications = [{ ...normal, read: true }]
  await openBellAndClick('予約が確定しました')
  expect(dialog()).not.toBeNull()
  expect(hook.markAsRead).not.toHaveBeenCalled()
})

it('閉じる → もう一度開く で同じ内容が出て、遷移はしない', async () => {
  await openBellAndClick('予約が確定しました')
  await act(async () => { buttonIn(dialog()!, '閉じる')!.click() })
  expect(dialog()).toBeNull()
  await openBellAndClick('予約が確定しました')
  expect(dialog()!.textContent).toContain('「作品」のご予約を承りました')
  expect(nav.navigate).not.toHaveBeenCalled()
})

it('ブラウザの戻るなどで画面が変わったら詳細ウィンドウを閉じる', async () => {
  await openBellAndClick('予約が確定しました')
  expect(dialog()).not.toBeNull()
  nav.location = { pathname: '/previous', search: '' }
  await act(async () => root.render(<NotificationDropdown />))
  expect(dialog()).toBeNull()
})

it('閉じたらベルのボタンへフォーカスが戻る（閉じるボタン・Esc とも）', async () => {
  await openBellAndClick('予約が確定しました')
  const bell = host.querySelector('button[title="通知"]') as HTMLButtonElement
  expect(dialog()!.contains(document.activeElement)).toBe(true)
  await act(async () => { buttonIn(dialog()!, '閉じる')!.click() })
  await act(async () => { await new Promise((r) => setTimeout(r, 0)) })
  expect(dialog()).toBeNull()
  expect(document.activeElement).toBe(bell)
  // もう一度開いて Esc で閉じる
  await act(async () => { bell.click() })
  const item = [...document.body.querySelectorAll('p')].find((p) => p.textContent === '予約が確定しました')!.closest('div.cursor-pointer') as HTMLElement
  await act(async () => { item.click() })
  expect(dialog()).not.toBeNull()
  await act(async () => { document.activeElement!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })) })
  await act(async () => { await new Promise((r) => setTimeout(r, 0)) })
  expect(dialog()).toBeNull()
  expect(document.activeElement).toBe(bell)
})

it('長い URL や英数字でも横に広がらないよう、列を縮められて折り返す指定がある', async () => {
  hook.notifications = [{ ...normal, message: 'https://example.invalid/' + 'a'.repeat(240) }]
  await openBellAndClick('予約が確定しました')
  const d = dialog()!
  expect(d.className).toContain('grid-cols-[minmax(0,1fr)]')
  expect(d.className).toContain('[&>*]:min-w-0')
  const body = [...d.querySelectorAll('p')].find((p) => p.textContent?.startsWith('https://'))!
  expect(body.className).toContain('[overflow-wrap:anywhere]')
})
