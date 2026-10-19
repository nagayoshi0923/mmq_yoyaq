// @vitest-environment jsdom
import { act, useState } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
vi.mock('@/hooks/useScenarioStoreHint', () => ({ useScenarioStoreHint: () => null }))
vi.mock('@/components/patterns/privateGroup/CandidateDateRows', () => ({ CandidateDateRows: () => <div data-testid="registered-rows" /> }))
vi.mock('@/pages/PrivateGroupManage/components/AddCandidateDates', () => ({
  AddCandidateDates: ({ layout, onCancel }: { layout?: string; onCancel?: () => void }) => (
    <div data-testid="add-candidate-dates" data-layout={layout ?? 'embedded'}>
      <button type="button" onClick={onCancel}>キャンセル</button>
      <button type="button">候補日を保存</button>
    </div>
  ),
}))
import type { PrivateGroup } from '@/types'
import { GroupDatesTab } from './GroupDatesTab'
import { buildAnswerTable } from './groupPageModel'

const group = {
  id: 'g1', organization_id: 'org', scenario_master_id: 'sm', preferred_store_ids: ['s1'], status: 'gathering', invite_code: 'X',
  members: [{ id: 'm1', status: 'joined', is_organizer: true, guest_name: '主催', user_id: 'u1' }],
  candidate_dates: [{ id: 'c1', date: '2099-03-01', time_slot: '夜間', start_time: '19:00', end_time: '23:00', status: 'active', responses: [] }],
} as unknown as PrivateGroup

let root: Root, host: HTMLDivElement
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  host = document.createElement('div'); document.body.append(host); root = createRoot(host)
})
afterEach(async () => { await act(async () => root.unmount()); host.remove(); document.body.innerHTML = '' })

function Harness() {
  // 親（グループ画面）は ?sheet=dates の有無で editorOpen を決める
  const [open, setOpen] = useState(false)
  return (
    <GroupDatesTab
      group={group}
      table={buildAnswerTable(group, 'm1')}
      isOrganizer
      canMutateSchedule
      isMember
      onAnswer={async () => {}}
      editorOpen={open}
      onOpenEditor={() => setOpen(true)}
      onCloseEditor={() => setOpen(false)}
      onDatesChanged={() => {}}
      onRemind={async () => {}}
      preferredStoreNames={['大塚店']}
      onEditStore={() => {}}
      formatDateJaMd={(d) => d}
      title="ファクター"
    />
  )
}

it('「候補日を追加・編集」を 1 回押すと、マイページと同じ全画面の候補日画面が開き、保存が下に出る', async () => {
  await act(async () => root.render(<Harness />))
  expect(document.querySelector('[data-testid="candidate-dates-dialog"]')).toBeNull()
  const toggle = host.querySelector('[data-testid="toggle-date-editor"]') as HTMLButtonElement
  expect(toggle.textContent).toBe('候補日を追加・編集')
  await act(async () => toggle.click())
  const dialog = document.querySelector('[data-testid="candidate-dates-dialog"]') as HTMLElement
  expect(dialog).not.toBeNull()
  // スマホは全画面（マイページと同じクラス）
  expect(dialog.className).toContain('max-sm:h-dvh')
  expect(dialog.textContent).toContain('ファクター ・ 希望店舗: 大塚店')
  // カレンダーはダイアログ版で最初から開いている（もう 1 回押す必要がない）
  expect(dialog.querySelector('[data-testid="add-candidate-dates"]')?.getAttribute('data-layout')).toBe('dialog')
  expect([...dialog.querySelectorAll('button')].some(b => b.textContent === '候補日を保存')).toBe(true)
  // キャンセルで閉じる
  const cancel = [...dialog.querySelectorAll('button')].find(b => b.textContent === 'キャンセル')!
  await act(async () => cancel.click())
  expect(document.querySelector('[data-testid="candidate-dates-dialog"]')).toBeNull()
})
