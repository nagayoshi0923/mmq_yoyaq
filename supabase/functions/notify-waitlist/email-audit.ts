import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import type { EmailLogInsert, EmailLogUpdate } from '../_shared/email-logs.ts'

/** 同じ配送の再試行は同じ監査行・Webhookタグを使う。 */
export async function waitlistEmailAuditId(deliveryKey: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`waitlist-email:${deliveryKey}`))
  const hex = [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('').slice(0, 32)
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

export async function ensureWaitlistEmailAudit(client: SupabaseClient, id: string, data: EmailLogInsert): Promise<boolean> {
  try {
    // 再送時に既存のsent/failed行や固定本文をqueuedへ戻さない。
    const { error } = await client.from('email_logs').upsert({ id, provider: 'resend', ...data }, { onConflict: 'id', ignoreDuplicates: true })
    if (error) return false
    const { data: row, error: readError } = await client.from('email_logs').select('id').eq('id', id).maybeSingle()
    return !readError && row?.id === id
  } catch { return false }
}

/** 警告だけで握り潰す共有helperと分け、更新行の存在まで確認する。 */
export async function acknowledgeWaitlistEmailAudit(client: SupabaseClient, id: string | null, updates: EmailLogUpdate): Promise<boolean> {
  if (!id) return false
  try {
    const { data: row, error } = await client.from('email_logs').update(updates).eq('id', id).select('id').maybeSingle()
    return !error && row?.id === id
  } catch { return false }
}
