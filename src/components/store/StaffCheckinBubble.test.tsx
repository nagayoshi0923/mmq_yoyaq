import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { ErrorBoundary } from '@/components/ErrorBoundary'
import { StaffCheckinFallback, StaffCheckinPanel } from './StaffCheckinBubble'
import type { StaffCheckinState } from './staffCheckinState'

vi.mock('@/lib/api/storeDashboardApi', () => ({
  storeDashboardApi: {
    getStaffCheckin: vi.fn(),
    staffCheckin: vi.fn(),
    cancelStaffCheckin: vi.fn(),
  },
}))

const actions = {
  disabled: false,
  onCheckin: vi.fn(),
  onCancel: vi.fn(),
  onRetry: vi.fn(),
}

function render(state: StaffCheckinState) {
  return renderToStaticMarkup(<StaffCheckinPanel state={state} currentTime="15:42" {...actions} />)
}

describe('StaffCheckinPanel', () => {
  it('loadingを安全に描画する', () => {
    expect(render({ status: 'loading' })).toContain('出勤打刻を確認中')
  })

  it('未打刻では現在時刻の出勤ボタンだけを表示する', () => {
    const html = render({ status: 'ready-unchecked' })
    expect(html).toContain('出勤打刻がまだです')
    expect(html).toContain('15:42 出勤打刻する')
    expect(html).not.toContain('退勤')
    expect(html).not.toContain('取り消す')
  })

  it('打刻済みでも時刻と取消を常時表示する', () => {
    const html = render({ status: 'ready-checked', checkedInAt: '2026-08-03T04:30:00.000Z' })
    expect(html).toContain('出勤打刻済み（13:30）')
    expect(html).toContain('取り消す')
    expect(html).not.toContain('退勤')
  })

  it('API失敗と利用不可を例外なく描画する', () => {
    expect(render({ status: 'error', message: 'API失敗' })).toContain('もう一度確認する')
    expect(render({ status: 'unavailable' })).toContain('現在利用できません')
  })

  it('局所ErrorBoundaryの描画例外時に店舗ダッシュボード継続用fallbackを返す', () => {
    const boundary = new ErrorBoundary({ children: <div>打刻UI</div>, fallback: <StaffCheckinFallback /> })
    boundary.state = {
      ...boundary.state,
      ...ErrorBoundary.getDerivedStateFromError(new Error('render failure')),
    }
    expect(renderToStaticMarkup(boundary.render() as React.ReactElement)).toContain('店舗ダッシュボードの他の機能はそのまま利用できます')
  })
})
