import { beforeEach, expect, it, vi } from 'vitest'
const mocks=vi.hoisted(()=>({get:vi.fn(),from:vi.fn()}))
vi.mock('@/lib/supabase',()=>({supabase:{from:mocks.from}}))
vi.mock('@/lib/apiClient',()=>({apiClient:{get:mocks.get}}))
import { storeApi } from './storeApi'
beforeEach(()=>{vi.clearAllMocks();mocks.get.mockResolvedValue([{id:'store',name:'Store',is_temporary:false}])})
it('旧skipOrgFilter引数でも内部情報をブラウザーから直接取得しない',async()=>{
 expect(await storeApi.getAll(false,'foreign-org',true)).toHaveLength(1)
 expect(mocks.get).toHaveBeenCalledWith('/api/stores')
 expect(mocks.from).not.toHaveBeenCalled()
})
it('スタッフAPIが拒否した場合に直接参照へフォールバックしない',async()=>{
 mocks.get.mockRejectedValueOnce(new Error('forbidden'))
 await expect(storeApi.getAll()).rejects.toThrow('forbidden')
 expect(mocks.from).not.toHaveBeenCalled()
})
