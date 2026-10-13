/**
 * グループ画面の配役の状況（「いまの状態」の箱・概要タブ・全画面シートで共用）。
 * キャラクター（NPC を除く）・参加メンバー・希望／配役と、DB の private_group_casting_status（確定済みか・アンケートの回答状況）。
 */
import { useMemo } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import type { PrivateGroup } from '@/types'
import { castingStatusKey, readPrivateGroupCastingStatus } from '@/lib/privateGroupCastingStatus'
import { privateGroupChatAction } from '@/lib/privateGroupChat'
import { getErrorMessage } from '@/lib/errorFields'
import { buildAnswerTable } from '../groupPageModel'
import { castingCharactersOf, castingMembersOf, castingProgressFor, surveyUsable, type CastingCharacter } from './castingModel'

export function useGroupCasting(args: {
  group: PrivateGroup
  memberId: string
  /** 日程が確定していて公演前（それ以外は読まない） */
  active: boolean
  /** 作品の人数（最低〜最大）。確定は人数に関係なくできる。最低人数に満たないときは警告だけ */
  playerRange: { min: number | null; max: number | null }
}) {
  const { group, memberId, active } = args
  const queryClient = useQueryClient()
  const characters = useMemo(
    () => castingCharactersOf(group.scenario_masters?.characters as unknown as Array<CastingCharacter & { is_npc?: boolean }> | undefined),
    [group.scenario_masters?.characters],
  )
  const members = useMemo(() => castingMembersOf(buildAnswerTable(group, memberId).columns), [group, memberId])
  const assignments = useMemo(() => (group.character_assignments ?? {}) as Record<string, string>, [group.character_assignments])
  const method = (group.character_assignment_method as string | null | undefined) ?? null
  const enabled = active && characters.length > 0
  const { data: status } = useQuery({
    queryKey: castingStatusKey(group.id, memberId),
    enabled,
    queryFn: () => readPrivateGroupCastingStatus(group.id, memberId),
  })
  const progress = enabled ? castingProgressFor({ method, assignments, members, characterCount: characters.length, status }) : null
  const reloadStatus = () => queryClient.invalidateQueries({ queryKey: castingStatusKey(group.id, memberId) })

  /** 未回答の人に知らせる（主催者）。kind: survey＝事前配役アンケート、casting＝やりたいキャラクター */
  const remind = async (memberIds: string[], kind: 'survey' | 'casting') => {
    if (memberIds.length === 0) return
    try {
      await privateGroupChatAction(group.id, memberId, 'remind_unanswered', { member_ids: memberIds, kind })
    } catch (err) {
      toast.error(getErrorMessage(err) || 'お知らせを送れませんでした')
      throw err
    }
    toast.success('チャットにお知らせしました')
  }

  return {
    characters,
    members,
    assignments,
    method,
    status,
    progress,
    /** 「配役」欄・シートを出す（キャラクターがいて、決め方が選ばれているか選べる・確定済み） */
    visible: Boolean(progress && (progress.method !== null || progress.needsChoice || progress.confirmed)),
    surveyAvailable: surveyUsable(status),
    playerRange: args.playerRange,
    reloadStatus,
    remind,
  }
}
