import { describe, it, expect } from 'vitest'
import { calculateEventGmCost, resolveGmCostIdentity, type SalarySettings } from './compensation'

const settings: SalarySettings = {
  gm_base_pay: 3000, gm_hourly_rate: 1000, gm_test_base_pay: 1500, gm_test_hourly_rate: 500,
  reception_fixed_pay: 2000, use_hourly_table: false, hourly_rates: [], gm_test_hourly_rates: [],
} as unknown as SalarySettings
const costFor = (identity: ReturnType<typeof resolveGmCostIdentity>) => calculateEventGmCost({
  ...identity, duration: 180, isGmTest: false, costs: [], getSettings: () => settings,
  storeId: 'store-A', transportAllowance: 500,
})
const staffById = new Map([
  ['id-taro', { stores: ['store-B'] }],
  ['id-hanako', { stores: ['store-A'] }],
])
const staffByName = new Map([['太郎', ['store-A']], ['花子', ['store-A']]])

describe('resolveGmCostIdentity', () => {
  it('担当表が揃っていれば staff_id をキーにし、担当店舗は ID で引く', () => {
    const identity = resolveGmCostIdentity({
      gms: ['太郎', '花子'], gm_roles: { 太郎: 'main', 花子: 'sub' },
      staff_assignments: [
        { staff_id: 'id-hanako', staff_name: '花子', ordinal: 2, resolution_status: 'resolved' },
        { staff_id: 'id-taro', staff_name: '太郎', ordinal: 1, resolution_status: 'resolved' },
      ],
    }, staffById, staffByName)
    expect(identity.gms).toEqual(['id-taro', 'id-hanako'])
    expect(identity.roles).toEqual({ 'id-taro': 'main', 'id-hanako': 'sub' })
    // 名前照合では太郎の担当店舗が store-A（同名の別人）になるが、ID 照合では store-B なので交通費が付く
    expect(costFor(identity)).toBe(costFor(resolveGmCostIdentity({ gms: ['太郎', '花子'], gm_roles: { 太郎: 'main', 花子: 'sub' } }, staffById, staffByName)) + 500)
  })
  it('ID 未解決の行は名前で扱う', () => {
    const identity = resolveGmCostIdentity({
      gms: ['太郎', '退職者'], gm_roles: {},
      staff_assignments: [
        { staff_id: 'id-taro', staff_name: '太郎', ordinal: 1, resolution_status: 'resolved' },
        { staff_id: null, staff_name: '退職者', ordinal: 2, resolution_status: 'unmatched' },
      ],
    }, staffById, staffByName)
    expect(identity.gms).toEqual(['id-taro', '退職者'])
    expect(identity.roles).toEqual({})
    expect(identity.homeStores.has('退職者')).toBe(false)
  })
  it('担当表が無い・件数が合わない公演は従来どおり名前で扱う', () => {
    const base = { gms: ['太郎'], gm_roles: { 太郎: 'main' } }
    expect(resolveGmCostIdentity(base, staffById, staffByName)).toEqual({ gms: ['太郎'], roles: { 太郎: 'main' }, homeStores: staffByName })
    expect(resolveGmCostIdentity({ ...base, staff_assignments: [] }, staffById, staffByName).gms).toEqual(['太郎'])
  })
  it('役割が未設定なら配置順で決める従来の計算を変えない', () => {
    const named = resolveGmCostIdentity({ gms: ['太郎', '花子'], gm_roles: null }, staffById, staffByName)
    const byId = resolveGmCostIdentity({
      gms: ['太郎', '花子'], gm_roles: null,
      staff_assignments: [
        { staff_id: 'id-hanako', staff_name: '花子', ordinal: 2, resolution_status: 'resolved' },
        { staff_id: 'id-taro', staff_name: '太郎', ordinal: 1, resolution_status: 'resolved' },
      ],
    }, new Map([['id-taro', { stores: ['store-A'] }], ['id-hanako', { stores: ['store-A'] }]]), staffByName)
    expect(costFor(byId)).toBe(costFor(named))
  })
})
