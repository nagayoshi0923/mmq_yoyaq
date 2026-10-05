import { describe, expect, it } from 'vitest'
import { isPastPerformanceDate, missingRequiredSurveyQuestions, stripHiddenSurveyAnswers } from './surveyCompletion'

const charQ = { id: 'c', question_type: 'character_selection' as const, is_required: true }
const textQ = { id: 't', question_type: 'text' as const, is_required: true }
const multiQ = { id: 'm', question_type: 'multiple_choice' as const, is_required: true }

describe('surveyCompletion', () => {
  it('配役方法が「アンケート」に変わったら、キャラクター希望が空の回答は未完了になる', () => {
    expect(missingRequiredSurveyQuestions([charQ, textQ], { t: 'なし' }, true)).toEqual([])
    expect(missingRequiredSurveyQuestions([charQ, textQ], { t: 'なし' }, false)).toEqual([charQ])
  })
  it('回答なし・空文字・空の複数選択は未回答とみなす', () => {
    expect(missingRequiredSurveyQuestions([textQ, multiQ], undefined, false)).toEqual([textQ, multiQ])
    expect(missingRequiredSurveyQuestions([textQ, multiQ], { t: '', m: [] }, false)).toEqual([textQ, multiQ])
    expect(missingRequiredSurveyQuestions([textQ, multiQ], { t: 'a', m: ['x'] }, false)).toEqual([])
  })
  it('画面に出していないキャラクター希望は送信しない', () => {
    expect(stripHiddenSurveyAnswers([charQ, textQ], { c: 'char1', t: 'a' }, true)).toEqual({ t: 'a' })
    expect(stripHiddenSurveyAnswers([charQ, textQ], { c: 'char1', t: 'a' }, false)).toEqual({ c: 'char1', t: 'a' })
  })
  it('公演日の日本時間23時59分59秒を過ぎたら終了とみなす', () => {
    expect(isPastPerformanceDate('2026-10-05', new Date('2026-10-05T14:59:58Z'))).toBe(false)
    expect(isPastPerformanceDate('2026-10-05', new Date('2026-10-05T15:00:00Z'))).toBe(true)
    expect(isPastPerformanceDate(undefined)).toBe(false)
  })
})
