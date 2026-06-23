import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import { resolveOrgIdFromPageContext } from '@/lib/organization'
import { logger } from '@/utils/logger'
import { privateGroupTimeSlotToDb } from '@/lib/privateGroupTimeSlot'
import {
  fetchScenarioPlayerBoundsForOrg,
  memberInvitationCap,
} from '@/lib/privateGroupPlayerCap'
import type {
  PrivateGroup,
  PrivateGroupMember,
  PrivateGroupCandidateDate,
  DateResponse,
} from '@/types'
import {
  getSystemMessageSettings,
  sendSystemMessage,
  enrichGroupWithViewData,
} from './privateGroupHelpers'

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

  const generateInviteCode = async (): Promise<string> => {
    const { data, error } = await supabase.rpc('generate_invite_code')
    if (error) {
      logger.error('Failed to generate invite code', error)
      throw new Error('招待コードの生成に失敗しました')
    }
    return data as string
  }

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

      let inviteCode = await generateInviteCode()
      let attempts = 0
      const maxAttempts = 5

      while (attempts < maxAttempts) {
        const { data: existing } = await supabase
          .from('private_groups')
          .select('id')
          .eq('invite_code', inviteCode)
          .maybeSingle()

        if (!existing) break
        inviteCode = await generateInviteCode()
        attempts++
      }

      if (attempts >= maxAttempts) {
        throw new Error('招待コードの生成に失敗しました。再度お試しください')
      }

      const { data: group, error: groupError } = await supabase
        .from('private_groups')
        .insert({
          organization_id: organizationId,
          scenario_master_id: params.scenarioId,
          organizer_id: user.id,
          name: params.name || null,
          invite_code: inviteCode,
          status: 'gathering',
          preferred_store_ids: params.preferredStoreIds || [],
          notes: params.notes || null,
        })
        .select()
        .single()

      if (groupError) {
        logger.error('Failed to create group', groupError)
        throw new Error('グループの作成に失敗しました')
      }

      // ユーザーのニックネームを取得（customersテーブルから）
      let organizerDisplayName = user.email?.split('@')[0] || '主催者'
      try {
        const { data: customerInfo } = await supabase
          .from('customers')
          .select('nickname, name')
          .eq('user_id', user.id)
          .maybeSingle()
        if (customerInfo?.nickname) {
          organizerDisplayName = customerInfo.nickname
        } else if (customerInfo?.name) {
          organizerDisplayName = customerInfo.name
        }
      } catch (err) {
        logger.warn('ユーザーニックネーム取得エラー:', err)
      }

      const { data: memberData, error: memberError } = await supabase
        .from('private_group_members')
        .insert({
          group_id: group.id,
          user_id: user.id,
          guest_name: organizerDisplayName, // ログインユーザーの表示名を設定
          is_organizer: true,
          status: 'joined',
          joined_at: new Date().toISOString(),
        })
        .select('id')
        .single()

      if (memberError) {
        logger.error('Failed to add organizer as member', memberError)
      }

      // グループ作成のウェルカムメッセージを送信
      if (memberData?.id) {
        // 設定からメッセージ文言を取得
        const msgSettings = await getSystemMessageSettings(organizationId)
        await sendSystemMessage(group.id, memberData.id, 'group_created', {
          organizerName: user.email?.split('@')[0] || '主催者',
          title: msgSettings?.system_msg_group_created_title || '貸切リクエストグループを作成しました',
          body: msgSettings?.system_msg_group_created_body || '招待リンクを共有して、参加メンバーを招待してください。',
          note: msgSettings?.system_msg_group_created_note || '※ 全員を招待していなくても日程確定は可能ですが、当日は参加人数全員でお越しください。'
        })
      }

      if (params.candidateDates.length > 0) {
        const candidateDatesData = params.candidateDates.map((cd, index) => ({
          group_id: group.id,
          date: cd.date,
          time_slot: privateGroupTimeSlotToDb(cd.time_slot),
          start_time: cd.start_time,
          end_time: cd.end_time,
          order_num: cd.order_num || index + 1,
        }))

        const { error: datesError } = await supabase
          .from('private_group_candidate_dates')
          .insert(candidateDatesData)

        if (datesError) {
          logger.error('Failed to add candidate dates', datesError)
          throw new Error('候補日時の追加に失敗しました')
        }
      }

      return group as PrivateGroup

    } catch (err: any) {
      setError(err.message)
      throw err
    } finally {
      setLoading(false)
    }
  }

  const getGroupByInviteCode = async (inviteCode: string): Promise<PrivateGroup | null> => {
    setLoading(true)
    setError(null)

    try {
      // anon は private_group_members を直接取得できないため、
      // グループ本体と候補日程のみ取得し、メンバーは RPC 経由で取得
      const { data, error } = await supabase
        .from('private_groups')
        .select(`
          *,
          scenario_masters:scenario_master_id (id, title, key_visual_url, player_count_min, player_count_max),
          candidate_dates:private_group_candidate_dates (
            *,
            responses:private_group_date_responses (*)
          )
        `)
        .eq('invite_code', inviteCode)
        .single()

      if (error) {
        if (error.code === 'PGRST116') {
          return null
        }
        throw error
      }

      // メンバー情報を RPC 経由で取得（PII 保護）
      const { data: members } = await supabase.rpc('get_group_members_by_invite_code', {
        p_invite_code: inviteCode,
      })
      data.members = members || []

      await enrichGroupWithViewData(data)

      return data as PrivateGroup

    } catch (err: any) {
      setError(err.message)
      throw err
    } finally {
      setLoading(false)
    }
  }

  const getGroupById = async (groupId: string): Promise<PrivateGroup | null> => {
    setLoading(true)
    setError(null)

    try {
      const { data, error } = await supabase
        .from('private_groups')
        .select(`
          *,
          scenario_masters:scenario_master_id (id, title, key_visual_url, player_count_min, player_count_max),
          candidate_dates:private_group_candidate_dates (
            *,
            responses:private_group_date_responses (*)
          )
        `)
        .eq('id', groupId)
        .single()

      if (error) {
        if (error.code === 'PGRST116') {
          return null
        }
        throw error
      }

      // メンバー情報を RPC 経由で取得（認証済みユーザー用）
      const { data: members } = await supabase.rpc('get_group_members_by_group_id', {
        p_group_id: groupId,
      })
      data.members = members || []

      await enrichGroupWithViewData(data)

      return data as PrivateGroup

    } catch (err: any) {
      setError(err.message)
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

      const { data, error } = await supabase
        .from('private_groups')
        .select(`
          *,
          scenario_masters:scenario_master_id (id, title, key_visual_url, player_count_min, player_count_max),
          members:private_group_members (*)
        `)
        .eq('organizer_id', user.id)
        .order('created_at', { ascending: false })

      if (error) throw error

      return (data || []) as PrivateGroup[]

    } catch (err: any) {
      setError(err.message)
      throw err
    } finally {
      setLoading(false)
    }
  }

  const joinGroup = async (params: JoinGroupParams): Promise<PrivateGroupMember> => {
    setLoading(true)
    setError(null)

    try {
      // メンバー重複チェック（RPC 経由 - PII 保護）
      const { data: memberExists } = await supabase.rpc('check_member_exists', {
        p_group_id: params.groupId,
        p_user_id: params.userId || null,
        p_guest_email: params.guestEmail || null,
      })

      if (memberExists) {
        throw new Error('既にグループに参加しています')
      }

      const { data: groupData } = await supabase
        .from('private_groups')
        .select('organization_id, scenario_master_id')
        .eq('id', params.groupId)
        .single()

      if (groupData?.organization_id && groupData.scenario_master_id) {
        const bounds = await fetchScenarioPlayerBoundsForOrg(
          supabase,
          groupData.organization_id,
          groupData.scenario_master_id
        )
        if (bounds) {
          const cap = memberInvitationCap(bounds)
          // メンバー数チェック（RPC 経由 - PII 保護）
          const { data: currentMemberCount } = await supabase.rpc('get_group_member_count', {
            p_group_id: params.groupId,
          })

          if (currentMemberCount !== null && currentMemberCount >= cap) {
            throw new Error(`参加人数が上限（${cap}名）に達しています`)
          }
        }
      }

      // ログインユーザーの場合、ニックネームを取得（customersテーブルから）
      let guestName = params.guestName || null
      if (params.userId && !guestName) {
        try {
          const { data: customerInfo } = await supabase
            .from('customers')
            .select('nickname, name')
            .eq('user_id', params.userId)
            .maybeSingle()
          if (customerInfo?.nickname) {
            guestName = customerInfo.nickname
          } else if (customerInfo?.name) {
            guestName = customerInfo.name
          }
        } catch (err) {
          logger.warn('ユーザーニックネーム取得エラー:', err)
        }
      }

      const { data: member, error } = await supabase
        .from('private_group_members')
        .insert({
          group_id: params.groupId,
          user_id: params.userId || null,
          guest_name: guestName,
          guest_email: params.guestEmail || null,
          guest_phone: params.guestPhone || null,
          is_organizer: false,
          status: 'joined',
          joined_at: new Date().toISOString(),
        })
        .select()
        .single()

      if (error) {
        logger.error('Failed to join group', error)
        throw new Error('グループへの参加に失敗しました')
      }

      // メンバー参加のシステムメッセージを送信
      const memberName = params.guestName || params.guestEmail?.split('@')[0] || 'メンバー'
      await sendSystemMessage(params.groupId, member.id, 'member_joined', {
        memberName,
        memberId: member.id
      })

      return member as PrivateGroupMember

    } catch (err: any) {
      setError(err.message)
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
      const responseData = responses.map(r => ({
        group_id: groupId,
        member_id: memberId,
        candidate_date_id: r.candidateDateId,
        response: r.response,
      }))

      const { error } = await supabase
        .from('private_group_date_responses')
        .upsert(responseData, {
          onConflict: 'member_id,candidate_date_id',
        })

      if (error) {
        logger.error('Failed to submit date responses', error)
        throw new Error('日程回答の送信に失敗しました')
      }

    } catch (err: any) {
      setError(err.message)
      throw err
    } finally {
      setLoading(false)
    }
  }

  const updateGroupStatus = async (
    groupId: string,
    status: 'gathering' | 'booking_requested' | 'confirmed' | 'cancelled',
    reservationId?: string
  ): Promise<void> => {
    setLoading(true)
    setError(null)

    try {
      const updateData: Record<string, unknown> = { status }
      if (reservationId) {
        updateData.reservation_id = reservationId
      }

      const { error } = await supabase
        .from('private_groups')
        .update(updateData)
        .eq('id', groupId)

      if (error) {
        logger.error('Failed to update group status', error)
        throw new Error('グループステータスの更新に失敗しました')
      }

    } catch (err: any) {
      setError(err.message)
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
      const { error } = await supabase
        .from('private_group_members')
        .delete()
        .eq('id', memberId)

      if (error) throw error
    } catch (err: any) {
      setError(err.message)
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
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('ログインが必要です')

      const { error } = await supabase
        .from('private_group_members')
        .delete()
        .eq('group_id', groupId)
        .eq('user_id', user.id)

      if (error) throw error
    } catch (err: any) {
      setError(err.message)
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
    updateGroupStatus,
    getDateResponsesSummary,
    removeMember,
    leaveGroup,
  }
}
