/**
 * 公演後の思い出（グループページ刷新 段階 4）の読み書き。
 * - 公演の記録・自分の感想（RPC private_group_after_action）
 * - 写真の一覧（このグループのチャットの写真すべて。署名付き URL、小さい版があればそれ）
 * - マイページの「アルバム」に体験済みとして入っているか（会員だけ。主催者は予約で自動、メンバーは手動の履歴で登録）
 * - 写真を共有する（チャットの写真送信と同じ仕組み。送った写真はチャットにも流れる）
 */
import { useCallback, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { fetchGroupPhotoUrls, readGroupAfter, saveGroupFeedback, sendGroupPhotos } from '@/lib/privateGroupChat'
import { customerLookupReadApi } from '@/lib/api/customerHookReadApi'
import { customerPlayHistory } from '@/lib/customerPlayHistory'
import { fetchPlayedReservations } from '@/lib/playedStatus'
import { getErrorMessage } from '@/lib/errorFields'
import { resizePhoto } from '@/pages/PrivateGroupManage/components/chat/photoResize'

const MAX_PHOTOS = 10

export const memoriesKeys = {
  after: (groupId: string, memberId: string) => ['group-memories', 'after', groupId, memberId] as const,
  photos: (groupId: string, memberId: string) => ['group-memories', 'photos', groupId, memberId] as const,
  album: (groupId: string, userId: string) => ['group-memories', 'album', groupId, userId] as const,
}

export type AlbumState = 'registered' | 'not_registered' | 'hidden'

export function useGroupMemories(args: {
  groupId: string
  memberId: string
  enabled: boolean
  userId: string | null
  scenarioMasterId: string | null
  scenarioTitle: string
  reservationId: string | null
  onPhotosSent: () => unknown
}) {
  const { groupId, memberId, enabled, userId, scenarioMasterId, scenarioTitle, reservationId, onPhotosSent } = args
  const queryClient = useQueryClient()

  const after = useQuery({
    queryKey: memoriesKeys.after(groupId, memberId),
    enabled,
    queryFn: () => readGroupAfter(groupId, memberId),
  })

  const photos = useQuery({
    queryKey: memoriesKeys.photos(groupId, memberId),
    enabled,
    // 署名付き URL は 1 時間で切れるので 50 分で取り直す
    staleTime: 50 * 60 * 1000,
    refetchInterval: 50 * 60 * 1000,
    queryFn: async () => (await fetchGroupPhotoUrls(groupId, memberId)).photos,
  })

  // アルバム（体験済み）に入っているか。予約（主催者）か、同じ作品の手動の履歴があれば登録済み。「未体験に戻した」は登録なしとみなす
  const album = useQuery({
    queryKey: memoriesKeys.album(groupId, userId ?? ''),
    enabled: enabled && Boolean(userId && scenarioMasterId),
    queryFn: async () => {
      const { data, error } = await customerLookupReadApi.listIdsByUserId(userId!)
      if (error) throw error
      const customerIds = (data ?? []).map(row => row.id)
      if (customerIds.length === 0) return { state: 'hidden' as AlbumState, customerId: null, overridden: false }
      const [snapshots, played] = await Promise.all([
        Promise.all(customerIds.map(id => customerPlayHistory.snapshot(id))),
        Promise.all(customerIds.map(id => fetchPlayedReservations(id, scenarioMasterId!))),
      ])
      const overridden = snapshots.some(s => s.overrides.some(o => o.scenario_master_id === scenarioMasterId))
      const byReservation = played.flat().some(r => r.id === reservationId || r.scenario_master_id === scenarioMasterId)
      const byManual = snapshots.some(s => s.manual.some(m => m.scenario_master_id === scenarioMasterId))
      return { state: (!overridden && (byReservation || byManual) ? 'registered' : 'not_registered') as AlbumState, customerId: customerIds[0], overridden }
    },
  })

  const [registering, setRegistering] = useState(false)
  const registerAlbum = useCallback(async (performance: { date: string; store_name: string | null }) => {
    const target = album.data
    if (!target?.customerId || !scenarioMasterId) return
    setRegistering(true)
    try {
      if (target.overridden) await customerPlayHistory.removeOverride(target.customerId, scenarioMasterId)
      await customerPlayHistory.add(target.customerId, {
        scenario_title: scenarioTitle,
        scenario_master_id: scenarioMasterId,
        played_at: performance.date,
        venue: performance.store_name,
        notes: '貸切グループ',
      })
      toast.success('マイページの「アルバム」に登録しました')
      await queryClient.invalidateQueries({ queryKey: memoriesKeys.album(groupId, userId ?? '') })
    } catch (err) {
      toast.error(getErrorMessage(err) || 'アルバムに登録できませんでした')
    } finally {
      setRegistering(false)
    }
  }, [album.data, scenarioMasterId, scenarioTitle, queryClient, groupId, userId])

  const [sending, setSending] = useState(false)
  const sharePhotos = useCallback(async (fileList: FileList | null) => {
    const files = Array.from(fileList ?? []).filter(f => f.type.startsWith('image/') || /\.(heic|heif)$/i.test(f.name))
    if (files.length === 0) return
    if (files.length > MAX_PHOTOS) toast.info(`写真は 1 回 ${MAX_PHOTOS} 枚までです。先頭の ${MAX_PHOTOS} 枚を送ります`)
    setSending(true)
    try {
      const resized = []
      for (const file of files.slice(0, MAX_PHOTOS)) resized.push(await resizePhoto(file))
      await sendGroupPhotos({ groupId, memberId, photos: resized })
      toast.success(`写真を ${resized.length} 枚共有しました。チャットにも流れています`)
      await Promise.all([photos.refetch(), onPhotosSent()])
    } catch (err) {
      toast.error(`写真を共有できませんでした${getErrorMessage(err) ? `（${getErrorMessage(err)}）` : ''}`)
    } finally {
      setSending(false)
    }
  }, [groupId, memberId, photos, onPhotosSent])

  const saveFeedback = useCallback(async (rating: number, comment: string) => {
    await saveGroupFeedback(groupId, memberId, rating, comment)
    await queryClient.invalidateQueries({ queryKey: memoriesKeys.after(groupId, memberId) })
  }, [groupId, memberId, queryClient])

  return {
    after: after.data ?? null,
    afterLoading: after.isLoading,
    photos: photos.data ?? null,
    photosFailed: photos.isError,
    refetchPhotos: photos.refetch,
    albumState: (userId ? album.data?.state : 'hidden') ?? null,
    registering,
    registerAlbum,
    sending,
    sharePhotos,
    saveFeedback,
  }
}
