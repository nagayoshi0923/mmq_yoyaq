// @vitest-environment jsdom
// 点検 F15: 別の公演と時間帯が重なるときの確認で「この公演に既に予約があります」と出していた
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { TimeConflictConfirmDialog } from './TimeConflictConfirmDialog'

describe('時間帯が重なる別の公演の予約の確認', () => {
  it('重なっている別の公演の予約を案内し、同じ公演の予約とは言わない。続けて追加できる', async () => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
    const onConfirm = vi.fn()
    const root = createRoot(document.createElement('div'))
    await act(async () => root.render(<MemoryRouter><TimeConflictConfirmDialog open onOpenChange={() => {}} onConfirm={onConfirm}
      existing={{ title: '別の作品', reservation_number: '261026-ABCD', participant_count: 2 }} /></MemoryRouter>))
    const text = document.body.textContent ?? ''
    expect(text).toContain('同じ時間帯に別の公演の予約があります')
    expect(text).toContain('公演: 別の作品')
    expect(text).not.toContain('この公演に既に予約があります')
    expect(text).not.toContain('人数を変更したい場合')
    const confirm = [...document.body.querySelectorAll('button')].find((b) => b.textContent?.includes('新規予約を追加する'))!
    await act(async () => confirm.click())
    expect(onConfirm).toHaveBeenCalled()
    await act(async () => root.unmount())
  })
})
