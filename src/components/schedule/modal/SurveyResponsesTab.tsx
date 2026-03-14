import { useState, useEffect } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { ClipboardList, CheckCircle2, AlertCircle, Loader2, ChevronDown, ChevronUp, Send, User, MessageSquare } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { logger } from '@/utils/logger'
import { showToast } from '@/utils/toast'
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
  user_id?: string | null
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
  const [groupId, setGroupId] = useState<string | null>(null)
  
  // 各メンバーの展開状態
  const [expandedMembers, setExpandedMembers] = useState<Set<string>>(new Set())
  // メッセージ送信用
  const [messageInputs, setMessageInputs] = useState<Record<string, string>>({})
  const [sendingMessage, setSendingMessage] = useState<string | null>(null)

  useEffect(() => {
    const loadSurveyData = async () => {
      if (!reservationId || !scenarioId) {
        logger.log('📋 SurveyTab: missing reservationId or scenarioId', { reservationId, scenarioId })
        setLoading(false)
        return
      }

      try {
        logger.log('📋 SurveyTab: loading data', { reservationId, scenarioId })
        
        const { data: groupData, error: groupError } = await supabase
          .from('private_groups')
          .select('id, organization_id')
          .eq('reservation_id', reservationId)
          .maybeSingle()

        if (groupError) {
          logger.error('📋 SurveyTab: group fetch error', groupError)
          setLoading(false)
          return
        }

        if (!groupData) {
          logger.log('📋 SurveyTab: no groupData found for reservationId', reservationId)
          setLoading(false)
          return
        }

        const gId = groupData.id
        const organizationId = groupData.organization_id
        setGroupId(gId)
        logger.log('📋 SurveyTab: groupData found', { groupId: gId, organizationId })

        const { data: membersRaw } = await supabase
          .from('private_group_members')
          .select('id, guest_name, user_id')
          .eq('group_id', gId)

        const membersData = (membersRaw || []).map((m: any) => ({
          id: m.id,
          guest_name: m.guest_name,
          user_id: m.user_id,
        }))
        setMembers(membersData)

        let { data: orgScenario } = await supabase
          .from('organization_scenarios')
          .select('id, survey_enabled, characters')
          .eq('scenario_master_id', scenarioId)
          .eq('organization_id', organizationId)
          .maybeSingle()

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

        const { data: responsesData, error: responsesError } = await supabase
          .from('private_group_survey_responses')
          .select('member_id, responses, submitted_at')
          .eq('group_id', gId)

        logger.log('📋 SurveyTab: responses query', { 
          groupId: gId, 
          responsesData, 
          responsesError,
          memberIds: membersData.map((m: MemberData) => m.id)
        })

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

  const toggleMember = (memberId: string) => {
    setExpandedMembers(prev => {
      const next = new Set(prev)
      if (next.has(memberId)) {
        next.delete(memberId)
      } else {
        next.add(memberId)
      }
      return next
    })
  }

  const handleSendMessage = async (memberId: string) => {
    const message = messageInputs[memberId]?.trim()
    if (!message || !groupId) return

    setSendingMessage(memberId)
    try {
      const member = members.find(m => m.id === memberId)
      const memberName = member?.guest_name || '参加者'

      // グループチャットにシステムメッセージとして送信
      const { error } = await supabase
        .from('private_group_messages')
        .insert({
          group_id: groupId,
          sender_id: memberId, // メンバーIDを指定（表示用）
          message: JSON.stringify({
            type: 'system',
            action: 'individual_notice',
            target_member_id: memberId,
            target_member_name: memberName,
            message: message
          }),
          is_system: true
        })

      if (error) throw error

      showToast.success(`${memberName}さんへのお知らせを送信しました`)
      setMessageInputs(prev => ({ ...prev, [memberId]: '' }))
    } catch (err) {
      logger.error('メッセージ送信エラー:', err)
      showToast.error('メッセージの送信に失敗しました')
    } finally {
      setSendingMessage(null)
    }
  }

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
    return member?.guest_name || '不明'
  }

  const getMemberResponse = (memberId: string) => {
    return responses.find(r => r.member_id === memberId)
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
    <div className="space-y-3">
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

      {/* メンバーがいない場合 */}
      {totalCount === 0 && (
        <div className="flex items-center gap-2 p-2 bg-gray-50 rounded-lg text-sm text-muted-foreground">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>グループメンバーがいません</span>
        </div>
      )}

      {/* メンバーごとのカード */}
      <div className="space-y-2">
        {members.map(member => {
          const response = getMemberResponse(member.id)
          const hasResponse = !!response
          const isExpanded = expandedMembers.has(member.id)
          const memberName = getMemberName(member.id)

          return (
            <div key={member.id} className="border rounded-lg overflow-hidden">
              {/* メンバーヘッダー（クリックで展開/折りたたみ） */}
              <button
                type="button"
                onClick={() => toggleMember(member.id)}
                className="w-full flex items-center justify-between p-3 bg-white hover:bg-gray-50 transition-colors"
              >
                <div className="flex items-center gap-2">
                  <User className="w-4 h-4 text-gray-500" />
                  <span className="font-medium text-sm">{memberName}</span>
                  <Badge 
                    variant="outline" 
                    className={hasResponse 
                      ? 'bg-green-100 text-green-700 border-green-200 text-xs' 
                      : 'bg-amber-100 text-amber-700 border-amber-200 text-xs'
                    }
                  >
                    {hasResponse ? '回答済み' : '未回答'}
                  </Badge>
                </div>
                {isExpanded ? (
                  <ChevronUp className="w-4 h-4 text-gray-400" />
                ) : (
                  <ChevronDown className="w-4 h-4 text-gray-400" />
                )}
              </button>

              {/* 展開時の内容 */}
              {isExpanded && (
                <div className="border-t bg-gray-50">
                  {/* 回答内容 */}
                  <div className="p-3 space-y-3">
                    {hasResponse ? (
                      questions.map((question, qIndex) => {
                        const value = getResponseValue(question.id, member.id)
                        return (
                          <div key={question.id} className="bg-white rounded p-2">
                            <p className="text-xs text-muted-foreground mb-1">
                              Q{qIndex + 1}. {question.question_text}
                            </p>
                            <p className="text-sm font-medium">{value}</p>
                          </div>
                        )
                      })
                    ) : (
                      <div className="bg-amber-50 rounded p-3 text-sm text-amber-700 flex items-center gap-2">
                        <AlertCircle className="w-4 h-4" />
                        まだ回答がありません
                      </div>
                    )}
                  </div>

                  {/* 個別メッセージ送信 */}
                  <div className="border-t p-3">
                    <p className="text-xs text-muted-foreground mb-2 flex items-center gap-1">
                      <MessageSquare className="w-3 h-3" />
                      {memberName}さんへ個別にお知らせ
                    </p>
                    <div className="flex gap-2">
                      <Textarea
                        placeholder="メッセージを入力..."
                        value={messageInputs[member.id] || ''}
                        onChange={(e) => setMessageInputs(prev => ({
                          ...prev,
                          [member.id]: e.target.value
                        }))}
                        className="text-sm min-h-[60px] flex-1"
                        rows={2}
                      />
                    </div>
                    <div className="flex justify-end mt-2">
                      <Button
                        size="sm"
                        onClick={() => handleSendMessage(member.id)}
                        disabled={!messageInputs[member.id]?.trim() || sendingMessage === member.id}
                        className="text-xs"
                      >
                        {sendingMessage === member.id ? (
                          <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                        ) : (
                          <Send className="w-3 h-3 mr-1" />
                        )}
                        送信
                      </Button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
