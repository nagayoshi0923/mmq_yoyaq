import { describe, expect, it } from 'vitest'
import { DEFAULT_OPEN_CANCELLATION_FEES } from '@/constants/cancellationPolicyDefaults'
import {
  cancellationSummaryText, feeStepsText, formatDeadline, freeSelfCancelDeadline,
  freeSelfCancelHours, isInsideNoFreeCancelWindow,
} from './cancellationSummary'

describe('cancellationSummary', () => {
  it('既定（48時間・50%/100%）は 48 時間前まで無料', () => {
    expect(freeSelfCancelHours(48, DEFAULT_OPEN_CANCELLATION_FEES)).toBe(48)
    expect(feeStepsText(DEFAULT_OPEN_CANCELLATION_FEES)).toBe('48時間前から 50%、24時間前から 100%、開演後・無断は 100%')
    expect(cancellationSummaryText(48, DEFAULT_OPEN_CANCELLATION_FEES)).toBe(
      '公演の48時間前まで無料で取消できます（マイページから）。それ以降のキャンセル料: 48時間前から 50%、24時間前から 100%、開演後・無断は 100%。',
    )
  })

  it('期限より早く料金がかかる店舗は、料金がかかり始める時刻が無料の期限', () => {
    expect(freeSelfCancelHours(24, [{ hours_before: 72, fee_percentage: 30, description: '' }])).toBe(72)
  })

  it('期限 0（旧運用）は既定の 48 時間に読み替える', () => {
    expect(freeSelfCancelHours(0, [])).toBe(48)
    expect(cancellationSummaryText(0, [])).toBe('公演の48時間前まで無料で取消できます（マイページから）。')
  })

  it('期限の時刻は JST で「月/日(曜) 時:分」', () => {
    const start = new Date('2026-10-29T19:00:00+09:00')
    const deadline = freeSelfCancelDeadline(start, 48)
    expect(formatDeadline(deadline)).toBe('10/27(火) 19:00')
  })

  it('開演まで 48 時間を切ると「無料で取消できない」', () => {
    const start = new Date('2026-10-29T19:00:00+09:00')
    expect(isInsideNoFreeCancelWindow(start, new Date('2026-10-27T19:00:01+09:00'), 48)).toBe(true)
    expect(isInsideNoFreeCancelWindow(start, new Date('2026-10-27T18:59:00+09:00'), 48)).toBe(false)
  })
})
