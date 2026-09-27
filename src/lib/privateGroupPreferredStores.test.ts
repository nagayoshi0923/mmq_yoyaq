import { beforeEach, describe, expect, it, vi } from 'vitest'
import { savePrivateGroupPreferredStores } from './privateGroupPreferredStores'
const rpc = vi.hoisted(() => vi.fn())
vi.mock('@/lib/supabase', () => ({ supabase: { rpc } }))
beforeEach(() => vi.clearAllMocks())
describe('希望店舗と候補日整理の保存', () => {
  it('編集開始時の店舗と新しい店舗を一括保存し、削除した候補数を返す', async () => {
    rpc.mockResolvedValue({ data: 2, error: null })
    expect(await savePrivateGroupPreferredStores('group', ['new'], ['old'])).toBe(2)
    expect(rpc).toHaveBeenCalledExactlyOnceWith('private_group_set_preferred_stores', {
      p_group_id: 'group', p_store_ids: ['new'], p_expected_store_ids: ['old'],
    })
  })
  it('競合・権限・DB失敗を成功へ変換しない', async () => {
    const error = { code: '40001', message: '選び直してください' }
    rpc.mockResolvedValue({ data: null, error })
    await expect(savePrivateGroupPreferredStores('group', ['new'], ['old'])).rejects.toEqual(error)
  })
  it.each([null, -1, '2', { success: false }])('不正な保存結果 %j で成功通知を出さない', async data => {
    rpc.mockResolvedValue({ data, error: null })
    await expect(savePrivateGroupPreferredStores('group', ['new'], [])).rejects.toThrow('保存結果を確認できません')
  })
})
