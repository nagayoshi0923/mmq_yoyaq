import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { getCurrentOrganizationId, QUEENS_WALTZ_ORG_ID } from '@/lib/organization'
import { logger } from '@/utils/logger'
import type {
  PrivateGroup,
  PrivateGroupMember,
  PrivateGroupCandidateDate,
  PrivateGroupDateResponse,
  DateResponse,
} from '@/types'

interface CandidateDateInput {
  date: string
  time_slot: '午前' | '午後' | '夜間'
  start_time: string
  end_time: string
  order_num: number
}

interface CreateGroupParams {
  scenarioId: string
  name?: string
  targetParticipantCount?: number
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

      const organizationId = await getCurrentOrganizationId() || QUEENS_WALTZ_ORG_ID

      let inviteCode = await generateInviteCode()
      let attempts = 0
      const maxAttempts = 5

      while (attempts < maxAttempts) {
        const { data: existing } = await supabase
          .from('private_groups')
          .select('id')
          .eq('invite_code', inviteCode)
          .single()

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
          scenario_id: params.scenarioId,
          organizer_id: user.id,
          name: params.name || null,
          invite_code: inviteCode,
          status: 'gathering',
          target_participant_count: params.targetParticipantCount || null,
          preferred_store_ids: params.preferredStoreIds || [],
          notes: params.notes || null,
        })
        .select()
        .single()

      if (groupError) {
        logger.error('Failed to create group', groupError)
        throw new Error('グループの作成に失敗しました')
      }

      const { error: memberError } = await supabase
        .from('private_group_members')
        .insert({
          group_id: group.id,
          user_id: user.id,
          is_organizer: true,
          status: 'joined',
          joined_at: new Date().toISOString(),
        })

      if (memberError) {
        logger.error('Failed to add organizer as member', memberError)
      }

      if (params.candidateDates.length > 0) {
        const candidateDatesData = params.candidateDates.map((cd, index) => ({
          group_id: group.id,
          date: cd.date,
          time_slot: cd.time_slot,
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
      const { data, error } = await supabase
        .from('private_groups')
        .select(`
          *,
          scenario_masters:scenario_id (id, title, key_visual_url),
          members:private_group_members (*),
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
          scenario_masters:scenario_id (id, title, key_visual_url),
          members:private_group_members (*),
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
          scenario_masters:scenario_id (id, title, key_visual_url),
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
      const { data: existingMember } = await supabase
        .from('private_group_members')
        .select('id')
        .eq('group_id', params.groupId)
        .eq(params.userId ? 'user_id' : 'guest_email', params.userId || params.guestEmail)
        .single()

      if (existingMember) {
        throw new Error('既にグループに参加しています')
      }

      const { data: member, error } = await supabase
        .from('private_group_members')
        .insert({
          group_id: params.groupId,
          user_id: params.userId || null,
          guest_name: params.guestName || null,
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
  }
}

export function usePrivateGroupData(groupId: string | null) {
  const [group, setGroup] = useState<PrivateGroup | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchGroup = useCallback(async () => {
    if (!groupId) {
      setLoading(false)
      return
    }

    setLoading(true)
    setError(null)

    try {
      const { data, error } = await supabase
        .from('private_groups')
        .select(`
          *,
          scenario_masters:scenario_id (id, title, key_visual_url),
          members:private_group_members (
            *,
            date_responses:private_group_date_responses (*)
          ),
          candidate_dates:private_group_candidate_dates (
            *,
            responses:private_group_date_responses (*)
          )
        `)
        .eq('id', groupId)
        .single()

      if (error) throw error
      setGroup(data as PrivateGroup)

    } catch (err: any) {
      setError(err.message)
      logger.error('Failed to fetch group', err)
    } finally {
      setLoading(false)
    }
  }, [groupId])

  useEffect(() => {
    fetchGroup()
  }, [fetchGroup])

  return { group, loading, error, refetch: fetchGroup }
}

export function usePrivateGroupByInviteCode(inviteCode: string | null) {
  const [group, setGroup] = useState<PrivateGroup | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchGroup = useCallback(async () => {
    if (!inviteCode) {
      setLoading(false)
      return
    }

    setLoading(true)
    setError(null)

    try {
      const { data, error } = await supabase
        .from('private_groups')
        .select(`
          *,
          scenario_masters:scenario_id (id, title, key_visual_url),
          members:private_group_members (
            *,
            date_responses:private_group_date_responses (*)
          ),
          candidate_dates:private_group_candidate_dates (
            *,
            responses:private_group_date_responses (*)
          )
        `)
        .eq('invite_code', inviteCode)
        .single()

      if (error) {
        if (error.code === 'PGRST116') {
          setError('招待コードが無効です')
          return
        }
        throw error
      }
      setGroup(data as PrivateGroup)

    } catch (err: any) {
      setError(err.message)
      logger.error('Failed to fetch group by invite code', err)
    } finally {
      setLoading(false)
    }
  }, [inviteCode])

  useEffect(() => {
    fetchGroup()
  }, [fetchGroup])

  return { group, loading, error, refetch: fetchGroup }
}
