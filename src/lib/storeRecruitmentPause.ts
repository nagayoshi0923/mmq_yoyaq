export type StoreRecruitmentPauseType = 'performance' | 'private'

export type StoreRecruitmentPausePeriod = {
  id?: string
  store_id: string
  organization_id?: string
  pause_type: StoreRecruitmentPauseType
  starts_on: string | null
  ends_on: string | null
}

export type StoreRecruitmentPauseKind = 'none' | 'performance' | 'private' | 'both'

export function isDateInRecruitmentPause(
  dateYmd: string,
  period: Pick<StoreRecruitmentPausePeriod, 'starts_on' | 'ends_on'>
): boolean {
  const start = period.starts_on
  const end = period.ends_on
  if (!start && !end) return true
  if (start && dateYmd < start) return false
  if (end && dateYmd > end) return false
  return true
}

export function storeHasRecruitmentPause(
  dateYmd: string,
  storeId: string,
  pauseType: StoreRecruitmentPauseType,
  periods: StoreRecruitmentPausePeriod[]
): boolean {
  return periods.some(
    (p) =>
      p.store_id === storeId &&
      p.pause_type === pauseType &&
      isDateInRecruitmentPause(dateYmd, p)
  )
}

export function getStoreRecruitmentPauseKind(
  dateYmd: string,
  storeId: string,
  periods: StoreRecruitmentPausePeriod[]
): StoreRecruitmentPauseKind {
  const performance = storeHasRecruitmentPause(dateYmd, storeId, 'performance', periods)
  const priv = storeHasRecruitmentPause(dateYmd, storeId, 'private', periods)
  if (performance && priv) return 'both'
  if (performance) return 'performance'
  if (priv) return 'private'
  return 'none'
}

export function recruitmentPauseCellLabel(
  kind: StoreRecruitmentPauseKind,
  isSlotBlocked: boolean
): string | null {
  if (isSlotBlocked) return '募集停止'
  if (kind === 'both') return '募集停止'
  if (kind === 'performance') return '公演募集停止'
  if (kind === 'private') return '貸切募集停止'
  return null
}

export function formatRecruitmentPauseRange(
  period: Pick<StoreRecruitmentPausePeriod, 'starts_on' | 'ends_on'>
): string {
  if (!period.starts_on && !period.ends_on) return '全日程'
  if (period.starts_on && !period.ends_on) return `${period.starts_on} からずっと`
  if (!period.starts_on && period.ends_on) return `${period.ends_on} まで`
  return `${period.starts_on} 〜 ${period.ends_on}`
}
