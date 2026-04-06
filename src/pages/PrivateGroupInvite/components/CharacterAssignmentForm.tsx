import { useState, useCallback } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Users, CheckCircle2, Loader2, Send } from 'lucide-react'
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
}

export function CharacterAssignmentForm({
  groupId,
  memberId,
  members,
  characters,
  assignments,
  isOrganizer,
  onUpdated,
}: CharacterAssignmentFormProps) {
  const [saving, setSaving] = useState(false)
  const [confirming, setConfirming] = useState(false)

  const activeMembers = members.filter(m => m.status === 'active' || m.status === 'joined')

  const handleSelectCharacter = useCallback(async (charId: string) => {
    setSaving(true)
    try {
      const newAssignments = { ...assignments, [memberId]: charId }
      const { error } = await supabase
        .from('private_groups')
        .update({ character_assignments: newAssignments })
        .eq('id', groupId)
      if (error) throw error
      onUpdated()
    } catch (err) {
      logger.error('キャラクター選択エラー:', err)
      toast.error('保存に失敗しました')
    } finally {
      setSaving(false)
    }
  }, [assignments, memberId, groupId, onUpdated])

  const handleConfirmAndSend = useCallback(async () => {
    setConfirming(true)
    try {
      const assignmentLines = activeMembers.map(m => {
        const charId = assignments[m.id]
        const charName = characters.find(c => c.id === charId)?.name || '未選択'
        const memberName = m.guest_name || '参加者'
        return `${memberName} → ${charName}`
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
            body: assignmentLines,
            assignments,
          }),
        })
      if (error) throw error
      toast.success('配役を確定しました')
      onUpdated()
    } catch (err) {
      logger.error('配役確定エラー:', err)
      toast.error('送信に失敗しました')
    } finally {
      setConfirming(false)
    }
  }, [activeMembers, assignments, characters, groupId, onUpdated])

  const mySelection = assignments[memberId]
  const allPicked = activeMembers.every(m => assignments[m.id])

  return (
    <Card className="mb-6 border-purple-200">
      <CardContent className="p-4 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Users className="w-5 h-5 text-purple-600" />
            <h3 className="text-base font-semibold">キャラクター選択</h3>
          </div>
          <Badge variant="outline" className={
            allPicked
              ? 'bg-green-100 text-green-700 border-green-200'
              : 'bg-amber-100 text-amber-700 border-amber-200'
          }>
            {Object.keys(assignments).filter(k => activeMembers.some(m => m.id === k)).length}/{activeMembers.length}名選択済
          </Badge>
        </div>

        <p className="text-sm text-muted-foreground">
          あなたのキャラクターを選択してください。全員が選び終わったら、主催者が確定します。
        </p>

        {/* 自分のキャラクター選択 */}
        <div className="space-y-2">
          <p className="text-sm font-medium">あなたのキャラクター</p>
          <Select
            value={mySelection || 'none'}
            onValueChange={(v) => v !== 'none' && handleSelectCharacter(v)}
            disabled={saving}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder="キャラクターを選択" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none" disabled>選択してください</SelectItem>
              {characters.map(char => (
                <SelectItem key={char.id} value={char.id}>
                  {char.name}
                  {char.gender && (
                    <span className="text-muted-foreground ml-1">
                      ({char.gender === 'male' ? '男性' : char.gender === 'female' ? '女性' : char.gender === 'any' ? '性別自由' : 'その他'})
                    </span>
                  )}
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

        {/* 全員の選択状況 */}
        <div className="space-y-2">
          <p className="text-sm font-medium">みんなの選択状況</p>
          <div className="space-y-1.5">
            {activeMembers.map(m => {
              const charId = assignments[m.id]
              const charName = charId ? characters.find(c => c.id === charId)?.name : null
              const isMe = m.id === memberId
              return (
                <div key={m.id} className="flex items-center justify-between py-1.5 px-2 rounded bg-gray-50">
                  <span className="text-sm">
                    {m.guest_name || '参加者'}
                    {isMe && <span className="text-xs text-purple-600 ml-1">（あなた）</span>}
                  </span>
                  {charName ? (
                    <Badge className="bg-purple-100 text-purple-800 border-purple-200">
                      <CheckCircle2 className="w-3 h-3 mr-1" />
                      {charName}
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="text-muted-foreground">
                      未選択
                    </Badge>
                  )}
                </div>
              )
            })}
          </div>
        </div>

        {/* 被りの警告 */}
        {(() => {
          const chosen = activeMembers
            .map(m => assignments[m.id])
            .filter(Boolean)
          const dupes = chosen.filter((v, i) => chosen.indexOf(v) !== i)
          if (dupes.length === 0) return null
          const dupeNames = [...new Set(dupes)].map(id => characters.find(c => c.id === id)?.name).filter(Boolean)
          return (
            <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1.5">
              {dupeNames.join('、')} が複数人に選ばれています。相談して調整してください。
            </p>
          )
        })()}

        {/* 主催者の確定ボタン */}
        {isOrganizer && allPicked && (
          <Button
            onClick={handleConfirmAndSend}
            disabled={confirming}
            className="w-full bg-purple-600 hover:bg-purple-700"
          >
            {confirming ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                送信中...
              </>
            ) : (
              <>
                <Send className="w-4 h-4 mr-2" />
                配役を確定して送信
              </>
            )}
          </Button>
        )}

        {isOrganizer && !allPicked && (
          <p className="text-xs text-center text-muted-foreground">
            全員がキャラクターを選択すると、確定ボタンが表示されます
          </p>
        )}

        {!isOrganizer && allPicked && (
          <p className="text-xs text-center text-muted-foreground">
            全員の選択が完了しました。主催者の確定をお待ちください。
          </p>
        )}
      </CardContent>
    </Card>
  )
}
