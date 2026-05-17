import { createClient } from '@supabase/supabase-js'

// VITE_SUPABASE_URL はフロント用だが Vercel に既設定済みのため fallback として使う
const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

// モジュール読み込み時に throw しない（FUNCTION_INVOCATION_FAILED を防ぐ）
// 代わりに db を使う時点でエラーを返す
export const db = (supabaseUrl && serviceRoleKey)
  ? createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })
  : null

export function getMissingEnvError(): string | null {
  if (!supabaseUrl) return 'SUPABASE_URL（または VITE_SUPABASE_URL）が設定されていません'
  if (!serviceRoleKey) return 'SUPABASE_SERVICE_ROLE_KEY が設定されていません'
  return null
}
