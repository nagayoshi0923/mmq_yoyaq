// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
const mock = vi.hoisted(() => ({ staff: vi.fn(), from: vi.fn(), insert: vi.fn() }))
vi.mock('@/lib/api/staffApi', () => ({ staffApi: { getAll: mock.staff } }))
vi.mock('@/lib/api/scenarioApi', () => ({ scenarioApi: { getAll: async () => [{ id: 'scenario', title: '検証作品' }] } }))
vi.mock('@/lib/api/scenarioAliasApi', () => ({ getScenarioAliases: async () => ({}) }))
vi.mock('@/hooks/useOrganization', () => ({ useOrganization: () => ({ organizationId: 'org' }) }))
vi.mock('@/lib/supabase', () => ({ supabase: { from: mock.from } }))
vi.mock('./importSchedule/ImportPreview', () => ({ ImportPreview: ({ previewErrors }: { previewErrors: string[] }) => <div data-testid="preview">{previewErrors.join('\n')}</div> }))
import { ImportScheduleModal } from './ImportScheduleModal'
let root: Root
let host: HTMLDivElement
const button = (label: string) => [...document.querySelectorAll('button')].find(b => b.textContent?.trim() === label)!
async function render() { await act(async () => root.render(<ImportScheduleModal isOpen onClose={() => {}} onImportComplete={() => {}} currentDisplayDate={new Date(2026, 9, 1)} />)) }
async function input(text: string) { await act(async () => { const area = document.querySelector('textarea')!; Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(area, text); area.dispatchEvent(new Event('input', { bubbles: true })); area.dispatchEvent(new Event('change', { bubbles: true })) }) }
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  vi.clearAllMocks(); mock.staff.mockResolvedValue([{ id: 'staff', name: '既存GM' }])
  const q: any = { select: () => q, gte: () => q, lte: async () => ({ data: [], error: null }) }
  mock.insert.mockResolvedValue({ error: null })
  q.insert = mock.insert
  mock.from.mockReturnValue(q)
  host = document.createElement('div'); document.body.append(host); root = createRoot(host)
})
afterEach(async () => { await act(async () => root.unmount()); host.remove() })
it('スタッフ一覧の取得中はプレビューを開始できない', async () => {
  mock.staff.mockReturnValue(new Promise(() => {})); await render(); await input('10/1\t木\t馬場\t検証作品\t既存GM')
  expect(button('プレビュー').disabled).toBe(true)
  expect(document.body.textContent).toContain('スタッフ一覧を取得中')
})
it('取得失敗を表示し、再試行成功後にプレビューを開始できる', async () => {
  mock.staff.mockRejectedValueOnce(new Error('offline')); await render(); await input('10/1\t木\t馬場\t検証作品\t既存GM')
  expect(button('プレビュー').disabled).toBe(true)
  expect(document.body.textContent).toContain('スタッフ一覧を取得できませんでした')
  await act(async () => button('再試行').click())
  expect(button('プレビュー').disabled).toBe(false)
})
it('未登録担当の検証エラーではプレビューを残し完了画面へ移らない', async () => {
  await render(); await input('10/1\t木\t馬場\t検証作品\t未登録GM')
  await act(async () => { button('プレビュー').click(); await new Promise(resolve => setTimeout(resolve, 150)) })
  expect(document.querySelector('[data-testid="preview"]')).not.toBeNull()
  await act(async () => { button('1件をインポート').click(); await new Promise(resolve => setTimeout(resolve, 70)) })
  expect(document.querySelector('[data-testid="preview"]')?.textContent).toContain('保存前の確認で停止')
  expect(button('戻る')).toBeDefined(); expect(button('完了')).toBeUndefined()
  expect(mock.from).toHaveBeenCalledTimes(1)
})

it('保存しない重複行の未登録担当は有効行の保存を止めない', async () => {
  await render(); await input('10/1\t木\t馬場\t検証作品\t既存GM\n10/1\t木\t馬場\t検証作品\t未登録GM')
  await act(async () => { (document.querySelector('#replaceExisting') as HTMLInputElement).click() })
  await act(async () => { button('プレビュー').click(); await new Promise(resolve => setTimeout(resolve, 200)) })
  await act(async () => { button('2件をインポート').click(); await new Promise(resolve => setTimeout(resolve, 100)) })
  expect(mock.insert).toHaveBeenCalledOnce()
  expect(mock.insert.mock.calls[0][0]).toHaveLength(1)
  expect(mock.insert.mock.calls[0][0][0].gms).toEqual(['既存GM'])
})
