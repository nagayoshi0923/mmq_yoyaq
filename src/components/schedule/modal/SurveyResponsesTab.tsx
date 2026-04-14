import { useState, useEffect } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Checkbox } from '@/components/ui/checkbox'
import { ClipboardList, CheckCircle2, AlertCircle, Loader2, ChevronDown, ChevronUp, Send, User, MessageSquare, Link, FileText } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
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
  const { user } = useAuth()
  const [questions, setQuestions] = useState<SurveyQuestion[]>([])
  const [responses, setResponses] = useState<ResponseData[]>([])
  const [members, setMembers] = useState<MemberData[]>([])
  const [loading, setLoading] = useState(true)
  const [characters, setCharacters] = useState<Array<{ id: string; name: string; url?: string | null; is_npc?: boolean; survey_description?: string | null }>>([])
  const [groupId, setGroupId] = useState<string | null>(null)
  const [participantLimit, setParticipantLimit] = useState<number | null>(null)
  const [confirmedAssignments, setConfirmedAssignments] = useState<Record<string, string> | null>(null)
  const [charAssignmentMethod, setCharAssignmentMethod] = useState<string | null>(null)
  
  // 各メンバーの展開状態
  const [expandedMembers, setExpandedMembers] = useState<Set<string>>(new Set())
  // メッセージ送信用
  const [messageInputs, setMessageInputs] = useState<Record<string, string>>({})
  const [selectedCharacters, setSelectedCharacters] = useState<Record<string, string>>({})
  const [sendingMessage, setSendingMessage] = useState<string | null>(null)
  const [noticeTemplate, setNoticeTemplate] = useState<string | null>(null)
  const [attachTemplate, setAttachTemplate] = useState<Record<string, boolean>>({})
  // 送信履歴
  const [sentNotices, setSentNotices] = useState<Array<{
    id: string
    target_member_id: string
    target_member_name: string
    character_name?: string | null
    sent_by?: string | null
    created_at: string
  }>>([])

  useEffect(() => {
    const loadSurveyData = async () => {
      if (!reservationId) {
        setLoading(false)
        return
      }

      try {
        const { data: groupData, error: groupError } = await supabase
          .from('private_groups')
          .select('id, organization_id, scenario_master_id')
          .eq('reservation_id', reservationId)
          .maybeSingle()

        if (groupError) {
          setLoading(false)
          return
        }

        if (!groupData) {
          setLoading(false)
          return
        }

        const gId = groupData.id
        const organizationId = groupData.organization_id
        const effectiveScenarioId = scenarioId || (groupData as any).scenario_master_id
        setGroupId(gId)

        // 配役情報を別クエリで安全に取得
        try {
          const { data: charData } = await supabase
            .from('private_groups')
            .select('character_assignments, character_assignment_method')
            .eq('id', gId)
            .maybeSingle()
          if (charData) {
            setCharAssignmentMethod((charData as any).character_assignment_method || null)
            const ca = (charData as any).character_assignments
            if (ca && typeof ca === 'object' && Object.keys(ca).length > 0) {
              setConfirmedAssignments(ca as Record<string, string>)
            } else {
              setConfirmedAssignments(null)
            }
          }
        } catch {
          // カラム未追加の環境でもエラーにならない
        }
        logger.log('📋 SurveyTab: groupData found', { groupId: gId, organizationId })

        // メンバー情報を取得
        const { data: membersRaw, error: membersError } = await supabase
          .from('private_group_members')
          .select('id, guest_name, guest_email, user_id')
          .eq('group_id', gId)
        
        if (membersError) {
          logger.warn('📋 SurveyTab: メンバー情報取得エラー:', membersError)
        }
        
        logger.log('📋 SurveyTab: メンバー取得結果', { count: membersRaw?.length, data: membersRaw })

        // user_idがあるメンバーのニックネームをcustomersテーブルから取得
        const userIds = (membersRaw || [])
          .filter((m: any) => m.user_id)
          .map((m: any) => m.user_id)
        
        const customerNicknames: Record<string, string> = {}
        if (userIds.length > 0) {
          try {
            let custQ = supabase
              .from('customers')
              .select('user_id, nickname, name')
              .in('user_id', userIds)
            if (organizationId) {
              custQ = custQ.eq('organization_id', organizationId)
            }
            const { data: customers, error: custError } = await custQ
            
            if (custError) {
              logger.warn('📋 SurveyTab: 顧客ニックネーム取得エラー:', custError)
            } else if (customers) {
              customers.forEach((c: any) => {
                // ニックネーム優先、なければ氏名
                customerNicknames[c.user_id] = c.nickname || c.name || null
              })
              logger.log('📋 SurveyTab: 顧客ニックネーム取得結果', customerNicknames)
            }
          } catch (err) {
            logger.warn('📋 SurveyTab: 顧客ニックネーム取得で例外:', err)
          }
        }

        const membersData = (membersRaw || []).map((m: any) => {
          // 名前の優先順位: customersのnickname/name > guest_name > guest_emailのローカル部分
          let name = null
          if (m.user_id && customerNicknames[m.user_id]) {
            name = customerNicknames[m.user_id]
          }
          if (!name && m.guest_name) {
            name = m.guest_name
          }
          if (!name && m.guest_email) {
            name = m.guest_email.split('@')[0]
          }
          return {
            id: m.id,
            guest_name: name || '参加者',
            user_id: m.user_id,
          }
        })
        setMembers(membersData)

        let orgScenario = null as any
        if (effectiveScenarioId) {
          const { data: viewByMaster } = await supabase
            .from('organization_scenarios_with_master')
            .select('org_scenario_id, survey_enabled, characters, player_count_max, individual_notice_template')
            .eq('scenario_master_id', effectiveScenarioId)
            .eq('organization_id', organizationId)
            .maybeSingle()
          orgScenario = viewByMaster

          if (!orgScenario) {
            const { data: viewByOrgId } = await supabase
              .from('organization_scenarios_with_master')
              .select('org_scenario_id, survey_enabled, characters, player_count_max, individual_notice_template')
              .eq('org_scenario_id', effectiveScenarioId)
              .maybeSingle()
            orgScenario = viewByOrgId
          }
        }

        if (orgScenario?.player_count_max) {
          setParticipantLimit(orgScenario.player_count_max)
        }
        
        logger.log('📋 SurveyTab: orgScenario result', { 
          scenarioId, 
          orgScenario,
          surveyEnabled: orgScenario?.survey_enabled 
        })

        if (!orgScenario?.org_scenario_id) {
          logger.log('📋 SurveyTab: no orgScenario found')
          setLoading(false)
          return
        }

        setNoticeTemplate(orgScenario.individual_notice_template || null)

        if (orgScenario.characters) {
          setCharacters(orgScenario.characters.map((c: any) => ({
            id: c.id,
            name: c.name,
            url: c.url || null,
            is_npc: c.is_npc || false,
            survey_description: c.survey_description || null,
          })))
        }

        const { data: questionsData } = await supabase
          .from('org_scenario_survey_questions')
          .select(
            'id, org_scenario_id, question_text, question_type, options, is_required, order_num, created_at, updated_at'
          )
          .eq('org_scenario_id', orgScenario.org_scenario_id)
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

        // 送信履歴を取得
        const { data: noticeMessages } = await supabase
          .from('private_group_messages')
          .select('id, message, created_at')
          .eq('group_id', gId)
          .order('created_at', { ascending: false })

        if (noticeMessages) {
          const notices = noticeMessages
            .map((msg: any) => {
              try {
                const parsed = JSON.parse(msg.message)
                if (parsed?.action === 'individual_notice') {
                  return {
                    id: msg.id,
                    target_member_id: parsed.target_member_id,
                    target_member_name: parsed.target_member_name,
                    character_name: parsed.character_name || null,
                    sent_by: parsed.sent_by || null,
                    created_at: msg.created_at,
                  }
                }
              } catch { /* ignore */ }
              return null
            })
            .filter((x): x is NonNullable<typeof x> => x !== null)
          setSentNotices(notices)
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
    const message = messageInputs[memberId]?.trim() || ''
    const hasChar = !!selectedCharacters[memberId]
    const hasTemplate = !!(attachTemplate[memberId] !== false && noticeTemplate)
    if (!groupId || (!message && !hasChar && !hasTemplate)) return

    setSendingMessage(memberId)
    try {
      const member = members.find(m => m.id === memberId)
      const memberName = member?.guest_name || '参加者'
      
      // 選択されたキャラクターの情報を取得
      const selectedCharId = selectedCharacters[memberId]
      const selectedChar = selectedCharId ? characters.find(c => c.id === selectedCharId) : null
      
      // メッセージにキャラクターURLと定型文を含める
      const parts: string[] = []
      if (message) parts.push(message)
      const shouldAttachTemplate = attachTemplate[memberId] !== false && noticeTemplate
      if (shouldAttachTemplate) parts.push(noticeTemplate)
      const charDesc = selectedChar?.survey_description
      if (charDesc) parts.push(charDesc)
      if (selectedChar?.url) {
        parts.push(`【${selectedChar.name}の資料】\n${selectedChar.url}`)
      }
      const fullMessage = parts.join('\n\n')

      // グループチャットにシステムメッセージとして送信
      const { error } = await supabase
        .from('private_group_messages')
        .insert({
          group_id: groupId,
          member_id: memberId,
          message: JSON.stringify({
            type: 'system',
            action: 'individual_notice',
            target_member_id: memberId,
            target_member_name: memberName,
            message: fullMessage,
            character_id: selectedCharId || null,
            character_name: selectedChar?.name || null,
            character_url: selectedChar?.url || null,
            template_attached: !!shouldAttachTemplate,
            sent_by: user?.staffName || user?.name || null,
          })
        })

      if (error) throw error

      showToast.success(`${memberName}さんへのお知らせを送信しました`)
      setSentNotices(prev => [{
        id: crypto.randomUUID(),
        target_member_id: memberId,
        target_member_name: memberName,
        character_name: selectedChar?.name || null,
        sent_by: user?.staffName || user?.name || null,
        created_at: new Date().toISOString(),
      }, ...prev])
      setMessageInputs(prev => ({ ...prev, [memberId]: '' }))
      setSelectedCharacters(prev => ({ ...prev, [memberId]: '' }))
      setAttachTemplate(prev => ({ ...prev, [memberId]: false }))
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

  if (questions.length === 0 && responses.length === 0 && !confirmedAssignments) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-center">
        <ClipboardList className="w-10 h-10 text-muted-foreground mb-3" />
        <p className="text-sm text-muted-foreground">
          アンケート回答・配役データがありません
        </p>
      </div>
    )
  }

  const nonCharQuestionIds = new Set(questions.filter(q => q.question_type !== 'character_selection').map(q => q.id))
  const respondedCount = responses.filter(r => Object.keys(r.responses).some(key => nonCharQuestionIds.has(key))).length
  // 分母はシナリオの参加者上限（なければメンバー数）
  const totalCount = participantLimit || members.length

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

    if (question.question_type === 'rating') {
      const num = parseInt(String(value), 10)
      if (num >= 1 && num <= 5) return `${'★'.repeat(num)}${'☆'.repeat(5 - num)}（${num}/5）`
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
          const hasResponse = !!response && Object.keys(response.responses).some(key => nonCharQuestionIds.has(key))
          const isExpanded = expandedMembers.has(member.id)
          const memberName = getMemberName(member.id)

          // キャラクター配役: 回答データから直接取得
          const charSelQuestion = questions.find(q => q.question_type === 'character_selection')
          const assignedCharId = charSelQuestion && response ? response.responses[charSelQuestion.id] as string : null
          const assignedChar = assignedCharId ? characters.find(c => c.id === assignedCharId) : null
          const isSelfAssigned = charAssignmentMethod === 'self' && !!assignedChar

          // キャラクター選択以外の質問
          const nonCharQuestions = questions.filter(q => q.question_type !== 'character_selection')

          return (
            <div key={member.id} className="border rounded-lg overflow-hidden">
              {/* メンバーヘッダー（クリックで展開/折りたたみ） */}
              <button
                type="button"
                onClick={() => toggleMember(member.id)}
                className="w-full flex items-center justify-between p-3 bg-white hover:bg-gray-50 transition-colors"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <User className="w-4 h-4 text-gray-500 shrink-0" />
                  <span className="font-medium text-sm">{memberName}</span>
                  {assignedChar ? (
                    <Badge className="bg-purple-100 text-purple-800 border-purple-200 text-xs shrink-0">
                      {assignedChar.name}
                    </Badge>
                  ) : (
                    <Badge 
                      variant="outline" 
                      className={hasResponse 
                        ? 'bg-green-100 text-green-700 border-green-200 text-xs shrink-0' 
                        : 'bg-amber-100 text-amber-700 border-amber-200 text-xs shrink-0'
                      }
                    >
                      {hasResponse ? '回答済み' : '未回答'}
                    </Badge>
                  )}
                </div>
                {isExpanded ? (
                  <ChevronUp className="w-4 h-4 text-gray-400 shrink-0" />
                ) : (
                  <ChevronDown className="w-4 h-4 text-gray-400 shrink-0" />
                )}
              </button>

              {/* 展開時の内容 */}
              {isExpanded && (
                <div className="border-t bg-gray-50">
                  {/* 「自分たちで配役」の場合はアンケート回答を非表示 */}
                  {isSelfAssigned ? (
                    <div className="p-3">
                      <div className="bg-purple-50 rounded p-3 text-sm text-purple-700 flex items-center gap-2">
                        <CheckCircle2 className="w-4 h-4" />
                        キャラクター選択で配役済み
                      </div>
                    </div>
                  ) : (
                  <div className="p-3 space-y-3">
                    {hasResponse && nonCharQuestions.length > 0 ? (
                      nonCharQuestions.map((question, qIndex) => {
                        const value = getResponseValue(question.id, member.id)
                        if (value === '未回答') return null
                        return (
                          <div key={question.id} className="bg-white rounded p-2">
                            <p className="text-xs text-muted-foreground mb-1">
                              Q{qIndex + 1}. {question.question_text}
                            </p>
                            <p className="text-sm font-medium">{value}</p>
                          </div>
                        )
                      })
                    ) : !hasResponse ? (
                      <div className="bg-amber-50 rounded p-3 text-sm text-amber-700 flex items-center gap-2">
                        <AlertCircle className="w-4 h-4" />
                        まだ回答がありません
                      </div>
                    ) : null}
                  </div>
                  )}

                  {/* 個別メッセージ送信 */}
                  <div className="border-t p-3">
                    <p className="text-xs text-muted-foreground mb-2 flex items-center gap-1">
                      <MessageSquare className="w-3 h-3" />
                      {memberName}さんへ個別にお知らせ
                    </p>
                    
                    {/* キャラクター選択（URLがあり、NPCでないキャラクターのみ表示） */}
                    {characters.filter(c => c.url && !c.is_npc).length > 0 && (
                      <div className="mb-2">
                        <p className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
                          <Link className="w-3 h-3" />
                          資料URLを添付
                        </p>
                        <Select
                          value={selectedCharacters[member.id] || 'none'}
                          onValueChange={(value) => setSelectedCharacters(prev => ({
                            ...prev,
                            [member.id]: value === 'none' ? '' : value
                          }))}
                        >
                          <SelectTrigger className="text-sm h-8">
                            <SelectValue placeholder="キャラクターを選択（任意）" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">選択しない</SelectItem>
                            {characters.filter(c => c.url && !c.is_npc).map(char => (
                              <SelectItem key={char.id} value={char.id}>
                                {char.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        {(() => {
                          const selChar = selectedCharacters[member.id]
                            ? characters.find(c => c.id === selectedCharacters[member.id])
                            : null
                          return selChar?.survey_description ? (
                            <p className="text-xs text-muted-foreground bg-muted rounded px-2 py-1 mt-1 whitespace-pre-wrap">
                              {selChar.survey_description}
                            </p>
                          ) : null
                        })()}
                      </div>
                    )}

                    {noticeTemplate && (
                      <div className="mb-2">
                        <label className="flex items-start gap-2 cursor-pointer">
                          <Checkbox
                            checked={attachTemplate[member.id] !== false}
                            onCheckedChange={(checked) => setAttachTemplate(prev => ({
                              ...prev,
                              [member.id]: checked === true
                            }))}
                            className="mt-0.5"
                          />
                          <div className="flex-1 min-w-0">
                            <span className="text-xs text-muted-foreground flex items-center gap-1">
                              <FileText className="w-3 h-3" />
                              定型文を添付
                            </span>
                            {attachTemplate[member.id] !== false && (
                              <p className="text-xs text-muted-foreground bg-muted rounded px-2 py-1 mt-1 whitespace-pre-wrap max-h-[120px] overflow-y-auto">
                                {noticeTemplate}
                              </p>
                            )}
                          </div>
                        </label>
                      </div>
                    )}

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
                        disabled={sendingMessage === member.id || (
                          !messageInputs[member.id]?.trim()
                          && !selectedCharacters[member.id]
                          && !(attachTemplate[member.id] !== false && noticeTemplate)
                        )}
                        className="text-xs bg-blue-600 hover:bg-blue-700 text-white"
                      >
                        {sendingMessage === member.id ? (
                          <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                        ) : (
                          <Send className="w-3 h-3 mr-1" />
                        )}
                        送信
                      </Button>
                    </div>

                    {/* 送信履歴 */}
                    {sentNotices.filter(n => n.target_member_id === member.id).length > 0 && (
                      <div className="mt-3 pt-2 border-t border-dashed">
                        <p className="text-[10px] text-muted-foreground mb-1 flex items-center gap-1">
                          <CheckCircle2 className="w-3 h-3" />
                          送信履歴
                        </p>
                        <div className="space-y-0.5">
                          {sentNotices
                            .filter(n => n.target_member_id === member.id)
                            .map(n => (
                              <div key={n.id} className="text-[10px] text-muted-foreground flex items-center gap-1.5 flex-wrap">
                                <span className="shrink-0">
                                  {new Date(n.created_at).toLocaleDateString('ja-JP', { month: 'numeric', day: 'numeric' })}
                                  {' '}
                                  {new Date(n.created_at).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })}
                                </span>
                                {n.sent_by && (
                                  <span className="shrink-0">{n.sent_by}</span>
                                )}
                                {n.character_name && (
                                  <Badge variant="outline" className="text-[9px] h-4 px-1 shrink-0">
                                    {n.character_name}
                                  </Badge>
                                )}
                                <span className="text-green-600">✓</span>
                              </div>
                            ))
                          }
                        </div>
                      </div>
                    )}
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
