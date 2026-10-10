/**
 * チャットの写真の表示用 URL（署名付き・1 時間有効）。写真のある発言が増えたらその分だけ取り、切れる前に取り直す。
 * 小さい版（段階 4）があれば thumb=true でそちらを返す（無ければ元画像）。
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { logger } from '@/utils/logger'
import { fetchGroupPhotoUrls } from '@/lib/privateGroupChat'
import type { PrivateGroupMessage } from '@/types'
import { photoKey } from './chatModel'

/** 有効期限より少し前に取り直す */
const REFRESH_MARGIN_MS = 5 * 60 * 1000

export function useGroupPhotoUrls(groupId: string, memberId: string | null, messages: ReadonlyArray<PrivateGroupMessage>) {
  const [urls, setUrls] = useState<Record<string, { url: string; thumbUrl: string | null; expiresAt: number }>>({})
  const inflight = useRef(new Set<string>())
  const photoMessageIds = useMemo(
    () => messages.filter(m => !m.deleted_at && (m.photos?.length ?? 0) > 0).map(m => m.id),
    [messages],
  )

  const load = useCallback(async (ids: string[]) => {
    if (!memberId || ids.length === 0) return
    ids.forEach(id => inflight.current.add(id))
    try {
      for (let i = 0; i < ids.length; i += 200) {
        const chunk = ids.slice(i, i + 200)
        const { photos, expiresIn } = await fetchGroupPhotoUrls(groupId, memberId, chunk)
        const expiresAt = Date.now() + expiresIn * 1000 - REFRESH_MARGIN_MS
        setUrls(prev => {
          const next = { ...prev }
          for (const p of photos) next[photoKey(p.messageId, p.position)] = { url: p.url, thumbUrl: p.thumbUrl ?? null, expiresAt }
          return next
        })
      }
    } catch (err) {
      logger.error('写真を読み込めませんでした', err)
    } finally {
      ids.forEach(id => inflight.current.delete(id))
    }
  }, [groupId, memberId])

  useEffect(() => {
    const now = Date.now()
    const need = photoMessageIds.filter(id => {
      if (inflight.current.has(id)) return false
      const entry = urls[photoKey(id, 1)]
      return !entry || entry.expiresAt < now
    })
    if (need.length > 0) void load(need)
  }, [photoMessageIds, urls, load])

  // 開いたままでも期限前に取り直す
  useEffect(() => {
    const timer = window.setInterval(() => setUrls(prev => ({ ...prev })), 60 * 1000)
    return () => window.clearInterval(timer)
  }, [])

  const urlOf = useCallback((messageId: string, position: number, thumb = false) => {
    const entry = urls[photoKey(messageId, position)]
    if (!entry) return null
    return (thumb ? entry.thumbUrl : null) ?? entry.url
  }, [urls])
  return { urlOf }
}
