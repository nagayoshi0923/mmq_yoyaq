/** 回答は候補配列の0始まり位置。画面のorder（表示番号）とは分ける。 */
export interface GmCandidate { order: number; gm_response_index?: number | null }
export function candidateOrdersFromIndexes(candidates: GmCandidate[], indexes: number[]): number[] {
  return [...new Set(indexes.filter(i => Number.isInteger(i) && i >= 0 && i < candidates.length)
    .map(i => candidates[i].order))]
}
export function candidateIndexesFromOrders(candidates: GmCandidate[], orders: number[]): number[] {
  return [...new Set(orders.map(order => {
    const index = candidates.findIndex(c => c.order === order)
    if (index < 0 || candidates.filter(c => c.order === order).length !== 1) {
      throw new Error('候補日時が変更されています。画面を開き直して選び直してください。')
    }
    return index
  }))]
}
export function hasUnresolvedCandidateIndexes(candidates: GmCandidate[], indexes: number[]): boolean {
  return indexes.some(i => !Number.isInteger(i) || i < 0 || i >= candidates.length)
}

/** 復元表示用の候補は、過去の回答との対応を推測しない。 */
export function candidateResponseIndex(candidate: GmCandidate, candidates: GmCandidate[]): number | null {
  if (candidate.gm_response_index !== undefined) return candidate.gm_response_index
  const index = candidates.indexOf(candidate)
  return index >= 0 ? index : null
}
