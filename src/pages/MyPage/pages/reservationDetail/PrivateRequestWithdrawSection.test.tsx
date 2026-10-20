// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

const mock = vi.hoisted(() => ({
  cancelWithGroupLock: vi.fn(async () => true),
  readPrivateGroup: vi.fn(async () => ({
    group: { members: [{ status: 'joined' }, { status: 'joined' }, { status: 'joined' }, { status: 'left' }] },
  })),
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
}))
vi.mock('@/lib/supabase', () => ({ supabase: {} }))
vi.mock('@/lib/reservationApi', () => ({ reservationApi: { cancelWithGroupLock: mock.cancelWithGroupLock } }))
vi.mock('@/lib/privateGroupRead', () => ({ readPrivateGroup: mock.readPrivateGroup }))
vi.mock('sonner', () => ({ toast: { success: mock.toastSuccess, error: mock.toastError } }))

import { PrivateRequestWithdrawSection } from './PrivateRequestWithdrawSection'
import { PRIVATE_REQUEST_WITHDRAWN_REASON } from '@/lib/constants/reservationStatus'

let root: Root
let host: HTMLDivElement
const onDone = vi.fn()
const button = (text: string) => [...document.querySelectorAll('button')].find(node => node.textContent === text)
const radio = (value: string) => document.querySelector<HTMLButtonElement>(`[role="radio"][value="${value}"]`)
const flush = () => act(async () => { await new Promise(resolve => setTimeout(resolve, 0)) })

async function render(groupId: string | null) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  await act(async () => root.render(
    <QueryClientProvider client={client}>
      <PrivateRequestWithdrawSection reservationId="r1" groupId={groupId} onDone={onDone} />
    </QueryClientProvider>,
  ))
  await flush()
  await act(async () => button('取り下げる')!.click())
}

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  host = document.createElement('div'); document.body.append(host); root = createRoot(host); vi.clearAllMocks()
})
afterEach(async () => { await act(async () => root.unmount()); host.remove(); document.body.innerHTML = '' })

it('グループのある申込: 選択肢を出し、既定の「申込だけ取り下げる」で keepGroup を渡す', async () => {
  await render('g1')
  const text = document.body.textContent ?? ''
  expect(text).toContain('グループを残すか、一緒に閉じるかを選べます')
  expect(text).toContain('申込だけ取り下げる')
  expect(text).toContain('メンバー 2 名に知らせます')
  expect(radio('keep_group')!.getAttribute('aria-checked')).toBe('true')
  await act(async () => button('申込を取り下げる')!.click())
  await flush()
  expect(mock.cancelWithGroupLock).toHaveBeenCalledExactlyOnceWith('r1', null, PRIVATE_REQUEST_WITHDRAWN_REASON, { keepGroup: true })
  expect(mock.toastSuccess).toHaveBeenCalledWith('申込を取り下げました。候補日を直してもう一度申し込めます')
  expect(onDone).toHaveBeenCalledWith({ groupKept: true })
})

it('「グループも閉じる」を選ぶと keepGroup なし（従来の閉じる処理）', async () => {
  await render('g1')
  await act(async () => radio('close_group')!.click())
  await act(async () => button('取り下げてグループを閉じる')!.click())
  await flush()
  expect(mock.cancelWithGroupLock).toHaveBeenCalledExactlyOnceWith('r1', null, PRIVATE_REQUEST_WITHDRAWN_REASON, { keepGroup: false })
  expect(mock.toastSuccess).toHaveBeenCalledWith('申込を取り下げました')
  expect(onDone).toHaveBeenCalledWith({ groupKept: false })
})

it('グループの無い直接申込: 選択肢を出さず、グループを読まずに従来どおり取り下げる', async () => {
  await render(null)
  expect(document.body.textContent).not.toContain('一緒に閉じるかを選べます')
  expect(radio('keep_group')).toBeNull()
  expect(mock.readPrivateGroup).not.toHaveBeenCalled()
  await act(async () => button('申込を取り下げる')!.click())
  await flush()
  expect(mock.cancelWithGroupLock).toHaveBeenCalledExactlyOnceWith('r1', null, PRIVATE_REQUEST_WITHDRAWN_REASON, { keepGroup: false })
  expect(onDone).toHaveBeenCalledWith({ groupKept: false })
})

it('失敗したら理由を出し、画面を移らない', async () => {
  mock.cancelWithGroupLock.mockRejectedValueOnce(new Error('この申込はすでに取り下げ済みです。画面を更新してください。'))
  await render('g1')
  await act(async () => button('申込を取り下げる')!.click())
  await flush()
  expect(mock.toastError).toHaveBeenCalledWith('この申込はすでに取り下げ済みです。画面を更新してください。')
  expect(onDone).not.toHaveBeenCalled()
})
