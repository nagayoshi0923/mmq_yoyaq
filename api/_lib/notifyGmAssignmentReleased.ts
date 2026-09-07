import {
  buildGmAssignmentReleasedBody,
  type GmAssignmentReleasedCopyInput,
} from '../../src/lib/gmAssignmentReleasedCopy.js'

export function joinedScheduleEvent(reservation: {
  schedule_events?: Record<string, unknown> | Record<string, unknown>[] | null
} | null | undefined): Record<string, unknown> | null {
  const raw = reservation?.schedule_events
  if (!raw) return null
  return (Array.isArray(raw) ? raw[0] : raw) ?? null
}

export function isPrivateBookingEvent(
  reservation: { private_group_id?: string | null } | null | undefined,
  scheduleEvent: Record<string, unknown> | null,
): boolean {
  return Boolean(
    reservation?.private_group_id
      || scheduleEvent?.is_private_booking
      || scheduleEvent?.category === 'private',
  )
}

export async function notifyGmAssignmentReleased(params: GmAssignmentReleasedCopyInput & {
  organizationId?: string | null
  gms?: string[] | null
}): Promise<void> {
  const gms = (params.gms ?? []).map((name) => name.trim()).filter(Boolean)
  const organizationId = (params.organizationId || '').trim()
  if (gms.length === 0 || !organizationId) return

  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !serviceRoleKey) {
    console.warn('[notifyGmAssignmentReleased] skipped: missing supabase env')
    return
  }

  try {
    const response = await fetch(`${supabaseUrl}/functions/v1/notify-gm-assignment-released`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${serviceRoleKey}`,
      },
      body: JSON.stringify({
        organizationId,
        gms,
        body: buildGmAssignmentReleasedBody(params),
      }),
    })
    if (!response.ok) {
      const text = await response.text().catch(() => '')
      console.error('[notifyGmAssignmentReleased] edge fn error:', response.status, text.slice(0, 500))
    }
  } catch (error) {
    console.error('[notifyGmAssignmentReleased] fetch error:', error)
  }
}
