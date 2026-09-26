import { beforeEach, describe, expect, it, vi } from 'vitest'
const { db, load } = vi.hoisted(() => ({ db: { rpc: vi.fn() }, load: vi.fn() }))
vi.mock('../../api/_lib/db.js', () => ({ db, getMissingEnvError: () => null }))
vi.mock('../../supabase/functions/_shared/load-setting-layers.js', () => ({ loadSettingLayers: load }))
import { operatingSettings, groupSurveySettings } from '../../api/_lib/operatingSettings'
const org = 'eeeeeeee-1000-4000-8000-000000000001'
const user = { orgId: org, userId: 'staff-a', role: 'admin', jwt: 'fixture-only' } as const
const res = { status: vi.fn(() => res), json: vi.fn(), setHeader: vi.fn() }
const request = (settings: unknown = { preparation_minutes: 0 }, revision: unknown = 0) => ({
  query: { scope: 'organization', target_id: 'eeeeeeee-1000-4000-8000-000000000002', organization_id: 'foreign' },
  body: { settings, expected_revision: revision },
})
beforeEach(() => { vi.clearAllMocks(); db.rpc.mockResolvedValue({ data: 1, error: null }); load.mockResolvedValue({ layers: {}, revisions: {}, context: {} }) })
describe('設定階層API', () => {
  it('共通設定の所属は認証済み組織から決定する', async () => {
    await operatingSettings(request() as never, res as never, user, true)
    expect(db.rpc).toHaveBeenCalledWith('save_operating_setting_overrides', expect.objectContaining({ p_organization_id: org, p_target_id: org, p_values: { preparation_minutes: 0 } }))
  })
  it('スタッフは参照できるが変更できない', async () => {
    await operatingSettings(request() as never, res as never, { ...user, role: 'staff' })
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ can_edit: false }))
    await expect(operatingSettings(request() as never, res as never, { ...user, role: 'staff' }, true)).rejects.toMatchObject({ status: 403 })
    expect(db.rpc).not.toHaveBeenCalled()
  })
  it('顧客からの参照を拒否する', async () => {
    await expect(operatingSettings(request() as never, res as never, { ...user, role: 'customer' })).rejects.toMatchObject({ status: 403 })
    expect(load).not.toHaveBeenCalled()
  })
  it.each([{ unknown: 1 }, { preparation_minutes: -1 }, { resend_api_key: 'secret' }, null, [], {}])('不正入力 %j をDBへ渡さない', async settings => {
    await expect(operatingSettings(request(settings) as never, res as never, user, true)).rejects.toMatchObject({ status: 400 })
    expect(db.rpc).not.toHaveBeenCalled()
  })
  it('競合を再読込が必要な409として返す', async () => {
    db.rpc.mockResolvedValue({ error: { code: '40001' } })
    await expect(operatingSettings(request() as never, res as never, user, true)).rejects.toMatchObject({ status: 409 })
  })
  it('所属違いは対象なしとして返す', async () => {
    db.rpc.mockResolvedValue({ error: { code: '42501' } })
    await expect(operatingSettings(request() as never, res as never, user, true)).rejects.toMatchObject({ status: 404 })
  })
})

describe('貸切グループのアンケート適用値API', () => {
  const group = 'eeeeeeee-2000-4000-8000-000000000001'
  it('任意の組織指定を採用せず認証組織とグループで解決する', async () => {
    await groupSurveySettings({ query: { group_id: group, organization_id: 'foreign' } } as never, res as never, user)
    expect(db.rpc).toHaveBeenCalledWith('get_private_group_survey_settings', { p_organization_id: org, p_group_id: group })
  })
  it('一覧の適用値は一括で取得する', async () => {
    await groupSurveySettings({ query: { group_ids: `${group},${org}` } } as never, res as never, user)
    expect(db.rpc).toHaveBeenCalledWith('get_private_groups_survey_settings', { p_organization_id: org, p_group_ids: [group, org] })
  })
  it('顧客はスタッフ用取得APIを使えない', async () => {
    await expect(groupSurveySettings({ query: { group_id: group } } as never, res as never, { ...user, role: 'customer' })).rejects.toMatchObject({ status: 403 })
    expect(db.rpc).not.toHaveBeenCalled()
  })
  it('別組織グループのDB拒否を404にする', async () => {
    db.rpc.mockResolvedValue({ error: { code: '42501' } })
    await expect(groupSurveySettings({ query: { group_id: group } } as never, res as never, user)).rejects.toMatchObject({ status: 404 })
  })
  it('過大な一覧要求をDBに渡さない', async () => {
    await expect(groupSurveySettings({ query: { group_ids: Array(101).fill(group).join(',') } } as never, res as never, user)).rejects.toMatchObject({ status: 400 })
    expect(db.rpc).not.toHaveBeenCalled()
  })
})

describe('案内前の期限固定', () => {
  it('認証済み組織のグループを固定する', async () => {
    await groupSurveySettings({ query: { group_id: org } } as never, res as never, user, true)
    expect(db.rpc).toHaveBeenCalledWith('freeze_private_group_survey_deadline', { p_organization_id: org, p_group_id: org })
  })
  it('一覧参照の操作で期限を一括固定しない', async () => {
    await expect(groupSurveySettings({ query: { group_ids: org } } as never, res as never, user, true)).rejects.toMatchObject({ status: 400 })
    expect(db.rpc).not.toHaveBeenCalled()
  })
})
