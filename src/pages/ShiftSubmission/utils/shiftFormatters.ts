/**
 * ShiftSubmission用のフォーマット関数群
 */

/**
 * 曜日に応じた色を返す
 */
export const getDayOfWeekColor = (dayOfWeek: string) => {
  if (dayOfWeek === '土') return 'text-blue-600'
  if (dayOfWeek === '日') return 'text-red-600'
  return 'text-foreground'
}

