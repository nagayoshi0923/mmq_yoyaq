import { getCronSecret, timingSafeEqualString } from './security.ts'
export function isRecruitmentSchedulerCall(req: Request): boolean {
  const received = (req.headers.get('x-recruitment-cron-secret') || '').trim()
  const expected = Deno.env.get('RECRUITMENT_CRON_SECRET')?.trim() || getCronSecret().trim()
  return !!expected && !!received && timingSafeEqualString(expected, received)
}
