/**
 * 事前配役アンケートの読み込み・送信（回答シート SurveyResponseForm 用）。
 * 読み書きは従来どおり privateGroupMemberAction の survey_read / survey_write（会員・ゲスト PIN 共通）。
 * 画面の状態の記録（2026-10-05、回答できない報告の原因特定用。回答の中身は送らない）もここで行う。
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { privateGroupMemberAction } from '@/lib/privateGroupGuestSession'
import { surveyErrorText } from '@/lib/surveyErrorText'
import { reportSurveyEvent } from '@/lib/surveyDiagnostics'
import { missingRequiredSurveyQuestions, stripHiddenSurveyAnswers } from '@/lib/surveyCompletion'
import { logger } from '@/utils/logger'
import type { SurveyQuestion } from '@/types'

export type SurveyAnswers = Record<string, string | string[]>
export type SurveyLoadStatus = 'loading' | 'not_found' | 'disabled' | 'no_questions' | 'ready'

export interface SurveyCharacter {
  id: string
  name: string
  gender?: string
  image_url?: string
  image_position?: string
  image_scale?: number | null
}

interface SurveyReadData {
  error?: string
  survey_enabled?: boolean
  survey_url?: unknown
  survey_deadline_at?: string | null
  survey_deadline_days?: number | null
  characters?: Array<SurveyCharacter & { is_npc?: boolean }>
  questions?: SurveyQuestion[]
  existing_response_id?: string | null
  existing_responses?: SurveyAnswers | null
}

export function useSurveyResponse({ groupId, memberId, performanceDate, characters, hideCharacterSelection, rootRef, onSubmitted }: {
  groupId: string
  memberId: string
  performanceDate?: string
  characters: ReadonlyArray<SurveyCharacter>
  /** 送信時に出していない（問わない）キャラクター選択。配役方法が survey でない・キャラクターがいない */
  hideCharacterSelection: (loadedCharacters: SurveyCharacter[]) => boolean
  rootRef: React.RefObject<HTMLDivElement | null>
  onSubmitted?: () => void
}) {
  const [questions, setQuestions] = useState<SurveyQuestion[]>([])
  const [responses, setResponses] = useState<SurveyAnswers>({})
  const [existingResponseId, setExistingResponseId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [externalSurveyUrl, setExternalSurveyUrl] = useState('')
  const [deadlineDate, setDeadlineDate] = useState<Date | null>(null)
  const [localCharacters, setLocalCharacters] = useState<SurveyCharacter[]>(() => [...characters])
  const [status, setStatus] = useState<SurveyLoadStatus>('loading')
  const [loadErrorText, setLoadErrorText] = useState<string | null>(null)
  const hideChar = hideCharacterSelection(localCharacters)

  const report = useCallback((event: Parameters<typeof reportSurveyEvent>[2], detail: Record<string, unknown> = {}) => {
    reportSurveyEvent(groupId, memberId, event, { hideCharacterSelection: hideChar, ...detail })
  }, [groupId, memberId, hideChar])
  const reportRef = useRef(report)
  reportRef.current = report

  useEffect(() => {
    reportRef.current('open')
    let errors = 0
    const onError = (event: ErrorEvent | PromiseRejectionEvent) => {
      if (errors++ >= 3) return
      const reason = 'reason' in event ? event.reason : event.error ?? event.message
      reportRef.current('js_error', { message: String(reason instanceof Error ? reason.message : reason).slice(0, 300) })
    }
    window.addEventListener('error', onError)
    window.addEventListener('unhandledrejection', onError)
    return () => {
      window.removeEventListener('error', onError)
      window.removeEventListener('unhandledrejection', onError)
    }
  }, [groupId, memberId])

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      setExternalSurveyUrl('')
      setLoading(true)
      try {
        const { data: raw, error } = await privateGroupMemberAction(groupId, memberId, 'survey_read')
        if (cancelled) return
        const data = raw as SurveyReadData | null
        if (error) {
          logger.error('📋 SurveyForm: rpc error', error)
          reportRef.current('load_error', { code: (error as { code?: string }).code ?? null, message: String((error as { message?: unknown }).message ?? '').slice(0, 300) })
          setLoadErrorText(surveyErrorText('アンケート情報を取得できませんでした', error))
          setStatus('not_found')
          return
        }
        if (!data || data.error) {
          reportRef.current('loaded', { status: 'not_found', dataError: data?.error ?? null })
          setStatus('not_found')
          return
        }
        if (!data.survey_enabled) {
          reportRef.current('loaded', { status: 'disabled' })
          setStatus('disabled')
          return
        }
        if (typeof data.survey_url === 'string' && /^https?:\/\//i.test(data.survey_url)) setExternalSurveyUrl(data.survey_url)

        if (data.survey_deadline_at) {
          setDeadlineDate(new Date(data.survey_deadline_at))
        } else if (performanceDate && data.survey_deadline_days != null) {
          setDeadlineDate(new Date(new Date(performanceDate + 'T23:59:59.999+09:00').getTime() - data.survey_deadline_days * 86400000))
        } else {
          setDeadlineDate(null)
        }

        // キャラクター（NPC を除く）。呼び出し元から渡されていないときだけ RPC の結果を使う
        if (Array.isArray(data.characters) && characters.length === 0) {
          setLocalCharacters(data.characters.filter(c => !c.is_npc).map(c => ({ id: c.id, name: c.name, gender: c.gender })))
        }

        const questionsData = Array.isArray(data.questions) ? data.questions : []
        reportRef.current('loaded', {
          status: questionsData.length > 0 ? 'ready' : 'no_questions',
          questions: questionsData.length,
          characterQuestions: questionsData.filter(q => q.question_type === 'character_selection').length,
          characters: Array.isArray(data.characters) ? data.characters.length : null,
          existing: Boolean(data.existing_response_id),
          external: typeof data.survey_url === 'string' && data.survey_url.length > 0,
          deadlineAt: data.survey_deadline_at ?? null,
        })
        setQuestions(questionsData)
        setStatus(questionsData.length > 0 ? 'ready' : 'no_questions')
        if (data.existing_response_id) {
          setExistingResponseId(data.existing_response_id)
          setResponses(data.existing_responses || {})
          setSubmitted(true)
        }
      } catch (err) {
        logger.error('アンケート読み込みエラー:', err)
        reportRef.current('load_error', { message: String(err instanceof Error ? err.message : err).slice(0, 300) })
        if (!cancelled) setStatus('not_found')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void load()
    return () => { cancelled = true }
    // characters は初回の判定にだけ使う（親の再描画のたびに読み直さない）
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupId, memberId, performanceDate])

  /** 送る。足りない必須の質問があれば送らずにその質問を返す */
  const submit = useCallback(async (): Promise<SurveyQuestion[]> => {
    // 画面に出していない質問（配役方法が survey でない・キャラクターがいない場合のキャラクター選択）は必須でも問わない（#911）
    const missing = missingRequiredSurveyQuestions(questions, responses, hideChar)
    report('submit', { missing: missing.length, answered: Object.keys(responses).length })
    if (missing.length > 0) {
      toast.error(`必須項目を入力してください: ${missing.map(q => q.question_text).join(', ')}`)
      return missing
    }
    setSubmitting(true)
    try {
      // 出していない質問の古い回答は送らない（配役方法の変更で消えたキャラクター希望を復活させない。#915）
      const payload = stripHiddenSurveyAnswers(questions, responses, hideChar)
      const { data: responseId, error } = await privateGroupMemberAction(groupId, memberId, 'survey_write', payload)
      if (error) throw error
      report('submitted')
      toast.success(existingResponseId ? '回答を変更しました' : '回答を送りました')
      setExistingResponseId(responseId as string)
      setSubmitted(true)
      onSubmitted?.()
    } catch (err) {
      logger.error('アンケート送信エラー:', err)
      report('submit_error', { code: (err as { code?: string } | null)?.code ?? null, message: String((err as { message?: unknown } | null)?.message ?? err).slice(0, 300) })
      // 理由が分かるように表示する（本人確認の期限切れ・入力の誤りなど。#911）
      toast.error(surveyErrorText('送信に失敗しました', err))
    } finally {
      setSubmitting(false)
    }
    return []
  }, [questions, responses, existingResponseId, groupId, memberId, hideChar, report, onSubmitted])

  // 読み込みが終わったら、表示された枠の大きさを記録する（中身が空の枠だけが出る不具合の確認用）
  useEffect(() => {
    if (loading) return
    const timer = window.setTimeout(() => {
      const root = rootRef.current
      if (!root) return
      const rect = root.getBoundingClientRect()
      reportRef.current('layout', {
        status,
        h: Math.round(rect.height), w: Math.round(rect.width), top: Math.round(rect.top), bottom: Math.round(rect.bottom),
        inputs: root.querySelectorAll('input, textarea, button').length,
        sheet: true,
      })
    }, 500)
    return () => window.clearTimeout(timer)
  }, [loading, status, rootRef])

  return {
    questions, responses, setResponses, loading, submitting, submitted, externalSurveyUrl, deadlineDate,
    characters: localCharacters, status, loadErrorText, hideChar, submit,
  }
}
