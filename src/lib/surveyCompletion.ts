import type { SurveyQuestion } from '@/types'

type SurveyAnswers = Record<string, string | string[] | undefined>

/** 画面に出す質問か。配役方法が「アンケート」でない間はキャラクター選択を出さない（#911） */
export function isSurveyQuestionShown(question: Pick<SurveyQuestion, 'question_type'>, hideCharacterSelection: boolean): boolean {
  return !(hideCharacterSelection && question.question_type === 'character_selection')
}

function isAnswered(value: string | string[] | undefined): boolean {
  return Array.isArray(value) ? value.length > 0 : Boolean(value)
}

/** 画面に出している必須質問のうち、未回答のもの */
export function missingRequiredSurveyQuestions<Q extends Pick<SurveyQuestion, 'id' | 'question_type' | 'is_required'>>(
  questions: Q[], answers: SurveyAnswers | undefined, hideCharacterSelection: boolean,
): Q[] {
  return questions.filter(q => q.is_required && isSurveyQuestionShown(q, hideCharacterSelection) && !isAnswered(answers?.[q.id]))
}

/** 送信する回答から、画面に出していない質問の回答を除く（配役方法の変更で消えた回答を復活させない。#915） */
export function stripHiddenSurveyAnswers<T extends string | string[]>(
  questions: Pick<SurveyQuestion, 'id' | 'question_type'>[], answers: Record<string, T>, hideCharacterSelection: boolean,
): Record<string, T> {
  const hiddenIds = new Set(questions.filter(q => !isSurveyQuestionShown(q, hideCharacterSelection)).map(q => q.id))
  return Object.fromEntries(Object.entries(answers).filter(([id]) => !hiddenIds.has(id)))
}

/** 公演日（日本時間）の終わりを過ぎたか */
export function isPastPerformanceDate(performanceDate: string | null | undefined, now = new Date()): boolean {
  return Boolean(performanceDate && now > new Date(performanceDate + 'T23:59:59+09:00'))
}
