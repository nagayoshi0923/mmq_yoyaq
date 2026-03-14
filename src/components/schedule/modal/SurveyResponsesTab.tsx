import { useState, useEffect } from 'react'
import { Badge } from '@/components/ui/badge'
import { ClipboardList, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { logger } from '@/utils/logger'
import type { SurveyQuestion } from '@/types'

interface SurveyResponsesTabProps {
  reservationId?: string
  scenarioId?: string
}

interface ResponseData {
  member_id: string
  responses: Record<string, string | string[]>
  submitted_at: string
}

interface MemberData {
  id: string
  guest_name?: string | null
  users?: { email: string } | null
}

export function SurveyResponsesTab({
  reservationId,
  scenarioId,
}: SurveyResponsesTabProps) {
  const [questions, setQuestions] = useState<SurveyQuestion[]>([])
  const [responses, setResponses] = useState<ResponseData[]>([])
  const [members, setMembers] = useState<MemberData[]>([])
  const [loading, setLoading] = useState(true)
  const [characters, setCharacters] = useState<Array<{ id: string; name: string }>>([])
  const [surveyEnabled, setSurveyEnabled] = useState(false)

  useEffect(() => {
    const loadSurveyData = async () => {
      if (!reservationId || !scenarioId) {
        logger.log('📋 SurveyTab: missing reservationId or scenarioId', { reservationId, scenarioId })
        setLoading(false)
        return
      }

      try {
        logger.log('📋 SurveyTab: loading data', { reservationId, scenarioId })
        
        const { data: groupData } = await supabase
          .from('private_groups')
          .select(`
            id,
            organization_id,
            members:private_group_members(id, guest_name, user_id, users:user_id(email))
          `)
          .eq('reservation_id', reservationId)
          .maybeSingle()

        if (!groupData) {
          logger.log('📋 SurveyTab: no groupData found for reservationId', reservationId)
          setLoading(false)
          return
        }

        const groupId = groupData.id
        const organizationId = groupData.organization_id
        logger.log('📋 SurveyTab: groupData found', { groupId, organizationId })

        const membersData = (groupData.members || []).map((m: any) => ({
          id: m.id,
          guest_name: m.guest_name,
          users: m.users ? { email: m.users.email } : null,
        }))
        setMembers(membersData)

        // まず scenario_master_id で検索
        let { data: orgScenario } = await supabase
          .from('organization_scenarios')
          .select('id, survey_enabled, characters')
          .eq('scenario_master_id', scenarioId)
          .eq('organization_id', organizationId)
          .maybeSingle()

        // 見つからなければ id で検索（organization_scenario.id が渡されている可能性）
        if (!orgScenario) {
          const { data: orgScenarioById } = await supabase
            .from('organization_scenarios')
            .select('id, survey_enabled, characters')
            .eq('id', scenarioId)
            .maybeSingle()
          orgScenario = orgScenarioById
        }
        
        logger.log('📋 SurveyTab: orgScenario result', { 
          scenarioId, 
          orgScenario,
          surveyEnabled: orgScenario?.survey_enabled 
        })

        if (!orgScenario?.id) {
          logger.log('📋 SurveyTab: no orgScenario found')
          setLoading(false)
          return
        }

        setSurveyEnabled(!!orgScenario.survey_enabled)

        if (!orgScenario.survey_enabled) {
          setLoading(false)
          return
        }

        if (orgScenario.characters) {
          setCharacters(orgScenario.characters.map((c: any) => ({
            id: c.id,
            name: c.name,
          })))
        }

        const { data: questionsData } = await supabase
          .from('org_scenario_survey_questions')
          .select('*')
          .eq('org_scenario_id', orgScenario.id)
          .order('order_num', { ascending: true })

        if (questionsData && questionsData.length > 0) {
          setQuestions(questionsData)
        }

        const { data: responsesData } = await supabase
          .from('private_group_survey_responses')
          .select('member_id, responses, submitted_at')
          .eq('group_id', groupId)

        if (responsesData) {
          setResponses(responsesData)
        }
      } catch (err) {
        logger.error('アンケートデータ読み込みエラー:', err)
      } finally {
        setLoading(false)
      }
    }

    loadSurveyData()
  }, [reservationId, scenarioId])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!reservationId) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-center">
        <ClipboardList className="w-10 h-10 text-muted-foreground mb-3" />
        <p className="text-sm text-muted-foreground">
          この公演には予約が紐づいていません
        </p>
      </div>
    )
  }

  if (!surveyEnabled) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-center">
        <ClipboardList className="w-10 h-10 text-muted-foreground mb-3" />
        <p className="text-sm text-muted-foreground">
          このシナリオはアンケートが有効になっていません
        </p>
        <p className="text-xs text-muted-foreground mt-1">
          シナリオ設定でアンケートを有効にしてください
        </p>
      </div>
    )
  }

  if (questions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-center">
        <ClipboardList className="w-10 h-10 text-muted-foreground mb-3" />
        <p className="text-sm text-muted-foreground">
          アンケートの質問が設定されていません
        </p>
      </div>
    )
  }

  const respondedCount = responses.length
  const totalCount = members.length

  const getMemberName = (memberId: string) => {
    const member = members.find(m => m.id === memberId)
    return member?.guest_name || member?.users?.email || '不明'
  }

  const getResponseValue = (questionId: string, memberId: string): string => {
    const response = responses.find(r => r.member_id === memberId)
    if (!response) return '未回答'
    
    const value = response.responses[questionId]
    if (!value) return '未回答'

    const question = questions.find(q => q.id === questionId)
    if (!question) return String(value)

    if (question.question_type === 'character_selection') {
      const char = characters.find(c => c.id === value)
      return char?.name || String(value)
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

    return String(value)
  }

  return (
    <div className="space-y-4">
      {/* ヘッダー */}
      <div className="flex items-center justify-between">
        <h3 className="flex items-center gap-2 text-sm font-medium">
          <ClipboardList className="w-4 h-4 text-purple-600" />
          事前アンケート回答
        </h3>
        <Badge 
          variant="outline" 
          className={respondedCount === totalCount && totalCount > 0
            ? 'bg-green-100 text-green-700 border-green-200' 
            : 'bg-amber-100 text-amber-700 border-amber-200'
          }
        >
          {respondedCount}/{totalCount}名回答
        </Badge>
      </div>

      {/* 未回答者の警告 */}
      {respondedCount < totalCount && totalCount > 0 && (
        <div className="flex items-center gap-2 p-2 bg-amber-50 rounded-lg text-sm text-amber-700">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>
            {members
              .filter(m => !responses.some(r => r.member_id === m.id))
              .map(m => m.guest_name || m.users?.email || '不明')
              .join('、')
            }さんが未回答です
          </span>
        </div>
      )}

      {/* 全員回答済み */}
      {respondedCount === totalCount && totalCount > 0 && (
        <div className="flex items-center gap-2 p-2 bg-green-50 rounded-lg text-sm text-green-700">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>全員回答済みです</span>
        </div>
      )}

      {/* メンバーがいない場合 */}
      {totalCount === 0 && (
        <div className="flex items-center gap-2 p-2 bg-gray-50 rounded-lg text-sm text-muted-foreground">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>グループメンバーがいません</span>
        </div>
      )}

      {/* 質問ごとの回答一覧 */}
      <div className="space-y-4">
        {questions.map((question, qIndex) => (
          <div key={question.id} className="space-y-2 p-3 bg-gray-50 rounded-lg">
            <p className="text-sm font-medium">
              Q{qIndex + 1}. {question.question_text}
              {question.is_required && (
                <span className="text-red-500 text-xs ml-1">*必須</span>
              )}
            </p>
            <div className="space-y-1.5">
              {members.map(member => {
                const hasResponse = responses.some(r => r.member_id === member.id)
                const value = getResponseValue(question.id, member.id)
                
                return (
                  <div key={member.id} className="flex items-start gap-2 text-sm bg-white p-2 rounded">
                    <span className="text-muted-foreground min-w-[100px] shrink-0">
                      {getMemberName(member.id)}
                    </span>
                    <span className={`flex-1 ${hasResponse ? '' : 'text-amber-600 italic'}`}>
                      {value}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
