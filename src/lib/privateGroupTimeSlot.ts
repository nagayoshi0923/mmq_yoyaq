/**
 * private_group_candidate_dates.time_slot の DB CHECK は 午前 / 午後 / 夜間。
 * UI・フォームでは 夜 を使うため、保存時に変換する。
 */
export type PrivateGroupCandidateTimeSlotDb = '午前' | '午後' | '夜間'

export function privateGroupTimeSlotToDb(label: string): PrivateGroupCandidateTimeSlotDb {
  if (label === '夜') return '夜間'
  if (label === '午前' || label === '午後' || label === '夜間') {
    return label
  }
  return label as PrivateGroupCandidateTimeSlotDb
}

export function privateGroupTimeSlotFromDb(db: string): '午前' | '午後' | '夜' {
  if (db === '夜間') return '夜'
  return db as '午前' | '午後'
}
