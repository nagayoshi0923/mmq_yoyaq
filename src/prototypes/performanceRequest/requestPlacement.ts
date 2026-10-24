/** 試作の公開公演の取得状態と受付入口。予約可能な件数だけで「未設定」と推測しない。 */
export type PreviewLoadState = 'loading' | 'error' | 'ready'
export interface PreviewPublicEvent {
  scenarioId: string
  organizationId: string
  storeId: string
  date: string
  startTime: string
  published: boolean
  cancelled: boolean
  category: 'open' | 'private'
  seats: number
  reservationEnabled: boolean
}

export function canRequestPerformance(input: {
  loadState: PreviewLoadState
  scenarioId: string
  organizationId: string | null
  selectedStoreIds: readonly string[]
  events: readonly PreviewPublicEvent[]
  nowMs: number
}): boolean {
  if (input.loadState !== 'ready') return false
  const target = input.events.filter((e) => e.scenarioId === input.scenarioId &&
    (!input.organizationId || e.organizationId === input.organizationId) &&
    (input.selectedStoreIds.length === 0 || input.selectedStoreIds.includes(e.storeId)) &&
    e.published && !e.cancelled && e.category === 'open')
  return !target.some((e) => {
    const start = new Date(`${e.date}T${e.startTime.slice(0, 5)}:00+09:00`).getTime()
    return !Number.isFinite(start) || start > input.nowMs
  })
}
