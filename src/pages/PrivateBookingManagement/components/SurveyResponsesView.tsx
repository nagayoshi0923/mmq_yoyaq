import { readSurveyQuestionSettings } from '@/lib/surveyQuestionSettings'
import { characterAnswerLabel } from '@/lib/surveyCompletion'
import { readPrivateGroupSurveyResponses, readPrivateGroupByReservation } from '@/lib/privateGroupRead'
import { getGroupSurveySettings } from '@/lib/groupSurveySettings'
import { missingRequiredSurveyQuestions } from '@/lib/surveyCompletion'
import { useState, useEffect } from 'react'
import { Badge } from '@/components/ui/badge'
import { ClipboardList, CheckCircle2, AlertCircle, ChevronDown, ChevronUp } from 'lucide-react'
import { logger } from '@/utils/logger'
import type { SurveyQuestion } from '@/types'

interface SurveyResponsesViewProps {
  reservationId: string
  scenarioId: string
}

interface ResponseData {
  member_id: string
  responses: Record<string, string | string[]>
  submitted_at: string
}

interface MemberData {
  id: string
  /** 表示用（guest / customers のニックネーム等を解決済み） */
  guest_name?: string | null
}

export function SurveyResponsesView({
  reservationId,
  scenarioId,
}: SurveyResponsesViewProps) {
  const [questions, setQuestions] = useState<SurveyQuestion[]>([])
  const [responses, setResponses] = useState<ResponseData[]>([])
  const [members, setMembers] = useState<MemberData[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [isExpanded, setIsExpanded] = useState(false)
  const [characters, setCharacters] = useState<Array<{ id: string; name: string }>>([])
  const [hideCharacterSelection, setHideCharacterSelection] = useState(false)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setLoadError(false)
    setQuestions([])
    setResponses([])
    setMembers([])
    setCharacters([])
    setHideCharacterSelection(false)
    const loadSurveyData = async () => {
      if (!reservationId || !scenarioId) {
        if (!cancelled) setLoading(false)
        return
      }

      try {
        const snapshot = await readPrivateGroupByReservation(reservationId)
        if (!snapshot) return
        const groupId = snapshot.group.id
        const membersData: MemberData[] = (snapshot.group.members || []).map(member => ({
          id: member.id,
          guest_name: member.staff_display_name || member.guest_name || '参加者',
        }))
        if (!cancelled) setMembers(membersData)
        // 参加者の画面と同じく、配役方法が「アンケート」の時だけキャラクター希望を必須として数える
        if (!cancelled) setHideCharacterSelection(snapshot.group.character_assignment_method !== 'survey')

        const orgScenario = await getGroupSurveySettings(groupId)

        if (!orgScenario?.survey_enabled || !orgScenario.org_scenario_id) {
          if (!cancelled) setLoading(false)
          return
        }

        // キャラクター情報を取得
        if (orgScenario.characters) {
          if (!cancelled) setCharacters(orgScenario.characters.map((c) => ({
            id: c.id,
            name: c.name,
          })))
        }

        // 質問を取得
        const { questions: questionsData } = await readSurveyQuestionSettings(orgScenario.org_scenario_id)
        if (questionsData && questionsData.length > 0) {
          if (!cancelled) setQuestions(questionsData)
        }

        // 回答を取得
        const responsesData = await readPrivateGroupSurveyResponses(groupId)

        if (responsesData) {
          if (!cancelled) setResponses(responsesData)
        }
      } catch (err) {
        logger.error('アンケートデータ読み込みエラー:', err)
        if (!cancelled) setLoadError(true)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void loadSurveyData()
    return () => { cancelled = true }
  }, [reservationId, scenarioId])

  if (loadError) return <p role="alert" className="text-sm p-4">アンケートを取得できませんでした。画面を開き直してください。</p>

  if (loading || questions.length === 0) {
    return null
  }

  // 送信していても、いま必須の質問（あとから必要になったキャラクター希望など）が空なら回答済みに数えない（#915）
  const isMemberAnswered = (memberId: string) => {
    const response = responses.find(r => r.member_id === memberId)
    return Boolean(response) && missingRequiredSurveyQuestions(questions, response?.responses, hideCharacterSelection).length === 0
  }
  const respondedCount = members.filter(m => isMemberAnswered(m.id)).length
  const totalCount = members.length

  const getMemberName = (memberId: string) => {
    const member = members.find(m => m.id === memberId)
    return member?.guest_name || '不明'
  }

  const getResponseValue = (questionId: string, memberId: string): string => {
    const response = responses.find(r => r.member_id === memberId)
    if (!response) return '未回答'
    
    const value = response.responses[questionId]
    if (!value) return '未回答'

    const question = questions.find(q => q.id === questionId)
    if (!question) return String(value)

    if (question.question_type === 'character_selection') {
      // 第 2 希望・おまかせも併記（事前配役アンケート）
      return characterAnswerLabel(response.responses, questionId, characters) ?? String(value)
    }

    if (question.question_type === 'single_choice') {
      const option = question.options.find(o => o.value === value)
      return option?.label || String(value)
    }

    if (question.question_type === 'multiple_choice' && Array.isArray(value)) {
      return value.map(v => {
        const option = question.options.find(o => o.value === v)
        return option?.label || v
      }).join(', ')
    }

    if (question.question_type === 'rating') {
      const num = parseInt(String(value), 10)
      if (num >= 1 && num <= 5) return `${'★'.repeat(num)}${'☆'.repeat(5 - num)}（${num}/5）`
    }

    return String(value)
  }

  return (
    <div className="pt-3 border-t">
      <button
        type="button"
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between text-left"
      >
        <h3 className="flex items-center gap-2 text-sm font-medium text-purple-800">
          <ClipboardList className="w-4 h-4" />
          アンケート回答
          <Badge variant="outline" className={respondedCount === totalCount 
            ? 'bg-green-100 text-green-700 border-green-200' 
            : 'bg-amber-100 text-amber-700 border-amber-200'
          }>
            {respondedCount}/{totalCount}名回答
          </Badge>
        </h3>
        {isExpanded ? (
          <ChevronUp className="w-4 h-4 text-muted-foreground" />
        ) : (
          <ChevronDown className="w-4 h-4 text-muted-foreground" />
        )}
      </button>

      {isExpanded && (
        <div className="mt-3 space-y-4">
          {/* 未回答者の警告 */}
          {respondedCount < totalCount && (
            <div className="flex items-center gap-2 p-2 bg-amber-50 rounded-lg text-sm text-amber-700">
              <AlertCircle className="w-4 h-4" />
              <span>
                {members
                  .filter(m => !isMemberAnswered(m.id))
                  .map(m => m.guest_name || '不明')
                  .join('、')
                }さんが未回答です（必須の質問が空のままの方を含みます）
              </span>
            </div>
          )}

          {/* 質問ごとの回答一覧 */}
          {questions.map((question, qIndex) => (
            <div key={question.id} className="space-y-2">
              <p className="text-sm font-medium">
                Q{qIndex + 1}. {question.question_text}
                {question.is_required && (
                  <span className="text-red-500 text-xs ml-1">*</span>
                )}
              </p>
              <div className="pl-4 space-y-1">
                {members.map(member => {
                  const hasResponse = responses.some(r => r.member_id === member.id)
                  const value = getResponseValue(question.id, member.id)
                  
                  return (
                    <div key={member.id} className="flex items-start gap-2 text-sm">
                      <span className="text-muted-foreground min-w-[80px]">
                        {getMemberName(member.id)}:
                      </span>
                      <span className={hasResponse ? '' : 'text-amber-600'}>
                        {value}
                      </span>
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
