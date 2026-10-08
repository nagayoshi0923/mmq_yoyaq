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
    const { error } = await client.from('email_logs').upsert({ id, provider: 'resend', ...data }, { onConflict: 'id', ignoreDuplicates: true })
    if (error) return false
    const { data: row, error: readError } = await client.from('email_logs').select('id').eq('id', id).eq('organization_id', data.organization_id).maybeSingle()
    return !readError && row?.id === id
  } catch { return false }
}

/** Webhookの先行更新を戻さず、以前の既知拒否だけを成功へ進める。 */
export async function acknowledgeWaitlistEmailAudit(client: SupabaseClient, id: string | null, organizationId: string, updates: Pick<EmailLogUpdate, 'provider_message_id' | 'sent_at'>): Promise<boolean> {
  if (!id) return false
  try {
    const accepted = { ...updates, status: 'sent', error_message: null }
    const queued = await client.from('email_logs').update(accepted).eq('id', id).eq('organization_id', organizationId).eq('status', 'queued').select('id').maybeSingle()
    if (queued.error) return false
    if (queued.data?.id === id) return true
    // provider IDのないfailedは外部受理前の既知拒否。Webhookのfailedを戻さない。
    const rejected = await client.from('email_logs').update(accepted).eq('id', id).eq('organization_id', organizationId).eq('status', 'failed').is('provider_message_id', null).select('id').maybeSingle()
    if (rejected.error) return false
    if (rejected.data?.id === id) return true
    const advanced = await client.from('email_logs').update(updates).eq('id', id).eq('organization_id', organizationId).select('id').maybeSingle()
    return !advanced.error && advanced.data?.id === id
  } catch { return false }
}

export async function failWaitlistEmailAudit(client: SupabaseClient, id: string | null, organizationId: string, message: string): Promise<void> {
  if (!id) return
  try {
    await client.from('email_logs').update({ status: 'failed', error_message: message }).eq('id', id).eq('organization_id', organizationId).is('provider_message_id', null).in('status', ['queued', 'failed'])
  } catch { /* 配送結果はfinish RPC側で別に管理する。 */ }
}
