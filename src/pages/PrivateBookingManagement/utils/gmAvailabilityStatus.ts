/**
 * gm_availability_responses の表示・「対応可能」判定を一元化する。
 * response_status と available_candidates の組み合わせの食い違い（pending のまま候補のみ等）に耐える。
 */

export interface GmResponseLike {
  response_status?: string | null
  available_candidates?: number[] | null
  responded_at?: string | null
  response_datetime?: string | null
}

/** 担当GM選択の [対応可能] や候補バッジで「出勤可能扱い」にするか */
export function isGmMarkedAvailable(gm: GmResponseLike): boolean {
  const st = String(gm.response_status ?? '').trim().toLowerCase()
  if (st === 'all_unavailable' || st === 'unavailable') return false
  if (st === 'available') return true
  const cands = gm.available_candidates
  return Array.isArray(cands) && cands.length > 0
}

/** 特定候補（0始まりインデックス）に対応可能とみなすか */
export function isGmAvailableForCandidate(
  gm: GmResponseLike,
  candidateIndexZeroBased: number
): boolean {
  if (!isGmMarkedAvailable(gm)) return false
  return gm.available_candidates?.includes(candidateIndexZeroBased) === true
}

/**
 * 一覧カード「GM回答状況」およびモーダル用の回答一覧に載せるか。
 * 未送信の pending（候補なし・未回答時刻なし）は除外する。
 */
export function shouldIncludeGmResponseRow(gm: GmResponseLike): boolean {
  if (gm.responded_at || gm.response_datetime) return true
  const st = String(gm.response_status ?? '').trim().toLowerCase()
  if (st === 'available' || st === 'unavailable' || st === 'all_unavailable') return true
  const cands = gm.available_candidates
  return Array.isArray(cands) && cands.length > 0
}
