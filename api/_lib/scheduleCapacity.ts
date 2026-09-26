/** Match the database constraint: max_participants takes precedence over capacity. */
export function capacityError(event: {
  max_participants?: number | null
  capacity?: number | null
  current_participants?: number | null
}, requestedCapacity?: unknown, additionalParticipants = 0): string | null {
  const capacity = event.max_participants ??
    (requestedCapacity === undefined ? event.capacity : requestedCapacity)
  const participants = (event.current_participants ?? 0) + additionalParticipants
  if (typeof capacity !== 'number' || !Number.isFinite(capacity) || participants <= capacity) return null
  return `定員${capacity}名に対して参加人数が${participants}名になるため保存できません。申込済みの予約とスタッフ参加が重複していないか、予約者一覧を確認してください。`
}

export function isCapacityConstraintError(error: { code?: string; message?: string } | null): boolean {
  return error?.code === '23514' && Boolean(error.message?.includes('schedule_events_participants_check'))
}

export const CAPACITY_CHANGED_MESSAGE = '定員を超えるため保存できません。予約者一覧を更新し、申込済みの予約とスタッフ参加が重複していないか確認してください。'
