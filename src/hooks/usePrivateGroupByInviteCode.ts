import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { logger } from '@/utils/logger'
import type { PrivateGroup } from '@/types'
import { enrichGroupWithViewData, enrichMembersWithNames } from './privateGroupHelpers'

export function usePrivateGroupByInviteCode(inviteCode: string | null): {
  group: PrivateGroup | null
  loading: boolean
  error: string | null
  refetch: () => Promise<void>
  linkedReservationStatus: string | null
  confirmedByName: string | null
} {
  const [group, setGroup] = useState<PrivateGroup | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [linkedReservationStatus, setLinkedReservationStatus] = useState<string | null>(null)
  const [confirmedByName, setConfirmedByName] = useState<string | null>(null)

  const fetchGroup = useCallback(async () => {
    if (!inviteCode) {
      setLoading(false)
      setLinkedReservationStatus(null)
      return
    }

    setLoading(true)
    setError(null)

    try {
      const { data, error } = await supabase
        .from('private_groups')
        .select(`
          *,
          scenario_masters:scenario_master_id (id, title, key_visual_url, player_count_min, player_count_max),
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
          setGroup(null)
          setLinkedReservationStatus(null)
          return
        }
        throw error
      }

      await enrichGroupWithViewData(data)
      await enrichMembersWithNames(data, inviteCode)

      let resStatus: string | null = null
      let confirmedBy: string | null = null
      if (data?.reservation_id) {
        // 招待ページは anon (ゲスト) からもアクセスされるため、reservations / staff の RLS で
        // permission denied になっても招待表示自体は壊さない。
        try {
          const { data: resRow } = await supabase
            .from('reservations')
            .select('status, confirmed_by')
            .eq('id', data.reservation_id)
            .maybeSingle()
          resStatus = resRow?.status ?? null

          if (resRow?.confirmed_by) {
            try {
              const { data: staffRow } = await supabase
                .from('staff')
                .select('name')
                .eq('id', resRow.confirmed_by)
                .maybeSingle()
              confirmedBy = staffRow?.name ?? null
            } catch {
              // staff RLS は anon を弾くので、確認者名はゲストでは表示できない
              confirmedBy = null
            }
          }
        } catch {
          resStatus = null
          confirmedBy = null
        }
      }
      setLinkedReservationStatus(resStatus)
      setConfirmedByName(confirmedBy)

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

  useEffect(() => {
    const gid = group?.id
    if (!gid) return

    const channel = supabase
      .channel(`private_group_invite_status:${gid}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'private_groups',
          filter: `id=eq.${gid}`,
        },
        () => {
          void fetchGroup()
        }
      )
      .subscribe()

    return () => {
      void supabase.removeChannel(channel)
    }
  }, [group?.id, fetchGroup])

  return { group, loading, error, refetch: fetchGroup, linkedReservationStatus, confirmedByName }
}
