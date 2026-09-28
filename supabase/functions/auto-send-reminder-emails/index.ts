// @ts-nocheck
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { getCorsHeaders, sanitizeErrorMessage, errorResponse, getServiceRoleKey, isCronOrServiceRoleCall, timingSafeEqualString } from '../_shared/security.ts'
import { runScheduledReminders } from '../_shared/run-scheduled-reminders.ts'

async function acceptsTriggerSecret(cronHeader: string): Promise<boolean> {
  if (!cronHeader || !getServiceRoleKey()) return false
  const probe = createClient(Deno.env.get('SUPABASE_URL') ?? '', getServiceRoleKey())
  const { data, error } = await probe.from('app_config').select('value').eq('key', 'trigger_secret').maybeSingle()
  if (error || typeof data?.value !== 'string') return false
  const expected = data.value.trim()
  return !!expected && timingSafeEqualString(expected, cronHeader)
}

serve(async req => {
  const corsHeaders = getCorsHeaders(req.headers.get('origin'))
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  // DB cron は app_config.trigger_secret を送る。専用env・共通CRON・DB値の順で許可する。
  const reminderSecret = (Deno.env.get('REMINDER_CRON_SECRET') || '').trim()
  const cronHeader = (req.headers.get('x-cron-secret') || '').trim()
  const isReminderCron = !!reminderSecret && !!cronHeader && timingSafeEqualString(reminderSecret, cronHeader)
  if (!isReminderCron && !isCronOrServiceRoleCall(req) && !(await acceptsTriggerSecret(cronHeader))) {
    return errorResponse('Unauthorized', 401, corsHeaders)
  }
  try {
    const db = createClient(Deno.env.get('SUPABASE_URL') ?? '', getServiceRoleKey())
    const result = await runScheduledReminders(db)
    return Response.json(result, { headers: corsHeaders, status: result.failures ? 500 : 200 })
  } catch (error) {
    return errorResponse(sanitizeErrorMessage(error), 500, corsHeaders)
  }
})
