import { supabase } from '@/lib/supabase'

/** ゲストの PIN 再発行を頼む。登録の有無にかかわらず同じ案内が返る（参加の有無を漏らさない） */
export async function requestGuestPinReset(inviteCode: string, email: string): Promise<{ ok: boolean; message: string }> {
  const { data, error } = await supabase.functions.invoke('request-guest-pin-reset', { body: { inviteCode, email } })
  if (error) return { ok: false, message: 'ただいま送信できません。時間をおいてお試しください。' }
  return { ok: true, message: (data as { message?: string } | null)?.message || 'ご登録があれば、新しいPINをメールでお送りしました。' }
}
