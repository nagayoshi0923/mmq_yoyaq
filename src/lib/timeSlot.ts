/**
 * 時間帯（time_slot）の変換関数を一元管理
 *
 * このプロジェクトでは time_slot が3つの形式で使われている:
 *
 *   形式A: schedule_events.time_slot（DB保存値）
 *     '朝' | '昼' | '夜'
 *
 *   形式B: フック内の内部表現（英語）
 *     'morning' | 'afternoon' | 'evening'
 *
 *   形式C: private_group_candidate_dates.time_slot（DB CHECK制約）
 *     '午前' | '午後' | '夜間'
 *
 * 変換関数は必ずこのファイルから import すること。
 * 変換ロジックを各ファイルに直接書くことは禁止。
 */

/** 形式A: schedule_events の time_slot */
export type ScheduleTimeSlot = '朝' | '昼' | '夜'

/** 形式B: フック内部の英語表現 */
export type TimeSlotEn = 'morning' | 'afternoon' | 'evening'

/** 形式C: private_group_candidate_dates の time_slot */
export type CandidateTimeSlot = '午前' | '午後' | '夜間'

// ─── 形式A ↔ 形式B ───────────────────────────────────────────

/** 形式A（日本語）→ 形式B（英語） */
export function scheduleTimeSlotToEn(timeSlot: string | null | undefined): TimeSlotEn | null {
  switch (timeSlot) {
    case '朝': return 'morning'
    case '昼': return 'afternoon'
    case '夜': return 'evening'
    default: return null
  }
}

/** 形式B（英語）→ 形式A（日本語） */
export function timeSlotEnToSchedule(slot: TimeSlotEn | string | null | undefined): ScheduleTimeSlot {
  switch (slot) {
    case 'morning':   return '朝'
    case 'afternoon': return '昼'
    default:          return '夜'
  }
}

// ─── 形式A ↔ 形式C ───────────────────────────────────────────

/** 形式A（朝/昼/夜）→ 形式C（午前/午後/夜間）*/
export function scheduleTimeSlotToCandidate(slot: string | null | undefined): CandidateTimeSlot {
  switch (slot) {
    case '朝': return '午前'
    case '昼': return '午後'
    default:   return '夜間'
  }
}

// ─── 形式B ↔ 形式C ───────────────────────────────────────────

/** 形式B（英語）→ 形式C（午前/午後/夜間）*/
export function timeSlotEnToCandidate(slot: TimeSlotEn | string | null | undefined): CandidateTimeSlot {
  switch (slot) {
    case 'morning':   return '午前'
    case 'afternoon': return '午後'
    default:          return '夜間'
  }
}

/** 形式B（英語）→ 表示用ラベル（朝/昼/夜 または 午前/午後/夜） */
export function timeSlotEnToLabel(slot: TimeSlotEn | string | null | undefined, format: 'schedule' | 'candidate' = 'schedule'): string {
  if (format === 'candidate') {
    switch (slot) {
      case 'morning':   return '午前'
      case 'afternoon': return '午後'
      default:          return '夜'
    }
  }
  switch (slot) {
    case 'morning':   return '朝'
    case 'afternoon': return '昼'
    default:          return '夜'
  }
}

// ─── 形式C ↔ 形式B/UI ────────────────────────────────────────

/** 形式C（DB）→ UI表示用（夜間 → 夜） */
export function candidateTimeSlotFromDb(db: string): '午前' | '午後' | '夜' {
  if (db === '夜間') return '夜'
  return db as '午前' | '午後'
}

/** UI値 → 形式C（DB保存用）*/
export function candidateTimeSlotToDb(label: string): CandidateTimeSlot {
  if (label === '夜') return '夜間'
  if (label === '午前' || label === '午後' || label === '夜間') return label
  return label as CandidateTimeSlot
}
