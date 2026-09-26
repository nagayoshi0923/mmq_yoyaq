export interface PrivateBookingCandidate {
  date: string
  slot: { label: string; startTime: string; endTime: string }
}

/** 空き枠の時刻が変わった場合は送信せず、更新した候補を利用者へ再提示する。 */
export function reconcilePrivateBookingCandidates(
  candidates: PrivateBookingCandidate[],
  resolveSlots: (candidate: PrivateBookingCandidate) => PrivateBookingCandidate['slot'][],
) {
  const invalid: PrivateBookingCandidate[] = []
  let changed = false
  const updated = candidates.map(candidate => {
    const current = resolveSlots(candidate).find(slot => slot.label === candidate.slot.label)
    if (!current) { invalid.push(candidate); return candidate }
    if (current.startTime === candidate.slot.startTime && current.endTime === candidate.slot.endTime) return candidate
    changed = true
    return { ...candidate, slot: { label: current.label, startTime: current.startTime, endTime: current.endTime } }
  })
  return { invalid, changed, updated }
}
