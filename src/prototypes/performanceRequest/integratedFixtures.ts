import { addJstDays, toJstYmd } from '@/utils/jstDate'
import { PROTO_ORGANIZATION, PROTO_SCENARIOS } from './fixtures'
import type { PreviewPublicEvent } from './requestPlacement'
import { protoPaths } from './routes'

export const previewToday = () => toJstYmd(new Date())
export function previewSchedule(params: URLSearchParams): PreviewPublicEvent[] {
  const schedule = params.get('schedule')
  if (!schedule || schedule === 'empty') return []
  const scenarioId = schedule ? (params.get('scenario') ?? 'proto-scn-public') : 'proto-scn-1'
  const base: PreviewPublicEvent = { scenarioId, organizationId: PROTO_ORGANIZATION.id,
    storeId: 'proto-store-a', date: addJstDays(previewToday(), 20), startTime: '13:00',
    published: true, cancelled: false, category: 'open', seats: 3, reservationEnabled: true }
  return [{ ...base, organizationId: schedule === 'other-org' ? 'proto-other-org' : base.organizationId,
    seats: schedule === 'full' ? 0 : 3, reservationEnabled: schedule !== 'closed' }]
}
export function detailPreviewPath(scenarioId: string, params: URLSearchParams, request = false) {
  const next = new URLSearchParams()
  next.set('scenario', scenarioId)
  for (const k of ['scope', 'load', 'schedule', 'stores']) if (params.get(k)) next.set(k, params.get(k)!)
  if (request) next.set('view', 'request')
  return `${protoPaths.customer()}?${next}`
}
export function previewCatalogRows(today: string) {
  return PROTO_SCENARIOS.map((scenario, i) => ({ ...scenario,
    release_date: i === 1 ? null : addJstDays(today, i === 16 ? -90 : i === 17 ? 1 : -i),
    listed_at: `${addJstDays(today, -i)}T00:00:00+09:00`,
    new_arrival_target: true,
    organizationId: scenario.organizationId ?? PROTO_ORGANIZATION.id,
  }))
}
