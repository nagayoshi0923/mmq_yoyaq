import { isCronOrServiceRoleCall, timingSafeEqualString } from './security.ts'

/**
 * お客様への知らせのメール送信（process-customer-notice-emails）が定期実行からの呼び出しかを確かめる。
 * 定期実行（cron）は app_config の trigger_secret を x-cron-secret で送る。
 * 環境によって Supabase secrets の CRON_SECRET と trigger_secret が別の値になりうるため、
 * send-web-push（WEB_PUSH_CRON_SECRET）と同じく専用の CUSTOMER_NOTICE_CRON_SECRET（= trigger_secret）を先に見て、
 * 無ければ従来どおり CRON_SECRET / service role（isCronOrServiceRoleCall）で確かめる。
 */
export function isCustomerNoticeCronCall(req: Request): boolean {
  const dedicated = (Deno.env.get('CUSTOMER_NOTICE_CRON_SECRET') || '').trim()
  const received = (req.headers.get('x-cron-secret') || '').trim()
  if (dedicated && received && timingSafeEqualString(received, dedicated)) return true
  return isCronOrServiceRoleCall(req)
}
