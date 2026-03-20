/**
 * PostgREST / ブラウザ経由で起きやすい一時的な失敗（再試行で回復することが多い）
 */
export function isTransientSupabaseError(err: unknown): boolean {
  if (err == null || typeof err !== 'object') return false
  const o = err as { message?: string; details?: string; code?: string }
  const text = `${o.message || ''} ${o.details || ''}`.toLowerCase()
  if (text.includes('upstream request timeout')) return true
  if (text.includes('failed to fetch')) return true
  if (text.includes('load failed')) return true
  if (text.includes('networkerror')) return true
  if (text.includes('network request failed')) return true
  if (/\b(502|503|504|524)\b/.test(text)) return true
  return false
}
