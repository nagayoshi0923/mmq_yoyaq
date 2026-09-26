/** クーポン編集の入力境界。配布済みの条件は DB の rules_snapshot が保持する。 */
const fields = new Set(['name','description','discount_type','discount_amount','max_uses_per_customer','target_type','target_ids','target_store_ids','same_scenario_once','trigger_type','valid_from','valid_until','coupon_expiry_days','coupon_expiry_months','murder_mystery_only','usage_valid_from','usage_valid_until','max_total_grants','max_grants_per_customer','coupon_code','notify_on_grant','min_order_amount','combinable','allowed_weekdays','allowed_time_slots','display_name','display_image_url','customer_terms','internal_memo','is_active'])
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export function validateCouponCampaign(input: Record<string, unknown>): Record<string, unknown> {
  const data = Object.fromEntries(Object.entries(input).filter(([key]) => fields.has(key)))
  if (typeof data.name !== 'string' || !data.name.trim()) throw new Error('キャンペーン名を入力してください')
  if (!['fixed','percentage'].includes(String(data.discount_type))) throw new Error('割引方法が不正です')
  if (!Number.isInteger(data.discount_amount) || Number(data.discount_amount) <= 0 || (data.discount_type === 'percentage' && Number(data.discount_amount) > 100)) throw new Error('割引額は正の整数、割引率は1〜100%で指定してください')
  for (const key of ['max_uses_per_customer','coupon_expiry_days','coupon_expiry_months','max_total_grants','max_grants_per_customer','min_order_amount']) {
    if (data[key] != null && (!Number.isInteger(data[key]) || Number(data[key]) < (key === 'min_order_amount' ? 0 : 1))) throw new Error('回数・有効期間・金額を確認してください')
  }
  if (!['all','specific_scenarios','specific_organization'].includes(String(data.target_type))) throw new Error('対象範囲が不正です')
  for (const key of ['target_ids','target_store_ids']) {
    if (data[key] != null && (!Array.isArray(data[key]) || !(data[key] as unknown[]).every(x => typeof x === 'string' && uuid.test(x)))) throw new Error('対象の指定が不正です')
  }
  if (data.target_type !== 'all' && (!Array.isArray(data.target_ids) || data.target_ids.length === 0)) throw new Error('対象を1件以上選択してください')
  if (data.allowed_weekdays != null && (!Array.isArray(data.allowed_weekdays) || !data.allowed_weekdays.every(x => Number.isInteger(x) && x >= 0 && x <= 6))) throw new Error('曜日の指定が不正です')
  if (data.allowed_time_slots != null && (!Array.isArray(data.allowed_time_slots) || !data.allowed_time_slots.every(x => ['朝','昼','夜','朝公演','昼公演','夜公演'].includes(x)))) throw new Error('時間帯の指定が不正です')
  for (const key of ['combinable','same_scenario_once','murder_mystery_only','notify_on_grant','is_active']) {
    if (data[key] != null && typeof data[key] !== 'boolean') throw new Error('設定値が不正です')
  }
  for (const [from,to] of [['valid_from','valid_until'],['usage_valid_from','usage_valid_until']]) {
    for (const key of [from,to]) {
      if (data[key] != null) {
        if (typeof data[key] !== 'string' || !Number.isFinite(Date.parse(data[key] as string))) throw new Error('日付を確認してください')
        if (/^\d{4}-\d{2}-\d{2}$/.test(data[key] as string)) data[key] += key === to ? 'T23:59:59+09:00' : 'T00:00:00+09:00'
      }
    }
    if (data[from] && data[to] && Date.parse(data[from] as string) > Date.parse(data[to] as string)) throw new Error('開始日は終了日以前にしてください')
  }
  return data
}
