// @ts-nocheck
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { getCorsHeaders, sanitizeErrorMessage, errorResponse, getServiceRoleKey, isCronOrServiceRoleCall, timingSafeEqualString } from '../_shared/security.ts'
import { runScheduledReminders } from '../_shared/run-scheduled-reminders.ts'

serve(async req => {
  const corsHeaders = getCorsHeaders(req.headers.get('origin'))
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  // DB cron uses app_config.trigger_secret; its mirror is independent of other cron callers.
  const reminderSecret = (Deno.env.get('REMINDER_CRON_SECRET') || '').trim()
  const cronHeader = (req.headers.get('x-cron-secret') || '').trim()
  const isReminderCron = !!reminderSecret && !!cronHeader && timingSafeEqualString(reminderSecret, cronHeader)
  if (!isReminderCron && !isCronOrServiceRoleCall(req)) return errorResponse('Unauthorized', 401, corsHeaders)
  try {
    const db = createClient(Deno.env.get('SUPABASE_URL') ?? '', getServiceRoleKey())
    const result = await runScheduledReminders(db)
    return Response.json(result, { headers: corsHeaders, status: result.failures ? 500 : 200 })
  } catch (error) {
    return errorResponse(sanitizeErrorMessage(error), 500, corsHeaders)
  }
})
