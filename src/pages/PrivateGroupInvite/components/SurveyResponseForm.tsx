import { useState, useEffect, useCallback } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Badge } from '@/components/ui/badge'
import { ClipboardList, Loader2, CheckCircle2, AlertCircle, Clock } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { logger } from '@/utils/logger'
import { toast } from 'sonner'
import { formatJstDateJa, formatJstMonthDay } from '@/utils/jstDate'
import type { SurveyQuestion } from '@/types'

interface SurveyResponseFormProps {
  groupId: string
  memberId: string
  performanceDate?: string
  characters?: Array<{ id: string; name: string; gender?: string }>
  hideCharacterSelection?: boolean
}

interface FormResponse {
  [questionId: string]: string | string[]
}

export function SurveyResponseForm({
  groupId,
  memberId,
  performanceDate,
  characters = [],
  hideCharacterSelection = false,
}: SurveyResponseFormProps) {
  const [questions, setQuestions] = useState<SurveyQuestion[]>([])
  const [responses, setResponses] = useState<FormResponse>({})
  const [existingResponseId, setExistingResponseId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [deadlineDate, setDeadlineDate] = useState<Date | null>(null)
  const [localCharacters, setLocalCharacters] = useState<Array<{ id: string; name: string; gender?: string }>>(characters)
  const [surveyStatus, setSurveyStatus] = useState<'loading' | 'not_found' | 'disabled' | 'no_questions' | 'ready'>('loading')

  useEffect(() => {
    const loadSurveyData = async () => {
      logger.log('📋 SurveyForm: loading', { groupId, memberId })

      try {
        const { data, error } = await supabase.rpc('get_survey_data_for_member', {
          p_group_id: groupId,
          p_member_id: memberId,
        })

        logger.log('📋 SurveyForm: rpc result', { data, error })

        if (error) {
          logger.error('📋 SurveyForm: rpc error', error)
          setSurveyStatus('not_found')
          setLoading(false)
          return
        }

        if (!data || data.error) {
          logger.log('📋 SurveyForm: not found', { data })
          setSurveyStatus('not_found')
          setLoading(false)
          return
        }

        if (!data.survey_enabled) {
          logger.log('📋 SurveyForm: survey disabled')
          setSurveyStatus('disabled')
          setLoading(false)
          return
        }

        // 期限を計算
        if (performanceDate && data.survey_deadline_days != null) {
          const perfDate = new Date(performanceDate + 'T00:00:00+09:00')
          perfDate.setDate(perfDate.getDate() - data.survey_deadline_days)
          perfDate.setHours(23, 59, 59, 999)
          setDeadlineDate(perfDate)
        } else {
          setDeadlineDate(null)
        }

        // キャラクター情報を設定（NPCを除外、propsが空の場合のみ上書き）
        if (Array.isArray(data.characters) && characters.length === 0) {
          const charData = data.characters
            .filter((c: any) => !c.is_npc)
            .map((c: any) => ({ id: c.id, name: c.name, gender: c.gender }))
          setLocalCharacters(charData)
        }

        const questionsData: SurveyQuestion[] = Array.isArray(data.questions) ? data.questions : []
        if (questionsData.length > 0) {
          setQuestions(questionsData)
          setSurveyStatus('ready')
        } else {
          setSurveyStatus('no_questions')
        }

        // 既存の回答を設定
        if (data.existing_response_id) {
          setExistingResponseId(data.existing_response_id)
          setResponses(data.existing_responses || {})
          setSubmitted(true)
        }
      } catch (err) {
        logger.error('アンケート読み込みエラー:', err)
        setSurveyStatus('not_found')
      } finally {
        setLoading(false)
      }
    }

    loadSurveyData()
  }, [groupId, memberId, performanceDate])

  const handleTextChange = useCallback((questionId: string, value: string) => {
    setResponses(prev => ({ ...prev, [questionId]: value }))
  }, [])

  const handleSingleChoiceChange = useCallback((questionId: string, value: string) => {
    setResponses(prev => ({ ...prev, [questionId]: value }))
  }, [])

  const handleMultipleChoiceChange = useCallback((questionId: string, value: string, checked: boolean) => {
    setResponses(prev => {
      const current = Array.isArray(prev[questionId]) ? prev[questionId] as string[] : []
      if (checked) {
        return { ...prev, [questionId]: [...current, value] }
      } else {
        return { ...prev, [questionId]: current.filter(v => v !== value) }
      }
    })
  }, [])

  const handleSubmit = useCallback(async () => {
    // 必須項目のチェック
    const missingRequired = questions.filter(
      q => q.is_required && !responses[q.id]
    )
    if (missingRequired.length > 0) {
      toast.error(`必須項目を入力してください: ${missingRequired.map(q => q.question_text).join(', ')}`)
      return
    }

    setSubmitting(true)
    try {
      const { data: responseId, error } = await supabase.rpc('upsert_survey_response_for_member', {
        p_group_id: groupId,
        p_member_id: memberId,
        p_responses: responses,
      })

      if (error) {
        logger.error('📋 SurveyForm: upsert error', error)
        throw error
      }

      logger.log('📋 SurveyForm: saved with id', responseId)
      setExistingResponseId(responseId)
      toast.success(existingResponseId ? '回答を更新しました' : '回答を送信しました')
      setSubmitted(true)
    } catch (err) {
      logger.error('アンケート送信エラー:', err)
      toast.error('送信に失敗しました')
    } finally {
      setSubmitting(false)
    }
  }, [questions, responses, existingResponseId, groupId, memberId])

  const formatDeadline = (date: Date) => {
    return formatJstDateJa(date, true)
  }

  if (loading) {
    return (
      <Card className="mb-6">
        <CardContent className="p-6 text-center">
          <Loader2 className="w-6 h-6 animate-spin mx-auto text-muted-foreground" />
          <p className="text-sm text-muted-foreground mt-2">アンケートを読み込み中...</p>
        </CardContent>
      </Card>
    )
  }

  // アンケートが設定されていない場合
  if (surveyStatus === 'not_found') {
    return (
      <div className="text-center py-4 text-muted-foreground">
        <AlertCircle className="w-8 h-8 mx-auto mb-2 text-amber-400" />
        <p className="text-sm">アンケート情報を取得できませんでした</p>
        <p className="text-xs mt-1">シナリオ設定を確認してください</p>
      </div>
    )
  }

  // アンケートが無効な場合
  if (surveyStatus === 'disabled') {
    return null // アンケートが無効なら何も表示しない
  }

  // 質問が設定されていない場合
  if (surveyStatus === 'no_questions' || questions.length === 0) {
    return (
      <div className="text-center py-4 text-muted-foreground">
        <ClipboardList className="w-8 h-8 mx-auto mb-2 text-gray-300" />
        <p className="text-sm">アンケートの質問が設定されていません</p>
      </div>
    )
  }

  const isPastDeadline = Boolean(deadlineDate && new Date() > deadlineDate)
  const isPastPerformance = Boolean(performanceDate && new Date() > new Date(performanceDate + 'T23:59:59+09:00'))

  if (isPastPerformance) {
    return (
      <Card className="mb-6 border-gray-200">
        <CardContent className="p-4 space-y-2">
          <div className="flex items-center gap-2">
            <ClipboardList className="w-5 h-5 text-gray-400" />
            <h3 className="text-base font-semibold text-muted-foreground">公演前アンケート</h3>
          </div>
          <p className="text-sm text-muted-foreground">
            公演日を過ぎたため、アンケートの回答受付は終了しました。
          </p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="mb-6 border-purple-200">
      <CardContent className="p-4 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ClipboardList className="w-5 h-5 text-purple-600" />
            <h3 className="text-base font-semibold">公演前アンケート</h3>
          </div>
          {submitted && (
            <Badge className="bg-green-100 text-green-800 border-green-200">
              <CheckCircle2 className="w-3 h-3 mr-1" />
              回答済み
            </Badge>
          )}
        </div>

        {deadlineDate && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Clock className="w-4 h-4" />
            <span>回答期限（目安）: {formatDeadline(deadlineDate)}</span>
          </div>
        )}
        {isPastDeadline && (
          <p className="text-xs text-amber-800 bg-amber-50 border border-amber-100 rounded-md px-2 py-1.5">
            目安の期限を過ぎていますが、公演日まで回答・更新できます。
          </p>
        )}

        <div className="space-y-4 pt-2">
          {questions.filter(q => !(hideCharacterSelection && q.question_type === 'character_selection')).map((question, index) => (
            <div key={question.id} className="space-y-2">
              <Label className="text-sm font-medium flex items-center gap-2">
                Q{index + 1}. {question.question_text}
                {question.is_required && (
                  <span className="text-red-500 text-xs">*必須</span>
                )}
              </Label>

              {question.question_type === 'text' && (
                <Textarea
                  value={(responses[question.id] as string) || ''}
                  onChange={(e) => handleTextChange(question.id, e.target.value)}
                  placeholder="回答を入力してください"
                  rows={3}
                  className="text-sm resize-none"
                />
              )}

              {question.question_type === 'single_choice' && (
                <RadioGroup
                  value={(responses[question.id] as string) || ''}
                  onValueChange={(value) => handleSingleChoiceChange(question.id, value)}
                  className="space-y-2"
                >
                  {question.options.map((option) => (
                    <div key={option.value} className="flex items-center gap-2">
                      <RadioGroupItem value={option.value} id={`${question.id}-${option.value}`} />
                      <Label htmlFor={`${question.id}-${option.value}`} className="text-sm cursor-pointer">
                        {option.label}
                      </Label>
                    </div>
                  ))}
                </RadioGroup>
              )}

              {question.question_type === 'multiple_choice' && (
                <div className="space-y-2">
                  {question.options.map((option) => {
                    const current = Array.isArray(responses[question.id]) ? responses[question.id] as string[] : []
                    return (
                      <div key={option.value} className="flex items-center gap-2">
                        <Checkbox
                          id={`${question.id}-${option.value}`}
                          checked={current.includes(option.value)}
                          onCheckedChange={(checked) => 
                            handleMultipleChoiceChange(question.id, option.value, checked === true)
                          }
                        />
                        <Label htmlFor={`${question.id}-${option.value}`} className="text-sm cursor-pointer">
                          {option.label}
                        </Label>
                      </div>
                    )
                  })}
                </div>
              )}

              {question.question_type === 'rating' && (
                <div className="flex gap-2">
                  {[1, 2, 3, 4, 5].map(n => {
                    const selected = responses[question.id] === String(n)
                    return (
                      <button
                        key={n}
                        type="button"
                        onClick={() => handleSingleChoiceChange(question.id, String(n))}
                        className={`w-10 h-10 rounded-full border-2 text-sm font-medium transition-colors ${
                          selected
                            ? 'bg-purple-600 text-white border-purple-600'
                            : 'bg-white text-gray-600 border-gray-300 hover:border-purple-400'
                        }`}
                      >
                        {n}
                      </button>
                    )
                  })}
                </div>
              )}

              {question.question_type === 'character_selection' && (
                localCharacters.length > 0 ? (
                  <RadioGroup
                    value={(responses[question.id] as string) || ''}
                    onValueChange={(value) => handleSingleChoiceChange(question.id, value)}
                    className="space-y-2"
                  >
                    {localCharacters.map((char) => (
                      <div key={char.id} className="flex items-center gap-2">
                        <RadioGroupItem value={char.id} id={`${question.id}-${char.id}`} />
                        <Label htmlFor={`${question.id}-${char.id}`} className="text-sm cursor-pointer">
                          {char.name}
                          {char.gender && (
                            <span className="text-xs text-muted-foreground ml-1">
                              ({char.gender === 'male' ? '男性' : char.gender === 'female' ? '女性' : char.gender === 'any' ? '性別自由' : 'その他'})
                            </span>
                          )}
                        </Label>
                      </div>
                    ))}
                  </RadioGroup>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    キャラクター情報が設定されていません
                  </p>
                )
              )}
            </div>
          ))}
        </div>

        <Button
          onClick={handleSubmit}
          disabled={submitting}
          className="w-full bg-purple-600 hover:bg-purple-700"
        >
          {submitting ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              送信中...
            </>
          ) : submitted ? (
            '回答を更新する'
          ) : (
            '回答を送信する'
          )}
        </Button>
      </CardContent>
    </Card>
  )
}
