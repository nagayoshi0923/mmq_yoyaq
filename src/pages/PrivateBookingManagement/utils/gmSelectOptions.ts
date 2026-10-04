/**
 * 承認の GM の選択肢（担当・対応可能・予約済みの札と並び順）。index.tsx から規則を変えずに切り出した関数。
 * 候補日を選んでいるときはその候補への回答で「対応可能」を判定する（未選択のときだけ「いずれかの候補で対応可能」）。
 */
import { candidateResponseIndex } from '@/lib/gmCandidateSelection'
import { isGmAvailableForCandidate, isGmMarkedAvailable, type GmResponseLike } from './gmAvailabilityStatus'
import type { PrivateBookingRequest } from '../hooks/usePrivateBookingData'

type Candidate = PrivateBookingRequest['candidate_datetimes']['candidates'][number]

export function buildGmSelectOptions<GM extends { id: string; name: string }, AG extends GmResponseLike & { gm_id?: string | number | null }, T>({
  mergedGmOptions, availableGMs, assignedGMIds, selectedRequest, selectedCandidateOrder, candidateTime, gmConflictOf, conflictsReady,
}: {
  mergedGmOptions: GM[]
  availableGMs: AG[]
  assignedGMIds: Array<string | number>
  selectedRequest: PrivateBookingRequest | null
  selectedCandidateOrder: number | null
  candidateTime: (request: PrivateBookingRequest, candidate: Candidate) => T
  gmConflictOf: (request: PrivateBookingRequest, candidate: T, gmId: string, gmName: string) => boolean | undefined
  conflictsReady: boolean
}) {
  const candidates = selectedRequest?.candidate_datetimes?.candidates
  const selectedCandidate =
    selectedCandidateOrder != null && candidates
      ? candidates.find((c: { order: number }) => c.order === selectedCandidateOrder)
      : undefined

  return mergedGmOptions
    .map((gm) => {
      const availableGM = availableGMs.find((ag) => String(ag.gm_id) === String(gm.id))
      // 候補日が選択されているときはその候補に対する回答で [対応可能] を判定する
      // （選択候補なしのフォールバックのみ「いずれかの候補で対応可能」を使う）
      const isAvailable = availableGM
        ? selectedCandidate
          ? isGmAvailableForCandidate(availableGM, candidateResponseIndex(selectedCandidate, candidates || []))
          : isGmMarkedAvailable(availableGM)
        : false
      const isAssigned = assignedGMIds.some((id) => String(id) === String(gm.id))
      let gmConflict: boolean | undefined = false
      if (selectedCandidate?.date && selectedCandidate?.timeSlot) {
        const candidate = candidateTime(selectedRequest!, selectedCandidate)
        gmConflict = gmConflictOf(selectedRequest!, candidate, gm.id, gm.name)
      }
      const isGMDisabled = gmConflict !== false
      const tagParts: string[] = []
      if (isAssigned) tagParts.push('担当')
      if (isAvailable) tagParts.push('対応可能')
      if (isGMDisabled) tagParts.push(gmConflict === true ? '予約済み' : conflictsReady ? '確認不可' : '確認中')
      let label = gm.name
      if (tagParts.length) label += ` [${tagParts.join('・')}]`
      const score = (isAssigned ? 2 : 0) + (isAvailable ? 1 : 0)
      return { gm, isGMDisabled, label, score }
    })
    .sort(
      (a, b) =>
        b.score - a.score ||
        a.gm.name.localeCompare(b.gm.name, 'ja', { sensitivity: 'base' })
    )
}
