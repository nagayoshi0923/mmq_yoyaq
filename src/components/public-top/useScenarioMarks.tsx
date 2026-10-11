import { useCallback, useState } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { useFavorites } from '@/hooks/useFavorites'
import { usePlayedScenarios } from '@/hooks/usePlayedScenarios'
import { PlayedRegistrationDialog } from '@/components/modals/PlayedRegistrationDialog'
import { showToast } from '@/utils/toast'
import { logger } from '@/utils/logger'

export interface ScenarioMarks {
  isFavorite: (scenarioId: string) => boolean
  isPlayed: (scenarioId: string) => boolean
  toggleFavorite: (scenarioId: string) => void
  togglePlayed: (scenarioId: string, title: string) => void
}

/**
 * 「遊びたい」「体験済み」（ログイン中だけ）。作品から探すのカードに小さく出す。
 * 体験済みにするときは従来どおり体験日の登録ダイアログを出す。
 */
export function useScenarioMarks(): { marks: ScenarioMarks | null; dialog: React.ReactNode } {
  const { user } = useAuth()
  const { isFavorite, toggleFavorite } = useFavorites()
  const { isPlayed, customerId, customerIds, markAsPlayed, unmarkAsPlayed } = usePlayedScenarios()
  const [target, setTarget] = useState<{ id: string; title: string } | null>(null)
  const [busy, setBusy] = useState<Set<string>>(new Set())

  const togglePlayed = useCallback((id: string, title: string) => {
    if (!isPlayed(id)) { setTarget({ id, title }); return }
    if (busy.has(id)) return
    setBusy((prev) => new Set(prev).add(id))
    unmarkAsPlayed(id)
      .then(() => showToast.success('未体験に戻しました'))
      .catch((error) => { logger.error('未体験変更エラー:', error); showToast.error('未体験への変更に失敗しました') })
      .finally(() => setBusy((prev) => { const next = new Set(prev); next.delete(id); return next }))
  }, [isPlayed, busy, unmarkAsPlayed])

  const dialog = target ? (
    <PlayedRegistrationDialog
      open
      onOpenChange={(open) => { if (!open) setTarget(null) }}
      scenarioTitle={target.title}
      scenarioMasterId={target.id}
      customerId={customerId}
      customerIds={customerIds}
      onRegistered={() => markAsPlayed(target.id)}
    />
  ) : null

  if (!user) return { marks: null, dialog: null }
  return { marks: { isFavorite, isPlayed, toggleFavorite, togglePlayed }, dialog }
}
