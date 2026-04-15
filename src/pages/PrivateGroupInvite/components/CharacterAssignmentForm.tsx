import { useState, useCallback, useEffect } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { Users, CheckCircle2, Loader2, X, Send, ArrowLeft, AlertTriangle } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { logger } from '@/utils/logger'
import { toast } from 'sonner'
import type { PrivateGroupMember } from '@/types'

interface CharacterData {
  id: string
  name: string
  gender?: string
}

interface CharacterAssignmentFormProps {
  groupId: string
  memberId: string
  members: PrivateGroupMember[]
  characters: CharacterData[]
  assignments: Record<string, string>
  isOrganizer: boolean
  onUpdated: () => void
  onClose?: () => void
}

export function CharacterAssignmentForm({
  groupId,
  memberId,
  members,
  characters,
  assignments: initialAssignments,
  isOrganizer,
  onUpdated,
  onClose,
}: CharacterAssignmentFormProps) {
  const [saving, setSaving] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [preferences, setPreferences] = useState<Record<string, string>>(initialAssignments)
  // 主催者の確定ステップ
  const [step, setStep] = useState<'preferences' | 'confirm'>('preferences')
  const [decisions, setDecisions] = useState<Record<string, string>>({})

  const activeMembers = members.filter(m => (m.status as string) === 'active' || m.status === 'joined')
  const charNameById = (id: string | undefined) => id ? characters.find(c => c.id === id)?.name : null

  // リアルタイム同期
  useEffect(() => {
    // 初回読み込み
    const fetchLatest = async () => {
      const { data } = await supabase
        .from('private_groups')
        .select('character_assignments')
        .eq('id', groupId)
        .single()
      if (data?.character_assignments) {
        setPreferences(data.character_assignments as Record<string, string>)
      }
    }
    void fetchLatest()

    const channel = supabase
      .channel(`char_prefs_${groupId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'private_groups', filter: `id=eq.${groupId}` },
        (payload) => {
          const newAssigns = (payload.new as any)?.character_assignments
          if (newAssigns) {
            setPreferences(newAssigns as Record<string, string>)
          }
        }
      )
      .subscribe()

    return () => { void supabase.removeChannel(channel) }
  }, [groupId])

  // 自分の希望を保存（RPCでアトミックに1キーだけ更新、他の参加者の希望を上書きしない）
  const handleSelectPreference = useCallback(async (charId: string) => {
    setPreferences(prev => ({ ...prev, [memberId]: charId }))
    setSaving(true)
    try {
      const { error } = await supabase.rpc('set_character_preference', {
        p_group_id: groupId,
        p_member_id: memberId,
        p_character_id: charId,
      })
      if (error) throw error
    } catch (err) {
      logger.error('キャラクター選択エラー:', err)
      toast.error('保存に失敗しました')
    } finally {
      setSaving(false)
    }
  }, [memberId, groupId])

  // 主催者: 確定ステップへ進む
  const handleGoToConfirm = useCallback(() => {
    setDecisions({ ...preferences })
    setStep('confirm')
  }, [preferences])

  // 主催者: 確定して送信
  const handleConfirmAndSend = useCallback(async () => {
    setSubmitting(true)
    try {
      const lines = activeMembers.map(m => {
        const charId = decisions[m.id]
        const charName = characters.find(c => c.id === charId)?.name || '未定'
        const memberName = m.guest_name || '参加者'
        const prefCharId = preferences[m.id]
        const changed = prefCharId && prefCharId !== charId
        return `${memberName} → ${charName}${changed ? '（変更あり）' : ''}`
      }).join('\n')

      const { error } = await supabase
        .from('private_group_messages')
        .insert({
          group_id: groupId,
          member_id: null,
          message: JSON.stringify({
            type: 'system',
            action: 'character_assignment',
            title: 'キャラクター配役が決定しました',
            body: lines,
            assignments: decisions,
          }),
        })
      if (error) throw error
      toast.success('配役を確定しました')
      onUpdated()
    } catch (err) {
      logger.error('配役確定エラー:', err)
      toast.error('送信に失敗しました')
    } finally {
      setSubmitting(false)
    }
  }, [activeMembers, decisions, preferences, characters, groupId, onUpdated])

  const myPreference = preferences[memberId]
  const allPreferred = activeMembers.every(m => preferences[m.id])

  // 確定ステップの被りチェック
  const decisionDupes = (() => {
    const chosen = activeMembers.map(m => decisions[m.id]).filter(Boolean)
    const dupes = chosen.filter((v, i) => chosen.indexOf(v) !== i)
    return [...new Set(dupes)]
  })()
  const allDecided = activeMembers.every(m => decisions[m.id])

  // ===== 確定ステップ（主催者のみ） =====
  if (step === 'confirm' && isOrganizer) {
    return (
      <Card className="border-purple-200 border-0 shadow-none">
        <CardContent className="p-4 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <button onClick={() => setStep('preferences')} className="p-1 hover:bg-gray-100 rounded">
                <ArrowLeft className="w-5 h-5 text-gray-500" />
              </button>
              <Users className="w-5 h-5 text-purple-600" />
              <h3 className="text-base font-semibold">配役の確定</h3>
            </div>
            {onClose && (
              <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded">
                <X className="w-5 h-5 text-gray-500" />
              </button>
            )}
          </div>

          <p className="text-sm text-muted-foreground">
            希望を参考に、各メンバーの配役を決定してください。被りがある場合は調整してください。
          </p>

          <div className="space-y-4">
            {activeMembers.map(m => {
              const prefCharName = charNameById(preferences[m.id])
              const decisionCharId = decisions[m.id]

              return (
                <div key={m.id} className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium">
                      {m.guest_name || '参加者'}
                      {m.id === memberId && <span className="text-xs text-purple-600 ml-1">（あなた）</span>}
                    </p>
                    {prefCharName && (
                      <Badge variant="outline" className="text-xs bg-blue-50 text-blue-700 border-blue-200">
                        希望: {prefCharName}
                      </Badge>
                    )}
                  </div>
                  <Select
                    value={decisionCharId || 'none'}
                    onValueChange={(v) => v !== 'none' && setDecisions(prev => ({ ...prev, [m.id]: v }))}
                  >
                    <SelectTrigger className="w-full">
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
          </div>

          {decisionDupes.length > 0 && (
            <div className="flex items-start gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-3 py-2">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{decisionDupes.map(id => charNameById(id)).filter(Boolean).join('、')} が複数人に割り当てられています</span>
            </div>
          )}

          {allDecided && decisionDupes.length === 0 ? (
            <Button
              onClick={handleConfirmAndSend}
              disabled={submitting}
              className="w-full bg-purple-600 hover:bg-purple-700"
            >
              {submitting ? (
                <><Loader2 className="w-4 h-4 mr-2 animate-spin" />送信中...</>
              ) : (
                <><Send className="w-4 h-4 mr-2" />配役を確定して送信</>
              )}
            </Button>
          ) : (
            <p className="text-xs text-center text-muted-foreground">
              {!allDecided ? '全員の配役を選択してください' : '被りを解消してください'}
            </p>
          )}
        </CardContent>
      </Card>
    )
  }

  // ===== 希望ステップ（全員共通） =====
  return (
    <Card className="border-purple-200 border-0 shadow-none">
      <CardContent className="p-4 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Users className="w-5 h-5 text-purple-600" />
            <h3 className="text-base font-semibold">キャラクター希望</h3>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className={
              myPreference
                ? 'bg-green-100 text-green-700 border-green-200'
                : 'bg-amber-100 text-amber-700 border-amber-200'
            }>
              {myPreference ? '希望済' : '未回答'}
            </Badge>
            {onClose && (
              <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded">
                <X className="w-5 h-5 text-gray-500" />
              </button>
            )}
          </div>
        </div>

        <p className="text-sm text-muted-foreground">
          希望するキャラクターを選んでください。被りもOKです。
        </p>

        <div className="space-y-2">
          <p className="text-sm font-medium">あなたの希望</p>
          <Select
            value={myPreference || 'none'}
            onValueChange={(v) => v !== 'none' && handleSelectPreference(v)}
            disabled={saving}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder="希望キャラクターを選択" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none" disabled>選択してください</SelectItem>
              {characters.map(char => (
                <SelectItem key={char.id} value={char.id}>
                  {char.name}
                  {char.gender && ` (${char.gender === 'male' ? '男性' : char.gender === 'female' ? '女性' : char.gender === 'any' ? '性別自由' : 'その他'})`}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {saving && (
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <Loader2 className="w-3 h-3 animate-spin" /> 保存中...
            </p>
          )}
        </div>

        <div className="space-y-2">
          <p className="text-sm font-medium">みんなの希望状況</p>
          <div className="space-y-1.5">
            {activeMembers.map(m => {
              const prefName = charNameById(preferences[m.id])
              const isMe = m.id === memberId
              return (
                <div key={m.id} className="flex items-center justify-between py-1.5 px-2 rounded bg-gray-50">
                  <span className="text-sm">
                    {m.guest_name || '参加者'}
                    {isMe && <span className="text-xs text-purple-600 ml-1">（あなた）</span>}
                    {m.is_organizer && <span className="text-xs text-amber-600 ml-1">★</span>}
                  </span>
                  {prefName ? (
                    <Badge className="bg-purple-100 text-purple-800 border-purple-200">
                      <CheckCircle2 className="w-3 h-3 mr-1" />
                      {prefName}
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="text-muted-foreground">未回答</Badge>
                  )}
                </div>
              )
            })}
          </div>
        </div>

        {allPreferred && isOrganizer && (
          <Button
            onClick={handleGoToConfirm}
            className="w-full bg-purple-600 hover:bg-purple-700"
          >
            配役を確定する
          </Button>
        )}

        {allPreferred && !isOrganizer && (
          <p className="text-xs text-center text-green-600 bg-green-50 rounded p-2">
            全員の希望が揃いました。主催者が配役を確定します。
          </p>
        )}

        {!allPreferred && isOrganizer && (
          <p className="text-xs text-center text-muted-foreground">
            全員の希望が揃うと配役確定ボタンが表示されます
          </p>
        )}
      </CardContent>
    </Card>
  )
}
