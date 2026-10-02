import { readSurveyQuestionSettings } from '@/lib/surveyQuestionSettings'
import { readPrivateGroupSurveyResponses, readPrivateGroupByReservation, readPrivateGroupMessageHistory } from '@/lib/privateGroupRead'
import { useState, useEffect } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Checkbox } from '@/components/ui/checkbox'
import { ClipboardList, CheckCircle2, AlertCircle, Loader2, ChevronDown, ChevronUp, Send, User, MessageSquare, Link, FileText } from 'lucide-react'
import { scheduleUiApi } from '@/lib/api/scheduleUiApi'
import { globalSettingsReadApi } from '@/lib/api/organizationReadApi'
import { organizationScenarioReadApi } from '@/lib/api/scenarioReadApi'
import { logger } from '@/utils/logger'
import { showToast } from '@/utils/toast'
import type { SurveyQuestion } from '@/types'
import { formatJstMonthDay, formatJstTime } from '@/utils/jstDate'

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
  const [loadError, setLoadError] = useState(false)
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
    let cancelled = false
    setLoading(true)
    setLoadError(false)
    setQuestions([])
    setResponses([])
    setMembers([])
    setCharacters([])
    setGroupId(null)
    setSentNotices([])
    setConfirmedAssignments(null)
    setCharAssignmentMethod(null)
    const loadSurveyData = async () => {
      if (!reservationId) {
        if (!cancelled) setLoading(false)
        return
      }

      try {
        const snapshot = await readPrivateGroupByReservation(reservationId)
        if (!snapshot) return
        const groupData = snapshot.group
        const gId = groupData.id
        const organizationId = groupData.organization_id
        const effectiveScenarioId = scenarioId || groupData.scenario_master_id
        if (!cancelled) setGroupId(gId)
        if (!cancelled) setCharAssignmentMethod(groupData.character_assignment_method || null)
        const assignments = groupData.character_assignments
        if (!cancelled) setConfirmedAssignments(assignments && Object.keys(assignments).length > 0 ? assignments as Record<string, string> : null)
        const membersData = (groupData.members || []).map(member => ({
          id: member.id,
          guest_name: member.staff_display_name || member.guest_name || '参加者',
          user_id: member.user_id,
        }))
        if (!cancelled) setMembers(membersData)

        let orgScenario = null as any
        if (effectiveScenarioId) {
          const { data: viewByMaster } = await organizationScenarioReadApi.getSurveyViewByMaster(effectiveScenarioId, organizationId)
          orgScenario = viewByMaster

          if (!orgScenario) {
            const { data: viewByOrgId } = await organizationScenarioReadApi.getSurveyViewByOrgScenarioId(effectiveScenarioId, organizationId)
            orgScenario = viewByOrgId
          }
        }

        if (orgScenario?.player_count_max) {
          if (!cancelled) setParticipantLimit(orgScenario.player_count_max)
        }
        
        logger.log('📋 SurveyTab: orgScenario result', { 
          scenarioId, 
          orgScenario,
          surveyEnabled: orgScenario?.survey_enabled 
        })

        if (!orgScenario?.org_scenario_id) {
          logger.log('📋 SurveyTab: no orgScenario found')
          if (!cancelled) setLoading(false)
          return
        }

        // シナリオごとの template が優先、なければ組織のデフォルト本文を使う
        if (orgScenario.individual_notice_template) {
          if (!cancelled) setNoticeTemplate(orgScenario.individual_notice_template)
        } else {
          const { data: gs } = await globalSettingsReadApi.getIndividualNoticeDefaultBody(organizationId)
          if (!cancelled) setNoticeTemplate((gs as { individual_notice_default_body?: string | null } | null)?.individual_notice_default_body || null)
        }

        if (orgScenario.characters) {
          if (!cancelled) setCharacters(orgScenario.characters.map((c: any) => ({
            id: c.id,
            name: c.name,
            url: c.url || null,
            is_npc: c.is_npc || false,
            survey_description: c.survey_description || null,
          })))
        }

        const { questions: questionsData } = await readSurveyQuestionSettings(orgScenario.org_scenario_id)
        if (questionsData && questionsData.length > 0) {
          if (!cancelled) setQuestions(questionsData)
        }

        const responsesData = await readPrivateGroupSurveyResponses(gId)

        if (responsesData) {
          if (!cancelled) setResponses(responsesData)
        }

        // 送信履歴を取得
        const noticeMessages = (await readPrivateGroupMessageHistory(gId)).reverse()

        if (noticeMessages) {
          const notices = noticeMessages
            .map((msg) => {
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
          if (!cancelled) setSentNotices(notices)
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
      const shouldAttachTemplate = attachTemplate[memberId] !== false && noticeTemplate

      const { data, error } = await scheduleUiApi.sendPrivateGroupIndividualNotice({ groupId, memberId, message, characterId: selectedCharId || null, attachTemplate: !!shouldAttachTemplate })
      if (error) throw error
      if (!data?.id || !data?.created_at || !data?.message) throw new Error('保存結果を確認できませんでした')
      const saved = JSON.parse(data.message)
      showToast.success(`${memberName}さんへのお知らせを送信しました`)
      setSentNotices(prev => [{
        id: data.id,
        target_member_id: saved.target_member_id,
        target_member_name: saved.target_member_name,
        character_name: saved.character_name || null,
        sent_by: saved.sent_by || null,
        created_at: data.created_at,
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

  if (loadError) return <p role="alert" className="text-sm p-4">アンケートを取得できませんでした。画面を開き直してください。</p>

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

  const allQuestionIds = new Set(questions.map(q => q.id))
  const respondedCount = responses.filter(r => Object.keys(r.responses).some(key => allQuestionIds.has(key))).length
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
          const hasResponse = !!response && Object.keys(response.responses).some(key => allQuestionIds.has(key))
          const isExpanded = expandedMembers.has(member.id)
          const memberName = getMemberName(member.id)

          // キャラクター配役: CharacterAssignmentFormで確定した配役のみ（アンケート回答とは独立）
          const confirmedCharId = confirmedAssignments ? confirmedAssignments[member.id] : null
          const assignedChar = confirmedCharId ? characters.find(c => c.id === confirmedCharId) : null
          const isSelfAssigned = charAssignmentMethod === 'self' && !!assignedChar

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
                    {hasResponse && questions.length > 0 ? (
                      questions.map((question, qIndex) => {
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
                                  {formatJstMonthDay(n.created_at)}
                                  {' '}
                                  {formatJstTime(n.created_at)}
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
