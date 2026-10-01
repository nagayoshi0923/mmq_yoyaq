import { afterEach, expect, it, vi } from 'vitest'
import { QueryClient } from '@tanstack/react-query'
import type { Reservation } from '@/types'
import type { MyPageData } from './useMyPageDataQuery'

const mocks = vi.hoisted(() => ({ client: null as unknown, cancel: vi.fn(), warn: vi.fn() }))
vi.mock('@tanstack/react-query', async (importOriginal) => ({
  ...await importOriginal<typeof import('@tanstack/react-query')>(),
  useQueryClient: () => mocks.client,
  useMutation: (options: unknown) => options,
}))
vi.mock('@/lib/reservationApi', () => ({ reservationApi: { cancel: mocks.cancel } }))
vi.mock('@/lib/supabase', () => ({ supabase: {} }))
vi.mock('@/utils/logger', () => ({ logger: { error: vi.fn(), warn: mocks.warn } }))
import { useCancelReservationMutation as createCancelMutationOptions, reservationDetailKeys } from './useReservationDetailQuery'

const clients: QueryClient[] = []
afterEach(() => { clients.forEach((client) => client.clear()); clients.length = 0; vi.clearAllMocks() })
const key = ['mypage-data', 'customer-a', 'a@example.invalid']
const cancelled = { id: 'booking-a', status: 'cancelled', participant_count: 1, cancelled_at: '2026-10-01T14:44:31Z' } as Reservation
function setup(queryFn: () => Promise<MyPageData>, detailFails = false) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, refetchOnMount: false } } })
  clients.push(client); mocks.client = client
  const other = { id: 'booking-b', status: 'confirmed', participant_count: 2 } as Reservation
  const cached = { reservations: [{ ...cancelled, status: 'confirmed', cancelled_at: null }, other], customerId: 'customer-a' } as MyPageData
  client.setQueryDefaults(key, { queryFn })
  client.setQueryData(key, cached)
  const detailKey = reservationDetailKeys.detail(cancelled.id)
  client.setQueryDefaults(detailKey, { queryFn: async () => {
    if (detailFails) throw new Error('詳細取得の通信失敗')
    return { reservation: cancelled, canCancelByPolicy: false, canChangeByPolicy: false }
  } })
  client.setQueryData(detailKey, { reservation: cached.reservations[0], canCancelByPolicy: true, canChangeByPolicy: true })
  mocks.cancel.mockResolvedValue(cancelled)
  const navigate = vi.fn(() => {
    expect(client.getQueryData<MyPageData>(key)?.reservations[0]).toEqual(cancelled)
    expect(client.getQueryData<MyPageData>(key)?.reservations[1]).toBe(other)
    expect(client.getQueryData(detailKey)).toMatchObject({ reservation: cancelled, canCancelByPolicy: false, canChangeByPolicy: false })
  })
  const mutation = createCancelMutationOptions(cancelled.id, navigate) as unknown as {
    mutationFn: () => Promise<Reservation>
    onSuccess: (saved: Reservation) => Promise<void>
  }
  return { client, cached, mutation, navigate, detailKey }
}

it('保存済み取消を遷移前に反映し、取消前の進行中取得の後着でも旧カードへ戻らない', async () => {
  let resolveOld!: (data: MyPageData) => void
  let resolveFresh!: (data: MyPageData) => void
  const queryFn = vi.fn()
    .mockImplementationOnce(() => new Promise<MyPageData>((resolve) => { resolveOld = resolve }))
    .mockImplementationOnce(() => new Promise<MyPageData>((resolve) => { resolveFresh = resolve }))
  const { client, cached, mutation, navigate } = setup(queryFn)
  const oldFetch = client.fetchQuery<MyPageData>({ queryKey: key }).catch(() => undefined)
  await mutation.onSuccess(await mutation.mutationFn())
  expect(navigate).toHaveBeenCalledOnce()
  expect(mocks.cancel).toHaveBeenCalledOnce()
  expect(queryFn).toHaveBeenCalledTimes(2)
  resolveOld(cached)
  await oldFetch
  expect(client.getQueryData<MyPageData>(key)?.reservations[0].status).toBe('cancelled')
  resolveFresh({ ...cached, reservations: [cancelled, cached.reservations[1]] })
  await vi.waitFor(() => expect(client.getQueryState(key)?.fetchStatus).toBe('idle'))
  expect(client.getQueryData<MyPageData>(key)?.reservations[0].status).toBe('cancelled')
})

it('一覧再取得失敗でも取消済みカードを保持し、成功遷移・取消一回を維持する', async () => {
  const refreshError = new Error('一覧取得の通信失敗')
  const { client, mutation, navigate, detailKey } = setup(vi.fn().mockRejectedValue(refreshError), true)
  await mutation.onSuccess(await mutation.mutationFn())
  await vi.waitFor(() => expect(client.getQueryState(key)?.fetchStatus).toBe('idle'))
  expect(client.getQueryState(key)?.error).toBe(refreshError)
  expect(client.getQueryData<MyPageData>(key)?.reservations[0]).toEqual(cancelled)
  await vi.waitFor(() => expect(client.getQueryState(detailKey)?.fetchStatus).toBe('idle'))
  expect(client.getQueryData(detailKey)).toMatchObject({ reservation: cancelled, canCancelByPolicy: false, canChangeByPolicy: false })
  expect(navigate).toHaveBeenCalledOnce()
  expect(mocks.cancel).toHaveBeenCalledOnce()
})
