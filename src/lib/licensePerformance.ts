const LICENSE_REPORTABLE_INTERNAL_CATEGORIES = new Set([
  'open',
  'private',
  'gmtest',
  'offsite',
])

const SPECIAL_GUEST_PERFORMANCE_TITLE = /^【?特別出張公演】?/

export type InternalLicensePerformance = {
  category?: string | null
  scenarioTitle?: string | null
}

/**
 * 自社公演として作者へのライセンス報告へ含めるかを判定する。
 *
 * offsite は「Queen's Waltz が外部会場で公演した出張公演」を表すため対象。
 * 「特別出張公演」は外部団体を招いた公演の管理用登録であり、対象外とする。
 */
export function isInternalLicenseReportablePerformance({
  category,
  scenarioTitle,
}: InternalLicensePerformance): boolean {
  const normalizedCategory = category || 'open'
  if (!LICENSE_REPORTABLE_INTERNAL_CATEGORIES.has(normalizedCategory)) return false

  if (
    normalizedCategory === 'offsite'
    && SPECIAL_GUEST_PERFORMANCE_TITLE.test(scenarioTitle?.trim() || '')
  ) {
    return false
  }

  return true
}
