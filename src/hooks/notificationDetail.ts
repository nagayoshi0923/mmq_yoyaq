// ベルの通知の詳細ウィンドウで見せる項目（metadata.details）の取り出し。supabase に依存しない

/** metadata.details から文字列の項目だけを取り出す（配列でなければ undefined） */
export function notificationDetailsFromMetadata(metadata: unknown): string[] | undefined {
  if (!metadata || typeof metadata !== 'object') return undefined
  const details = (metadata as Record<string, unknown>).details
  if (!Array.isArray(details)) return undefined
  return details.filter((d): d is string => typeof d === 'string' && d.trim() !== '')
}
