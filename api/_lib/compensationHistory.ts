import type { SupabaseClient } from '@supabase/supabase-js'
import { createSalarySettingsResolver, type SalarySettings } from '../../src/lib/compensation.js'
const FIELDS = 'effective_from,gm_base_pay,gm_hourly_rate,gm_test_base_pay,gm_test_hourly_rate,reception_fixed_pay,use_hourly_table,hourly_rates,gm_test_hourly_rates'
/** 公演期間に必要な当時の設定を取得。取得失敗・欠落を現在設定で補わない。 */
export async function loadCompensationHistory(client: SupabaseClient, organizationId: string, start: string, end: string) {
  const { data: initial, error } = await client.from('salary_settings_history').select(FIELDS)
    .eq('organization_id', organizationId).lte('effective_from', start)
    .order('effective_from', { ascending: false }).limit(1).maybeSingle()
  if (error) throw error
  const rows: SalarySettings[] = initial ? [initial as SalarySettings] : []
  for (let offset = 0; ; offset += 500) {
    const result = await client.from('salary_settings_history').select(FIELDS)
      .eq('organization_id', organizationId).gt('effective_from', start).lte('effective_from', end)
      .order('effective_from').range(offset, offset + 499)
    if (result.error) throw result.error
    rows.push(...(result.data ?? []) as SalarySettings[])
    if ((result.data?.length ?? 0) < 500) break
  }
  return createSalarySettingsResolver(rows)
}
