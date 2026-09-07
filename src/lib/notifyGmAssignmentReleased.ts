import { supabase } from '@/lib/supabase'
import { logger } from '@/utils/logger'
import {
  buildGmAssignmentReleasedBody,
  type GmAssignmentReleasedCopyInput,
} from '@/lib/gmAssignmentReleasedCopy'

export async function notifyGmAssignmentReleased(params: GmAssignmentReleasedCopyInput & {
  organizationId?: string | null
  gms?: string[] | null
}): Promise<void> {
  const gms = (params.gms ?? []).map((name) => name.trim()).filter(Boolean)
  const organizationId = (params.organizationId || '').trim()
  if (gms.length === 0 || !organizationId) return

  try {
    const { error } = await supabase.functions.invoke('notify-gm-assignment-released', {
      body: {
        organizationId,
        gms,
        body: buildGmAssignmentReleasedBody(params),
      },
    })
    if (error) logger.error('GM解除通知エラー:', error)
  } catch (error) {
    logger.error('GM解除通知エラー:', error)
  }
}
