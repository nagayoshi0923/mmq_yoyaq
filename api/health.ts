import type { VercelRequest, VercelResponse } from '@vercel/node'

export default function handler(_req: VercelRequest, res: VercelResponse) {
  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
  res.status(200).json({
    ok: true,
    env: {
      SUPABASE_URL: process.env.SUPABASE_URL ? '✅ set' : '❌ missing',
      VITE_SUPABASE_URL: process.env.VITE_SUPABASE_URL ? '✅ set' : '❌ missing',
      supabaseUrl_resolved: supabaseUrl ? '✅ resolved' : '❌ both missing',
      SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY ? '✅ set' : '❌ missing',
      ALLOWED_ORIGIN: process.env.ALLOWED_ORIGIN ?? '(not set)',
    },
  })
}
