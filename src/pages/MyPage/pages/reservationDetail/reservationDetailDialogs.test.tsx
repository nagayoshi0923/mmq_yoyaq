// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { ReservationCancelDialog } from './ReservationCancelDialog'
import { ParticipantCountDialog } from './ParticipantCountDialog'
import { resolveWhenSaved } from '../../hooks/useReservationDetailQuery'
import { pendingNotificationCount } from '@/lib/pendingNotifications'

vi.mock('@/lib/supabase', () => ({ supabase: {} }))

let root: Root
let host: HTMLDivElement
beforeEach(() => { Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true }); host = document.createElement('div'); document.body.append(host); root = createRoot(host) })
afterEach(() => { act(() => root.unmount()); host.remove(); document.body.innerHTML = '' })

it('取消確認に公演・日時・キャンセル料を出し、スマホでは「やめる」を赤いボタンより上に置く（点検 20・41）', () => {
  act(() => root.render(
    <ReservationCancelDialog
      open
      onOpenChange={() => {}}
      summary={{ title: '作品A', datetimeLabel: '10/29(木) 19:00 開演', storeName: '馬場店', participantCount: 2, reservationNumber: '261011-ABCD', freeDeadlineLabel: '10/27(火) 19:00' }}
      isPending={false}
      onConfirm={() => {}}
    />,
  ))
  const dialog = document.querySelector('[data-testid="reservation-cancel-dialog"]')!
  expect(dialog.textContent).toContain('作品A')
  expect(dialog.textContent).toContain('10/29(木) 19:00 開演')
  expect(dialog.textContent).toContain('261011-ABCD')
  expect(document.querySelector('[data-testid="reservation-cancel-fee"]')!.textContent).toBe('かかりません（10/27(火) 19:00 までは無料）')
  const buttons = Array.from(dialog.querySelectorAll('button')).filter(b => ['やめる', 'キャンセルする'].includes(b.textContent ?? ''))
  expect(buttons.map(b => b.textContent)).toEqual(['やめる', 'キャンセルする'])
  expect(buttons.every(b => b.className.includes('h-11'))).toBe(true)
})

it('人数変更に変更後の合計を出し、#1026 の「最大 N 名まで変更できます」を保つ（点検 37・38）', () => {
  act(() => root.render(
    <ParticipantCountDialog
      open onOpenChange={() => {}} currentCount={2} value={3} onValueChange={() => {}}
      maxSelectableCount={8} canDecrease decreaseDeadlineLabel="10/28(水) 19:00" unitPrice={5000}
      canSubmit isPending={false} onConfirm={() => {}}
    />,
  ))
  const dialog = document.querySelector('[data-testid="participant-count-dialog"]')!
  expect(dialog.textContent).toContain('最大8名まで変更できます（いまの予約は2名）')
  expect(dialog.textContent).toContain('人数を減らせるのは 10/28(水) 19:00 まで（公演の24時間前まで）')
  const total = document.querySelector('[data-testid="participant-count-total"]')!.textContent
  expect(total).toContain('¥15,000')
  expect(total).toContain('¥5,000 × 3名')
  expect(total).toContain('いまの合計 ¥10,000')
})

it('人数を減らせる期限を過ぎたら追加のみの案内', () => {
  act(() => root.render(
    <ParticipantCountDialog
      open onOpenChange={() => {}} currentCount={2} value={2} onValueChange={() => {}}
      maxSelectableCount={8} canDecrease={false} decreaseDeadlineLabel="10/28(水) 19:00" unitPrice={5000}
      canSubmit isPending={false} onConfirm={() => {}}
    />,
  ))
  expect(document.body.textContent).toContain('人数を減らせる期限（10/28(水) 19:00）を過ぎたため、人数の追加のみできます')
})

it('保存できた時点で解決し、通知は裏で続ける（その間はタブを閉じる前に確認）（点検 36）', async () => {
  let finishNotifications!: () => void
  const result = await resolveWhenSaved<string>((onSaved) => new Promise<string>((resolve) => {
    onSaved('saved')
    finishNotifications = () => resolve('done')
  }))
  expect(result).toBe('saved')
  expect(pendingNotificationCount()).toBe(1)
  finishNotifications()
  await Promise.resolve(); await Promise.resolve()
  expect(pendingNotificationCount()).toBe(0)
})

it('保存前の失敗はそのまま失敗', async () => {
  await expect(resolveWhenSaved(() => Promise.reject(new Error('save failed')))).rejects.toThrow('save failed')
})

it('割引のある予約は「いまの合計」をサーバー確定金額（割引後）で出し、割引の扱いを添える（公開前検証 P2）', () => {
  act(() => root.render(
    <ParticipantCountDialog
      open onOpenChange={() => {}} currentCount={2} value={3} onValueChange={() => {}}
      maxSelectableCount={8} canDecrease decreaseDeadlineLabel="10/28(水) 19:00" unitPrice={4500}
      currentTotal={8000} currentDiscount={1000}
      canSubmit isPending={false} onConfirm={() => {}}
    />,
  ))
  const total = document.querySelector('[data-testid="participant-count-total"]')!.textContent
  expect(total).toContain('いまの合計 ¥8,000')
  expect(document.querySelector('[data-testid="participant-count-discount-note"]')!.textContent).toContain('−¥1,000')
})
