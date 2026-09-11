import { ApiError } from './auth.js'

const FIELDS = 'id, store_id, opening_hours, holidays, special_open_days, special_closed_days'
// The database client is injected so the tenant boundary can be tested without live data.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function storeBusinessHours(database: any, orgId: string | null, storeId: unknown, value?: unknown) {
  if (!orgId) throw new ApiError(403, '組織を確認できません')
  if (typeof storeId !== 'string' || !storeId) throw new ApiError(400, '店舗IDが必要です')
  const store = await database.from('stores').select('id').eq('id', storeId).eq('organization_id', orgId).maybeSingle()
  if (store.error) throw new ApiError(500, '店舗を確認できません')
  if (!store.data) throw new ApiError(404, '店舗が見つかりません')
  if (value === undefined) {
    const result = await database.from('business_hours_settings').select(FIELDS).eq('store_id', storeId).eq('organization_id', orgId).maybeSingle()
    if (result.error) throw new ApiError(500, '営業時間を取得できません')
    return result.data
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new ApiError(400, '設定形式が不正です')
  const body = value as Record<string, unknown>
  const hours = body.opening_hours
  if (!hours || typeof hours !== 'object' || Array.isArray(hours)) throw new ApiError(400, '営業時間が必要です')
  const dayNames = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']
  for (const day of dayNames) {
    const entry = (hours as Record<string, unknown>)[day] as Record<string, unknown> | undefined
    if (!entry || typeof entry !== 'object' || typeof entry.is_open !== 'boolean' || !Array.isArray(entry.available_slots) || entry.available_slots.some(slot => !['morning', 'afternoon', 'evening'].includes(String(slot)))) throw new ApiError(400, '曜日の営業時間が不正です')
  }
  const readDays = (key: string) => {
    const days = body[key]
    if (!Array.isArray(days) || days.length > 2000) throw new ApiError(400, '特別日の形式が不正です')
    return days.map(day => {
      if (!day || typeof day !== 'object' || typeof day.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(day.date) || typeof day.note !== 'string' || day.note.length > 2000) throw new ApiError(400, '特別日の形式が不正です')
      return { date: day.date, note: day.note }
    })
  }
  const specialOpen = readDays('special_open_days')
  const specialClosed = readDays('special_closed_days')
  const fields = {
    opening_hours: hours,
    special_open_days: specialOpen,
    special_closed_days: specialClosed,
    holidays: [...new Set(specialClosed.map(day => day.date))].sort(),
  }
  const result = await database.from('business_hours_settings').update(fields).eq('store_id', storeId).eq('organization_id', orgId).select('id')
  if (result.error) throw new ApiError(500, '営業時間を保存できません')
  if (!result.data?.length) {
    const created = await database.from('business_hours_settings').insert({ ...fields, store_id: storeId, organization_id: orgId })
    if (created.error) throw new ApiError(500, '営業時間を作成できません')
  }
  return { success: true }
}
