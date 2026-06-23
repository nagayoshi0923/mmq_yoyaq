import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { logger } from '@/utils/logger'
import type { PrivateGroup } from '@/types'
import { enrichGroupWithViewData, enrichMembersWithNames } from './privateGroupHelpers'

export function usePrivateGroupData(groupId: string | null) {
  const [group, setGroup] = useState<PrivateGroup | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [linkedReservationStatus, setLinkedReservationStatus] = useState<string | null>(null)

  const fetchGroup = useCallback(async () => {
    if (!groupId) {
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
        .eq('id', groupId)
        .single()

      if (error) throw error

      await enrichGroupWithViewData(data)
      await enrichMembersWithNames(data)

      let resStatus: string | null = null
      if (data?.reservation_id) {
        const { data: resRow } = await supabase
          .from('reservations')
          .select('status')
          .eq('id', data.reservation_id)
          .maybeSingle()
        resStatus = resRow?.status ?? null
      }
      setLinkedReservationStatus(resStatus)

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

  // 店舗承認で status が confirmed に変わった直後に進捗を同期（開いたままの画面向け）
  useEffect(() => {
    const gid = group?.id
    if (!gid) return

    const channel = supabase
      .channel(`private_group_status:${gid}`)
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

  return { group, loading, error, refetch: fetchGroup, linkedReservationStatus }
}
