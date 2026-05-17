import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error(
    'SUPABASE_URL と SUPABASE_SERVICE_ROLE_KEY 環境変数が必要です。' +
    'Vercel の Environment Variables に設定してください。'
  )
}

// service_role クライアント: RLS を完全にバイパスする
// 絶対にフロントエンドのコードに含めないこと
export const db = createClient(supabaseUrl, serviceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
})
