/**
 * @deprecated `src/lib/timeSlot.ts` の candidateTimeSlotToDb / candidateTimeSlotFromDb を使うこと。
 * 後方互換性のため残している。
 */
export type PrivateGroupCandidateTimeSlotDb = '午前' | '午後' | '夜間'

export { candidateTimeSlotToDb as privateGroupTimeSlotToDb, candidateTimeSlotFromDb as privateGroupTimeSlotFromDb } from '@/lib/timeSlot'
