import type { VercelRequest, VercelResponse } from '@vercel/node'

// 環境変数と基本的な動作を確認するための診断エンドポイント
// 確認後は削除すること
export default function handler(_req: VercelRequest, res: VercelResponse) {
  res.status(200).json({
    ok: true,
    env: {
      SUPABASE_URL: process.env.SUPABASE_URL ? '✅ set' : '❌ missing',
      SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY ? '✅ set' : '❌ missing',
      ALLOWED_ORIGIN: process.env.ALLOWED_ORIGIN ?? '(not set)',
    },
  })
}
