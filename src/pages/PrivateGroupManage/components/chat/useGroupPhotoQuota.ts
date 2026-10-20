/**
 * グループ全体の写真の残り枚数（2026-10-20 社長決定: グループ全体で 10 枚まで。組織で変更可）。
 * 写真のある発言が増えた・消えたら取り直す（他の人が送った分も反映する）。読めなければ null（送るときに DB が確かめる）。
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { logger } from '@/utils/logger'
import { fetchGroupPhotoQuota, type GroupPhotoQuota } from '@/lib/privateGroupChat'
import type { PrivateGroupMessage } from '@/types'

export function useGroupPhotoQuota(groupId: string, memberId: string | null, messages: ReadonlyArray<PrivateGroupMessage>, enabled = true) {
  const [quota, setQuota] = useState<GroupPhotoQuota | null>(null)
  const request = useRef(0)
  const photoCount = useMemo(
    () => messages.reduce((sum, m) => sum + (m.deleted_at ? 0 : m.photos?.length ?? 0), 0),
    [messages],
  )
  const refresh = useCallback(async () => {
    if (!memberId || !enabled) return
    const id = ++request.current
    try {
      const next = await fetchGroupPhotoQuota(groupId, memberId)
      if (id === request.current) setQuota(next)
    } catch (err) {
      logger.error('写真の残り枚数を読み込めませんでした', err)
    }
  }, [groupId, memberId, enabled])
  useEffect(() => { void refresh() }, [refresh, photoCount])
  return { quota, refresh }
}
