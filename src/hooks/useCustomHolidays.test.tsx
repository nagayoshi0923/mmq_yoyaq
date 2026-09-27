// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { beforeEach, afterEach, expect, it, vi } from 'vitest'
import { useCustomHolidays } from './useCustomHolidays'
const rpc = vi.hoisted(() => vi.fn())
const staffRead = vi.hoisted(() => vi.fn())
vi.mock('@/lib/supabase', () => ({ supabase: { rpc } }))
vi.mock('@/lib/api/organizationSettingsApi', () => ({ organizationSettingsApi: { getCustomHolidays: staffRead } }))
vi.mock('@/lib/organization', () => ({ resolveOrganizationFromPathSegment: vi.fn() }))
vi.mock('@/utils/logger', () => ({ logger: { error: vi.fn() } }))
vi.mock('@/utils/toast', () => ({ showToast: { error: vi.fn(), success: vi.fn() } }))
let root: Root
let result: ReturnType<typeof useCustomHolidays>
function Harness({ organizationId }: { organizationId: string }) { result = useCustomHolidays({ organizationId }); return null }
const render = (organizationId: string) => act(async () => { root.render(<Harness organizationId={organizationId} />) })
beforeEach(() => {
 Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
 root = createRoot(document.createElement('div'))
})
afterEach(async () => { await act(async () => root.unmount()); vi.resetAllMocks() })
it('顧客の組織IDで公開休日RPCを読みスタッフAPIを呼ばない', async () => {
 rpc.mockResolvedValue({ data: [{ custom_holidays: ['2030-01-08'] }], error: null })
 await render('group-org')
 expect(rpc).toHaveBeenCalledExactlyOnceWith('get_public_custom_holidays', { p_organization_id: 'group-org' })
 expect(staffRead).not.toHaveBeenCalled()
 expect(result.isCustomHoliday('2030-01-08')).toBe(true)
 expect(result.isLoading).toBe(false)
 expect(result.error).toBeNull()
})
it('取得失敗を休日なしの成功へ変換しない', async () => {
 rpc.mockResolvedValue({ data: null, error: { message: 'offline' } })
 await render('org-a')
 expect(result.error).toContain('休日設定を取得できません')
})
it('組織切替中は読み込み中とし、前の組織の遅い応答を破棄する', async () => {
 let resolveOld!: (data: unknown) => void
 let resolveNew!: (data: unknown) => void
 rpc.mockReturnValueOnce(new Promise(resolve => { resolveOld = resolve }))
 rpc.mockReturnValueOnce(new Promise(resolve => { resolveNew = resolve }))
 await render('org-a')
 await render('org-b')
 expect(result.isLoading).toBe(true)
 await act(async () => resolveNew({ data: [{ custom_holidays: ['2030-01-09'] }], error: null }))
 await act(async () => resolveOld({ data: [{ custom_holidays: ['2030-01-08'] }], error: null }))
 expect(result.customHolidays).toEqual(['2030-01-09'])
 expect(result.isLoading).toBe(false)
})
