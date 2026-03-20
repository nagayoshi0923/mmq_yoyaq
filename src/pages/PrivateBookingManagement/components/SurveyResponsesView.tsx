import { useState, useEffect } from 'react'
import { Badge } from '@/components/ui/badge'
import { ClipboardList, CheckCircle2, AlertCircle, ChevronDown, ChevronUp } from 'lucide-react'
import { supabase } from '@/lib/supabase'
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
  const [isExpanded, setIsExpanded] = useState(false)
  const [characters, setCharacters] = useState<Array<{ id: string; name: string }>>([])

  useEffect(() => {
    const loadSurveyData = async () => {
      if (!reservationId || !scenarioId) {
        setLoading(false)
        return
      }

      try {
        // reservation_id から private_groups を取得（メンバーは別クエリ: user_id は auth.users 参照のためネスト users(email) が 400 になる）
        const { data: groupData, error: groupError } = await supabase
          .from('private_groups')
          .select('id, organization_id')
          .eq('reservation_id', reservationId)
          .maybeSingle()

        if (groupError) {
          logger.warn('アンケート: private_groups 取得エラー:', groupError)
          setLoading(false)
          return
        }

        if (!groupData) {
          setLoading(false)
          return
        }

        const groupId = groupData.id
        const organizationId = groupData.organization_id

        const { data: membersRaw, error: membersError } = await supabase
          .from('private_group_members')
          .select('id, guest_name, guest_email, user_id')
          .eq('group_id', groupId)

        if (membersError) {
          logger.warn('アンケート: メンバー取得エラー:', membersError)
        }

        const userIds = (membersRaw || [])
          .filter((m: { user_id: string | null }) => m.user_id)
          .map((m: { user_id: string | null }) => m.user_id as string)

        const customerNicknames: Record<string, string> = {}
        if (userIds.length > 0) {
          let custQ = supabase
            .from('customers')
            .select('user_id, nickname, name, email')
            .in('user_id', userIds)
          if (organizationId) {
            custQ = custQ.eq('organization_id', organizationId)
          }
          const { data: customers, error: custError } = await custQ

          if (custError) {
            logger.warn('アンケート: 顧客名取得エラー:', custError)
          } else if (customers) {
            customers.forEach((c: { user_id: string; nickname: string | null; name: string | null; email: string | null }) => {
              customerNicknames[c.user_id] = c.nickname || c.name || c.email?.split('@')[0] || ''
            })
          }
        }

        const membersData: MemberData[] = (membersRaw || []).map((m: {
          id: string
          guest_name: string | null
          guest_email: string | null
          user_id: string | null
        }) => {
          let name: string | null = null
          if (m.user_id && customerNicknames[m.user_id]) {
            name = customerNicknames[m.user_id] || null
          }
          if (!name && m.guest_name) name = m.guest_name
          if (!name && m.guest_email) name = m.guest_email.split('@')[0]
          return { id: m.id, guest_name: name || '参加者' }
        })
        setMembers(membersData)

        // organization_scenariosからorg_scenario_idを取得
        let { data: orgScenario } = await supabase
          .from('organization_scenarios')
          .select('id, survey_enabled, characters')
          .eq('scenario_master_id', scenarioId)
          .eq('organization_id', organizationId)
          .maybeSingle()

        if (!orgScenario) {
          const { data: byOrgScenarioId } = await supabase
            .from('organization_scenarios')
            .select('id, survey_enabled, characters')
            .eq('id', scenarioId)
            .maybeSingle()
          orgScenario = byOrgScenarioId
        }

        if (!orgScenario?.survey_enabled || !orgScenario.id) {
          setLoading(false)
          return
        }

        // キャラクター情報を取得
        if (orgScenario.characters) {
          setCharacters(orgScenario.characters.map((c: any) => ({
            id: c.id,
            name: c.name,
          })))
        }

        // 質問を取得
        const { data: questionsData } = await supabase
          .from('org_scenario_survey_questions')
          .select(
            'id, org_scenario_id, question_text, question_type, options, is_required, order_num, created_at, updated_at'
          )
          .eq('org_scenario_id', orgScenario.id)
          .order('order_num', { ascending: true })

        if (questionsData && questionsData.length > 0) {
          setQuestions(questionsData)
        }

        // 回答を取得
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

  if (loading || questions.length === 0) {
    return null
  }

  const respondedCount = responses.length
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
                  .filter(m => !responses.some(r => r.member_id === m.id))
                  .map(m => m.guest_name || '不明')
                  .join('、')
                }さんが未回答です
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
