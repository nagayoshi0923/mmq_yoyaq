import { beforeEach, describe, expect, it, vi } from 'vitest'

const supabaseMock = vi.hoisted(() => {
  const select = vi.fn()
  const eqScenario = vi.fn(() => ({ select }))
  const eqCustomer = vi.fn(() => ({ eq: eqScenario }))
  const deleteRows = vi.fn(() => ({ eq: eqCustomer }))
  const from = vi.fn(() => ({ delete: deleteRows }))

  return { select, eqScenario, eqCustomer, deleteRows, from }
})

vi.mock('./supabase', () => ({
  supabase: { from: supabaseMock.from },
}))

import { removePlayedOverride } from './playedOverrides'

describe('removePlayedOverride', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('削除したoverrideがあればtrueを返す', async () => {
    supabaseMock.select.mockResolvedValue({ data: [{ id: 'override-1' }], error: null })

    await expect(removePlayedOverride('customer-1', 'scenario-1')).resolves.toBe(true)
    expect(supabaseMock.from).toHaveBeenCalledWith('customer_played_overrides')
    expect(supabaseMock.eqCustomer).toHaveBeenCalledWith('customer_id', 'customer-1')
    expect(supabaseMock.eqScenario).toHaveBeenCalledWith('scenario_master_id', 'scenario-1')
    expect(supabaseMock.select).toHaveBeenCalledWith('id')
  })

  it('overrideが存在しなければfalseを返す', async () => {
    supabaseMock.select.mockResolvedValue({ data: [], error: null })

    await expect(removePlayedOverride('customer-1', 'scenario-1')).resolves.toBe(false)
  })

  it('削除に失敗した場合はエラーを返す', async () => {
    const error = new Error('delete failed')
    supabaseMock.select.mockResolvedValue({ data: null, error })

    await expect(removePlayedOverride('customer-1', 'scenario-1')).rejects.toBe(error)
  })
})
