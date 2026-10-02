import { useState } from 'react'
import { readPrivateGroup, readPrivateGroupList } from '@/lib/privateGroupRead'
import { supabase } from '@/lib/supabase'
import { privateGroupRpcApi } from '@/lib/api/privateGroupRpcApi'
import { resolveOrgIdFromPageContext } from '@/lib/organization'
import { logger } from '@/utils/logger'
import { privateGroupTimeSlotToDb } from '@/lib/privateGroupTimeSlot'
import { privateGroupMemberAction, savePrivateGroupGuestToken } from '@/lib/privateGroupGuestSession'
import type {
  PrivateGroup,
  PrivateGroupMember,
  PrivateGroupCandidateDate,
  DateResponse,
} from '@/types'
import { getErrorMessage } from '@/lib/errorFields'

interface CandidateDateInput {
  date: string
  time_slot: '午前' | '午後' | '夜'
  start_time: string
  end_time: string
  order_num: number
}

interface CreateGroupParams {
  scenarioId: string
  name?: string
  preferredStoreIds?: string[]
  candidateDates: CandidateDateInput[]
  notes?: string
}

interface JoinGroupParams {
  groupId: string
  inviteCode: string
  pin?: string
  userId?: string
  guestName?: string
  guestEmail?: string
  guestPhone?: string
}

interface DateResponseParams {
  groupId: string
  memberId: string
  candidateDateId: string
  response: DateResponse
}

export function usePrivateGroup() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const createGroup = async (params: CreateGroupParams): Promise<PrivateGroup> => {
    setLoading(true)
    setError(null)

    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('ログインが必要です')

      // ページの組織コンテキスト（URLスラッグ / ?org=）を最優先で解決する。
      // ログインユーザーの所属組織を優先すると、組織スタッフが他組織のページから
      // グループを作った際に自組織へ紐づいてしまう（予約も同じ組織に作られるため事故になる）。
      const organizationId = await resolveOrgIdFromPageContext()
      if (!organizationId) throw new Error('組織情報が取得できません')

      // グループ・幹事・候補日・初回メッセージを同じトランザクションで保存する。
      const { data: group, error: groupError } = await privateGroupRpcApi.createAtomic({
        p_organization_id: organizationId,
        p_scenario_master_id: params.scenarioId,
        p_name: params.name || null,
        p_preferred_store_ids: params.preferredStoreIds || [],
        p_candidate_dates: params.candidateDates.map((cd, index) => ({
          ...cd,
          time_slot: privateGroupTimeSlotToDb(cd.time_slot),
          order_num: cd.order_num || index + 1,
        })),
        p_notes: params.notes || null,
      })
      if (groupError) {
        logger.error('Failed to create group', groupError)
        throw new Error(groupError.message || 'グループの作成に失敗しました')
      }

      return group as PrivateGroup

    } catch (err) {
      setError(getErrorMessage(err))
      throw err
    } finally {
      setLoading(false)
    }
  }

  const getGroupByInviteCode = async (inviteCode: string): Promise<PrivateGroup | null> => {
    setLoading(true)
    setError(null)
    try {
      return (await readPrivateGroup({ inviteCode })).group
    } catch (err) {
      setError(err instanceof Error ? err.message : 'グループを取得できませんでした')
      throw err
    } finally {
      setLoading(false)
    }
  }

  const getGroupById = async (groupId: string): Promise<PrivateGroup | null> => {
    setLoading(true)
    setError(null)
    try {
      return (await readPrivateGroup({ groupId })).group
    } catch (err) {
      setError(err instanceof Error ? err.message : 'グループを取得できませんでした')
      throw err
    } finally {
      setLoading(false)
    }
  }

  const getMyGroups = async (): Promise<PrivateGroup[]> => {
    setLoading(true)
    setError(null)

    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return []

      return await readPrivateGroupList('organized')

    } catch (err) {
      setError(getErrorMessage(err))
      throw err
    } finally {
      setLoading(false)
    }
  }

  const joinGroup = async (params: JoinGroupParams): Promise<PrivateGroupMember> => {
    setLoading(true)
    setError(null)

    try {
      const { data, error } = await privateGroupRpcApi.join({
        p_invite_code: params.inviteCode,
        p_guest_name: params.guestName || null,
        p_guest_email: params.guestEmail || null,
        p_guest_phone: params.guestPhone || null,
        p_pin: params.pin || null,
      })
      if (error) throw new Error(error.message || 'グループへの参加に失敗しました')
      const member = data.member
      if (data.guest_token) savePrivateGroupGuestToken(params.groupId, data.guest_token)

      return member as PrivateGroupMember

    } catch (err) {
      setError(getErrorMessage(err))
      throw err
    } finally {
      setLoading(false)
    }
  }

  const submitDateResponses = async (
    groupId: string,
    memberId: string,
    responses: Array<{ candidateDateId: string; response: DateResponse }>
  ): Promise<void> => {
    setLoading(true)
    setError(null)

    try {
      const { error } = await privateGroupMemberAction(groupId, memberId, 'date_responses', responses)

      if (error) {
        logger.error('Failed to submit date responses', error)
        throw new Error(error.message || '日程回答の送信に失敗しました')
      }

    } catch (err) {
      setError(getErrorMessage(err))
      throw err
    } finally {
      setLoading(false)
    }
  }

  const cancelUnrequestedGroup = async (groupId: string): Promise<void> => {
    setLoading(true)
    setError(null)
    try {
      const { data, error } = await privateGroupRpcApi.cancelUnrequested(groupId)
      if (error) {
        throw new Error(error.code === '55P03'
          ? 'ほかの操作が進行中です。画面を更新してからお試しください。'
          : error.message)
      }
      if (data !== true) throw new Error('グループのキャンセルを確認できませんでした')
    } catch (err) {
      setError(getErrorMessage(err))
      throw err
    } finally {
      setLoading(false)
    }
  }

  const getDateResponsesSummary = (
    candidateDates: PrivateGroupCandidateDate[]
  ): Array<{
    candidateDate: PrivateGroupCandidateDate
    okCount: number
    ngCount: number
    maybeCount: number
    isViable: boolean
  }> => {
    return candidateDates.map(cd => {
      const responses = cd.responses || []
      const okCount = responses.filter(r => r.response === 'ok').length
      const ngCount = responses.filter(r => r.response === 'ng').length
      const maybeCount = responses.filter(r => r.response === 'maybe').length

      return {
        candidateDate: cd,
        okCount,
        ngCount,
        maybeCount,
        isViable: ngCount === 0,
      }
    })
  }

  // メンバーを削除（主催者用）
  const removeMember = async (memberId: string): Promise<void> => {
    setLoading(true)
    setError(null)

    try {
      const { error } = await privateGroupRpcApi.removeMember(memberId)

      if (error) throw error
    } catch (err) {
      setError(getErrorMessage(err))
      throw err
    } finally {
      setLoading(false)
    }
  }

  // グループから退出（メンバー用）
  const leaveGroup = async (groupId: string): Promise<void> => {
    setLoading(true)
    setError(null)

    try {
      const { error } = await privateGroupRpcApi.leave(groupId)

      if (error) throw error
    } catch (err) {
      setError(getErrorMessage(err))
      throw err
    } finally {
      setLoading(false)
    }
  }

  return {
    loading,
    error,
    createGroup,
    getGroupByInviteCode,
    getGroupById,
    getMyGroups,
    joinGroup,
    submitDateResponses,
    cancelUnrequestedGroup,
    getDateResponsesSummary,
    removeMember,
    leaveGroup,
  }
}
