/**
 * 配役（キャラクター）の決め方とアンケートのカード（GroupChat.tsx から規則を変えずに切り出した。グループページ刷新 段階 2）。
 * 配役方法の選択（主催者）・アンケート回答カード・自分たちで決めるときのキャラクター選択と主催者の確定。
 */
import { useCallback, useEffect, useState } from 'react'
import { Loader2, CheckCircle2, ClipboardList, Users, AlertTriangle } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ConfirmDialog } from '@/components/patterns/modal'
import { privateGroupMemberAction } from '@/lib/privateGroupGuestSession'
import { privateGroupRpcApi } from '@/lib/api/privateGroupRpcApi'
import { isPastPerformanceDate } from '@/lib/surveyCompletion'
import { logger } from '@/utils/logger'
import type { PrivateGroupMember } from '@/types'
import type { PrivateGroupSnapshot } from '@/lib/privateGroupRead'

export interface CharacterData {
  id: string
  name: string
  gender?: string
  image_url?: string
  image_position?: string
  image_scale?: number | null
}

interface CharacterAssignmentCardsProps {
  groupId: string
  currentMemberId: string | null
  members: PrivateGroupMember[]
  characterAssignments: Record<string, string> | null | undefined
  refreshGroup: () => Promise<PrivateGroupSnapshot | null | undefined>
  refetchMessages: () => Promise<unknown>
  effectiveNeedsCharAssignmentChoice: boolean | undefined
  isOrganizer: boolean
  onCharAssignmentMethodSelected?: (method: 'survey' | 'self') => void | Promise<void>
  onResetCharAssignmentMethod?: () => void | Promise<void>
  onCharAssignmentConfirmed?: () => void
  charAssignmentMethod?: string | null
  characters: CharacterData[]
  scenarioId?: string
  organizationId?: string
  performanceDate?: string
  scenarioPlayerCount?: number | null
  currentAssignmentConfirmed: boolean
  deadlineText: string | null
  surveyAvailable: boolean
  surveyNoticeTitle: string
  openSurvey: () => void
}

export function CharacterAssignmentCards(props: CharacterAssignmentCardsProps) {
  const {
    groupId, currentMemberId, members, characterAssignments, refreshGroup, refetchMessages, effectiveNeedsCharAssignmentChoice, isOrganizer,
    onCharAssignmentMethodSelected, onResetCharAssignmentMethod, onCharAssignmentConfirmed, charAssignmentMethod, characters, scenarioId, organizationId,
    performanceDate, scenarioPlayerCount, currentAssignmentConfirmed, deadlineText, surveyAvailable, surveyNoticeTitle, openSurvey,
  } = props
  const [showResetCharAssignmentConfirm, setShowResetCharAssignmentConfirm] = useState(false)
  const [charPreferences, setCharPreferences] = useState<Record<string, string>>({})
  const [charSaving, setCharSaving] = useState(false)
  const [methodSaving, setMethodSaving] = useState(false)
  const [charConfirmStep, setCharConfirmStep] = useState(false)
  const [charDecisions, setCharDecisions] = useState<Record<string, string>>({})
  const [charConfirmExpected, setCharConfirmExpected] = useState<Record<string, string>>({})
  const [charSubmitting, setCharSubmitting] = useState(false)
  useEffect(() => {
    setCharPreferences((characterAssignments || {}) as Record<string, string>)
  }, [characterAssignments])

  const handleSelectCharPreference = useCallback(async (charId: string) => {
    if (!currentMemberId) return
    setCharPreferences(prev => ({ ...prev, [currentMemberId]: charId }))
    setCharSaving(true)
    try {
      const { error } = await privateGroupMemberAction(groupId, currentMemberId, 'character_preference', { characterId: charId })
      if (error) throw error
    } catch (err) {
      logger.error('キャラクター選択エラー:', err)
      toast.error('保存に失敗しました')
    } finally {
      await refreshGroup()
      setCharSaving(false)
    }
  }, [currentMemberId, groupId, refreshGroup])

  const handleGoToCharConfirm = useCallback(async () => {
    // 取得できないときに空の配役で上書きしない。
    const latestSnapshot = await refreshGroup()
    if (!latestSnapshot) {
      toast.error('配役情報を取得できませんでした。再読み込みしてください')
      return
    }
    const latest = (latestSnapshot.group.character_assignments || {}) as Record<string, string>
    setCharPreferences(latest)
    setCharDecisions({ ...latest })
    setCharConfirmExpected({ ...latest })
    setCharConfirmStep(true)
  }, [refreshGroup])

  const handleCharConfirmAndSend = useCallback(async () => {
    setCharSubmitting(true)
    try {
      const activeMembers = members.filter(m => (m.status as string) === 'active' || m.status === 'joined')
      const assignments = Object.fromEntries(activeMembers.map(m => [m.id, charDecisions[m.id]]))
      const { error } = await privateGroupRpcApi.confirmCharacters({
        p_group_id: groupId,
        p_assignments: assignments,
        p_expected_assignments: charConfirmExpected,
      })
      if (error) throw error
      await refreshGroup()
      toast.success('配役を確定しました')
      setCharConfirmStep(false)
      onCharAssignmentConfirmed?.()
    } catch (err) {
      logger.error('配役確定エラー:', err)
      toast.error('配役の確定に失敗しました。希望や参加者が変更されていないか確認してください')
    } finally {
      setCharSubmitting(false)
    }
  }, [members, charDecisions, charConfirmExpected, groupId, onCharAssignmentConfirmed, refreshGroup])

  const selectCharacterMethod = async (method: 'survey' | 'self') => {
    if (methodSaving) return
    setMethodSaving(true)
    try {
      await onCharAssignmentMethodSelected?.(method)
      setCharConfirmStep(false)
      await Promise.all([refreshGroup(), refetchMessages()])
    } catch (error) {
      logger.error('配役方法の変更エラー:', error)
      toast.error('配役方法を保存できませんでした。最新の状態を確認してください')
    } finally { setMethodSaving(false) }
  }

  const resetCharacterMethod = async () => {
    try {
      await onResetCharAssignmentMethod?.()
      setCharConfirmStep(false)
      await Promise.all([refreshGroup(), refetchMessages()])
    } catch (error) {
      toast.error('配役方法を変更できませんでした。最新の状態を確認してください')
      throw error
    }
  }

  return (
    <>
          {/* 配役方法の選択カード（主催者のみ） */}
          {effectiveNeedsCharAssignmentChoice && isOrganizer && onCharAssignmentMethodSelected && (
            <div className="flex justify-center my-4">
              <div className="bg-purple-50 border border-purple-200 rounded-lg p-4 w-full max-w-sm">
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-6 h-6 bg-purple-600 rounded-full flex items-center justify-center">
                    <Users className="w-3.5 h-3.5 text-white" />
                  </div>
                  <span className="font-semibold text-sm">キャラクターの配役方法</span>
                </div>
                <p className="text-sm text-muted-foreground mb-3">
                  キャラクターの配役をどのように決めますか？
                </p>
                <div className="space-y-2">
                  <Button
                    variant="outline"
                    className="w-full h-auto py-3 flex flex-col items-start gap-0.5 border-purple-200 hover:bg-purple-100"
                    disabled={methodSaving}
                    onClick={() => void selectCharacterMethod('survey')}
                  >
                    <span className="font-medium text-sm">アンケートで希望を伝える</span>
                    <span className="text-[10px] text-muted-foreground">スタッフが決定します</span>
                  </Button>
                  <Button
                    variant="outline"
                    className="w-full h-auto py-3 flex flex-col items-start gap-0.5 border-purple-200 hover:bg-purple-100"
                    disabled={methodSaving}
                    onClick={() => void selectCharacterMethod('self')}
                  >
                    <span className="font-medium text-sm">自分たちで決める</span>
                    <span className="text-[10px] text-muted-foreground">参加者同士で選択します</span>
                  </Button>
                </div>
              </div>
            </div>
          )}

          {/* 配役方法=survey: アンケート回答カード */}
          {charAssignmentMethod === 'survey' && scenarioId && organizationId && currentMemberId && (
            <div className="flex justify-center my-4">
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 w-full max-w-sm">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 bg-blue-600 rounded-full flex items-center justify-center">
                      <ClipboardList className="w-3.5 h-3.5 text-white" />
                    </div>
                    <span className="font-semibold text-sm text-blue-800">{surveyNoticeTitle}</span>
                  </div>
                  {isOrganizer && onResetCharAssignmentMethod && (
                    <button
                      onClick={() => setShowResetCharAssignmentConfirm(true)}
                      className="text-xs text-purple-600 underline hover:text-purple-800"
                    >
                      方法変更
                    </button>
                  )}
                </div>
                <div className="bg-white rounded-lg p-3 border border-blue-100 space-y-3">
                  <p className="text-sm text-gray-700">
                    キャラクター選択のため、アンケートへのご回答をお願いいたします。
                  </p>
                  {deadlineText && (
                    <p className="text-xs text-blue-600 font-medium">回答期限: {deadlineText}</p>
                  )}
                  <Button
                    onClick={openSurvey}
                    className="w-full bg-blue-600 hover:bg-blue-700"
                    size="sm"
                  >
                    <ClipboardList className="w-4 h-4 mr-2" />
                    アンケートに回答する
                  </Button>
                </div>
              </div>
            </div>
          )}

          {/* 配役方法が「アンケート」以外・未選択: アンケート回答カード（配役以外の質問にも答えられるように。#911） */}
          {/* 公演日を過ぎたら回答できないので出さない（#915） */}
          {charAssignmentMethod !== 'survey' && surveyAvailable && !isPastPerformanceDate(performanceDate) && scenarioId && organizationId && currentMemberId && (
            <div className="flex justify-center my-4">
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 w-full max-w-sm">
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-6 h-6 bg-blue-600 rounded-full flex items-center justify-center">
                    <ClipboardList className="w-3.5 h-3.5 text-white" />
                  </div>
                  <span className="font-semibold text-sm text-blue-800">{surveyNoticeTitle}</span>
                </div>
                <div className="bg-white rounded-lg p-3 border border-blue-100 space-y-3">
                  <p className="text-sm text-foreground">
                    公演前アンケートへのご回答をお願いいたします。
                  </p>
                  {deadlineText && (
                    <p className="text-xs text-blue-600 font-medium">回答期限: {deadlineText}</p>
                  )}
                  <Button
                    onClick={openSurvey}
                    className="w-full bg-blue-600 hover:bg-blue-700"
                    size="sm"
                  >
                    <ClipboardList className="w-4 h-4 mr-2" />
                    アンケートに回答する
                  </Button>
                </div>
              </div>
            </div>
          )}

          {/* 配役方法=self: インラインキャラクター選択（確定済みメッセージがあれば非表示） */}
          {charAssignmentMethod === 'self' && characters.length > 0 && !currentAssignmentConfirmed && (() => {
            const activeMembers = members.filter(m => (m.status as string) === 'active' || m.status === 'joined')
            const charNameById = (id: string | undefined) => id ? characters.find(c => c.id === id)?.name : null
            const allPreferred = activeMembers.every(m => charPreferences[m.id])
            const myPreference = currentMemberId ? charPreferences[currentMemberId] : undefined

            // 主催者の確定ステップ
            if (charConfirmStep && isOrganizer) {
              const decisionDupes = (() => {
                const chosen = activeMembers.map(m => charDecisions[m.id]).filter(Boolean)
                return [...new Set(chosen.filter((v, i) => chosen.indexOf(v) !== i))]
              })()
              const allDecided = activeMembers.every(m => charDecisions[m.id])
              logger.log('🎭 確定ステップ表示中:', { allDecided, decisionDupes, charDecisions, activeMemberIds: activeMembers.map(m=>m.id) })

              return (
                <div className="flex justify-center my-4">
                  <div className="bg-purple-50 border border-purple-200 rounded-lg p-4 w-full max-w-sm space-y-3">
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 bg-purple-600 rounded-full flex items-center justify-center">
                        <Users className="w-3.5 h-3.5 text-white" />
                      </div>
                      <span className="font-semibold text-sm">配役の確定</span>
                    </div>
                    <p className="text-xs text-muted-foreground">希望を参考に配役を決定してください</p>

                    {activeMembers.map(m => {
                      const prefCharName = charNameById(charPreferences[m.id])
                      return (
                        <div key={m.id} className="space-y-1">
                          <div className="flex items-center justify-between">
                            <span className="text-sm font-medium">
                              {m.guest_name || '参加者'}
                              {m.id === currentMemberId && <span className="text-xs text-purple-600 ml-1">（あなた）</span>}
                            </span>
                            {prefCharName && (
                              <Badge variant="outline" className="text-[10px] bg-blue-50 text-blue-700 border-blue-200">
                                希望: {prefCharName}
                              </Badge>
                            )}
                          </div>
                          <Select
                            value={charDecisions[m.id] || 'none'}
                            onValueChange={(v) => v !== 'none' && setCharDecisions(prev => ({ ...prev, [m.id]: v }))}
                          >
                            <SelectTrigger className="w-full h-8 text-sm">
                              <SelectValue placeholder="配役を選択" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="none" disabled>配役を選択</SelectItem>
                              {characters.map(char => (
                                <SelectItem key={char.id} value={char.id}>
                                  {char.name}
                                  {char.gender && ` (${char.gender === 'male' ? '男性' : char.gender === 'female' ? '女性' : char.gender === 'any' ? '性別自由' : 'その他'})`}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      )
                    })}

                    {decisionDupes.length > 0 && (
                      <div className="flex items-start gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-3 py-2">
                        <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                        <span>{decisionDupes.map(id => charNameById(id)).filter(Boolean).join('、')} が複数人に割り当てられています</span>
                      </div>
                    )}

                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setCharConfirmStep(false)}
                        className="flex-1"
                      >
                        戻る
                      </Button>
                      {allDecided && decisionDupes.length === 0 ? (
                        <Button
                          size="sm"
                          onClick={handleCharConfirmAndSend}
                          disabled={charSubmitting}
                          className="flex-1 bg-purple-600 hover:bg-purple-700"
                        >
                          {charSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : '配役を確定'}
                        </Button>
                      ) : (
                        <Button size="sm" disabled className="flex-1">
                          {!allDecided ? '全員選択してください' : '被り解消してください'}
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              )
            }

            // 通常の希望選択ステップ
            return (
              <div className="flex justify-center my-4">
                <div className="bg-purple-50 border border-purple-200 rounded-lg p-4 w-full max-w-sm space-y-3">
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 bg-purple-600 rounded-full flex items-center justify-center">
                      <Users className="w-3.5 h-3.5 text-white" />
                    </div>
                    <span className="font-semibold text-sm">キャラクター選択</span>
                    {isOrganizer && onResetCharAssignmentMethod && (
                      <button
                      onClick={() => setShowResetCharAssignmentConfirm(true)}
                      className="text-xs text-purple-600 underline hover:text-purple-800"
                    >
                      方法変更
                    </button>
                    )}
                    <Badge variant="outline" className={`ml-auto text-[10px] ${myPreference ? 'bg-green-100 text-green-700 border-green-200' : 'bg-amber-100 text-amber-700 border-amber-200'}`}>
                      {myPreference ? '希望済' : '未回答'}
                    </Badge>
                  </div>

                  {/* キャラクター一覧: 画像 + 誰が選んだか表示 */}
                  <div className="space-y-2">
                    {characters.map(char => {
                      const selectedBy = activeMembers.filter(m => charPreferences[m.id] === char.id)
                      const isMyChoice = myPreference === char.id
                      return (
                        <button
                          key={char.id}
                          onClick={() => handleSelectCharPreference(char.id)}
                          disabled={charSaving}
                          className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg border text-left transition-colors ${
                            isMyChoice
                              ? 'bg-purple-100 border-purple-300'
                              : 'bg-white border-gray-200 hover:bg-gray-50'
                          }`}
                        >
                          {/* キャラクター画像 */}
                          {char.image_url ? (
                            <div className="w-[60px] h-[60px] rounded-lg overflow-hidden shrink-0 bg-gray-100">
                              <img
                                src={char.image_url}
                                alt={char.name}
                                className="w-full h-full object-cover"
                                style={{
                                  objectPosition: char.image_position
                                    ? `${char.image_position.split(' ')[0]}% ${char.image_position.split(' ')[1]}%`
                                    : '50% 30%',
                                  transform: char.image_scale ? `scale(${char.image_scale / 100})` : undefined,
                                }}
                              />
                            </div>
                          ) : (
                            <div className="w-[60px] h-[60px] rounded-lg bg-gray-200 shrink-0 flex items-center justify-center">
                              <Users className="w-5 h-5 text-gray-400" />
                            </div>
                          )}
                          {/* 名前 + 選択者 */}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5">
                              {isMyChoice && <CheckCircle2 className="w-4 h-4 text-purple-600 shrink-0" />}
                              <span className="text-sm font-medium truncate">
                                {char.name}
                              </span>
                              {char.gender && (
                                <span className="text-[10px] text-muted-foreground shrink-0">
                                  ({char.gender === 'male' ? '男' : char.gender === 'female' ? '女' : char.gender === 'any' ? '自由' : char.gender})
                                </span>
                              )}
                            </div>
                            {selectedBy.length > 0 ? (
                              <p className="text-xs text-purple-700 mt-0.5 truncate">
                                {selectedBy.map(m => m.id === currentMemberId ? 'あなた' : (m.guest_name || '参加者')).join(', ')}
                              </p>
                            ) : (
                              <p className="text-xs text-gray-400 mt-0.5">未選択</p>
                            )}
                          </div>
                        </button>
                      )
                    })}
                  </div>

                  {charSaving && (
                    <p className="text-xs text-muted-foreground flex items-center gap-1 justify-center">
                      <Loader2 className="w-3 h-3 animate-spin" /> 保存中...
                    </p>
                  )}

                  {deadlineText && (
                    <p className="text-xs text-center text-purple-600 font-medium">回答期限: {deadlineText}</p>
                  )}

                  {/* 参加人数の進捗 */}
                  {(() => {
                    const preferredCount = activeMembers.filter(m => charPreferences[m.id]).length
                    const requiredCount = scenarioPlayerCount || characters.length
                    const memberShortage = activeMembers.length < requiredCount
                    return (
                      <>
                        <p className="text-xs text-center text-muted-foreground">
                          {preferredCount}/{activeMembers.length}人が回答済み{isOrganizer && '（全員揃わなくても確定できます）'}
                        </p>
                        {memberShortage && (
                          <div className="flex items-start gap-2 text-xs text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2">
                            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                            <span>参加メンバー（{activeMembers.length}人）がシナリオの必要人数（{requiredCount}人）に足りません。全員揃ってから配役を確定してください。</span>
                          </div>
                        )}
                      </>
                    )
                  })()}

                  {/* 主催者は確定ボタン表示（メンバー不足時は無効） */}
                  {isOrganizer && (
                    <Button
                      size="sm"
                      onClick={handleGoToCharConfirm}
                      disabled={activeMembers.length < (scenarioPlayerCount || characters.length)}
                      className="w-full bg-purple-600 hover:bg-purple-700"
                    >
                      配役を確定する
                    </Button>
                  )}
                  {allPreferred && !isOrganizer && (
                    <p className="text-xs text-center text-green-600 bg-green-50 rounded p-1.5">
                      全員の希望が揃いました。主催者が配役を確定します。
                    </p>
                  )}
                </div>
              </div>
            )
          })()}
      <ConfirmDialog
        open={showResetCharAssignmentConfirm}
        onOpenChange={setShowResetCharAssignmentConfirm}
        title="配役方法を変更しますか？"
        message="配役方法を変更すると、現在送信されている回答が無効になります。よろしいですか？"
        confirmLabel="変更する"
        onConfirm={resetCharacterMethod}
      />
    </>
  )
}
