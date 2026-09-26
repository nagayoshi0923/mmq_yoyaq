export type RecruitmentTargetMode = 'count' | 'percent'
export type RecruitmentTarget = { mode: RecruitmentTargetMode; value: number }
export const DEFAULT_RECRUITMENT_TARGET: RecruitmentTarget = { mode: 'count', value: 2 }

export function isRecruitmentTarget(mode: unknown, value: unknown): boolean {
  return (mode === 'count' || mode === 'percent') && typeof value === 'number'
    && Number.isInteger(value) && value >= 1 && value <= (mode === 'count' ? 20 : 100)
}

/** 追加募集を許容する不足人数。割合は最低開催人数を基準に端数切り捨て。 */
export function recruitmentMissingLimit(minimum: number, target: RecruitmentTarget): number | null {
  if (!Number.isInteger(minimum) || minimum < 1 || !isRecruitmentTarget(target.mode, target.value)) return null
  return target.mode === 'percent' ? Math.floor(minimum * target.value / 100) : target.value
}

export function recruitmentTargetLabel(target: RecruitmentTarget): string {
  return target.mode === 'percent' ? `${target.value}％` : `${target.value}人以内`
}
