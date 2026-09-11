export function isPrivateReminder(reservation: { private_group_id?: string | null, reservation_source?: string | null }, event: { is_private_booking?: boolean | null, is_private_request?: boolean | null, category?: string | null } | null) {
  return Boolean(reservation.private_group_id || event?.is_private_booking || event?.is_private_request || event?.category === 'private' || reservation.reservation_source === 'private_booking' || reservation.reservation_source === 'web_private')
}

export function privateReminderDefault(companyName = '', companyPhone = '', companyEmail = '') {
  return `{customer_name} 様\n\n{day_message}\n貸切公演のご予約内容をご確認ください。\n\n■ ご予約内容\nシナリオ名: {scenario_title}\n開催日時: {date} {time}開演 {end_time}終演\n会場: {venue}\n会場住所: {venue_address}\n参加人数: {participants}名様\nご請求金額: ¥{total_price}\n\n■ 当日のご案内\nご予約内容と会場をご確認のうえ、お時間に余裕を持ってお越しください。\n参加される皆様にもご案内を共有してください。\n変更・キャンセルのご相談は店舗へご連絡ください。\n\n${companyName}\n${companyPhone ? `TEL: ${companyPhone}` : ''}\n${companyEmail ? `Email: ${companyEmail}` : ''}`
}

export function selectPrivateReminder(rows: Array<{ store_id: string | null, private_reminder_template?: string | null }>, storeId?: string | null): string | null {
  const exact = rows.find(r => r.store_id === storeId)?.private_reminder_template
  if (exact?.trim()) return exact
  const orgDefault = rows.find(r => r.store_id === null)?.private_reminder_template
  return orgDefault?.trim() ? orgDefault : null
}
