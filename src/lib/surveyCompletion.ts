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
  // 第 2 希望は、キャラクターの設問を出していないとき・第 1 希望が無い（おまかせを含む）ときは送らない
  const charQ = questions.find(q => q.question_type === 'character_selection')
  const first = charQ ? answers[charQ.id] : undefined
  if (!charQ || hiddenIds.has(charQ.id) || typeof first !== 'string' || !first || first === SURVEY_CHARACTER_ANY) hiddenIds.add(SURVEY_SECOND_CHOICE_KEY)
  return Object.fromEntries(Object.entries(answers).filter(([id]) => !hiddenIds.has(id)))
}

/** 公演日（日本時間）の終わりを過ぎたか */
export function isPastPerformanceDate(performanceDate: string | null | undefined, now = new Date()): boolean {
  return Boolean(performanceDate && now > new Date(performanceDate + 'T23:59:59+09:00'))
}

/**
 * 事前配役アンケートのキャラクター選択で「どのキャラクターでもよい（おまかせ）」を選んだときに保存する値。
 * 回答は従来どおり文字列 1 つ（キャラクター id）で保存するため、おまかせもこの文字で保存する
 * （店舗の回答一覧はキャラクター名が見つからないとき値をそのまま出すので「おまかせ」と読める）。
 */
export const SURVEY_CHARACTER_ANY = 'おまかせ'

/**
 * 第 2 希望のキャラクター id を保存する回答のキー（private_group_survey_responses.responses は jsonb で、
 * RPC upsert_survey_response_for_member は受け取った回答をそのまま保存するため、列を足さずにこのキーで持つ）。
 */
export const SURVEY_SECOND_CHOICE_KEY = 'character_second_choice'

/** 店舗の回答一覧で、キャラクターの設問の回答を 1 行の文にする（第 2 希望・おまかせを含む）。未回答は null */
export function characterAnswerLabel(
  answers: Record<string, unknown> | null | undefined,
  questionId: string,
  characters: ReadonlyArray<{ id: string; name: string }>,
): string | null {
  const first = answers?.[questionId]
  if (typeof first !== 'string' || !first) return null
  if (first === SURVEY_CHARACTER_ANY) return 'おまかせ（どのキャラクターでもよい）'
  const nameOf = (id: string) => characters.find(c => c.id === id)?.name || id
  const second = answers?.[SURVEY_SECOND_CHOICE_KEY]
  return typeof second === 'string' && second && second !== first
    ? `第 1 希望 ${nameOf(first)}／第 2 希望 ${nameOf(second)}`
    : nameOf(first)
}

export interface CharacterPicks {
  first: string | null
  second: string | null
}

/**
 * キャラクターのカードを押したときの希望の並び。押す順に第 1・第 2 希望。
 * 選んでいるカードをもう一度押すと外す（第 1 を外すと第 2 が第 1 に繰り上がる）。2 つ選んだ後に別のカードを押すと第 2 を入れ替える。
 */
export function toggleCharacterPick(picks: CharacterPicks, characterId: string): CharacterPicks {
  if (picks.first === characterId) return { first: picks.second, second: null }
  if (picks.second === characterId) return { first: picks.first, second: null }
  if (!picks.first) return { first: characterId, second: picks.second === characterId ? null : picks.second }
  return { first: picks.first, second: characterId }
}
