import { useCallback, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { DEFAULT_DATE_PRESET, parseDatePreset, type DatePreset } from '@/lib/publicPerformanceSearch'

export type SearchView = 'cards' | 'calendar' | 'list'

export interface PerformanceSearchState {
  preset: DatePreset
  date: string | null
  onlyAvailable: boolean
  beginnerOnly: boolean
  storeIds: string[]
  area: string | null
  /** 店舗トップの見方（一覧＝カード／カレンダー／リスト＝時間割） */
  view: SearchView
  /** 既定の「今日から 30 日」を何回分出すか（「もっと見る」で 1 ずつ増える。?more=）。作品ページから戻ったときも同じ期間で開く */
  windows: number
}

/** ?more= の上限（1 回 30 日 × 24 = 約 2 年） */
const MAX_WINDOWS = 24

/**
 * 絞り込みを URL（?when=&date=&stores=&avail=&beginner=&area=&view=&more=）に持つ。初期表示は「今日から 30 日・空席あり」
 * （2026-10-25 社長指示で「今月」をやめた。「もっと見る」で伸ばした期間も ?more= に持ち、戻ったときに同じ期間で開く）。
 * 作品ページから戻ったときに同じ条件で開き直せ、旧 /calendar からも ?when=date で渡せる。
 * 人数（?people=）は 2026-10-12 に絞り込みごと外した。古いリンクに残っていても無視し、次の操作で URL から消す。
 */
export function usePerformanceSearchParams() {
  const [params, setParams] = useSearchParams()

  const state = useMemo<PerformanceSearchState>(() => {
    const date = params.get('date')
    const validDate = date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : null
    const preset: DatePreset = parseDatePreset(params.get('when')) ?? (validDate ? 'date' : DEFAULT_DATE_PRESET)
    const stores = (params.get('stores') ?? '').split(',').map((s) => s.trim()).filter(Boolean)
    return {
      preset,
      date: validDate,
      onlyAvailable: params.get('avail') !== '0',
      beginnerOnly: params.get('beginner') === '1',
      storeIds: stores,
      area: params.get('area') || null,
      view: params.get('view') === 'calendar' ? 'calendar' : params.get('view') === 'list' ? 'list' : 'cards',
      windows: Math.min(MAX_WINDOWS, Math.max(1, Number.parseInt(params.get('more') ?? '1', 10) || 1)),
    }
  }, [params])

  const update = useCallback((patch: Partial<PerformanceSearchState>) => {
    setParams((prev) => {
      const next = new URLSearchParams(prev)
      const set = (key: string, value: string | null) => { if (value === null || value === '') next.delete(key); else next.set(key, value) }
      next.delete('people')
      if (patch.preset !== undefined) set('when', patch.preset === DEFAULT_DATE_PRESET ? null : patch.preset)
      if (patch.date !== undefined) set('date', patch.date)
      if (patch.onlyAvailable !== undefined) set('avail', patch.onlyAvailable ? null : '0')
      if (patch.beginnerOnly !== undefined) set('beginner', patch.beginnerOnly ? '1' : null)
      if (patch.storeIds !== undefined) set('stores', patch.storeIds.join(','))
      if (patch.area !== undefined) set('area', patch.area)
      if (patch.view !== undefined) set('view', patch.view === 'cards' ? null : patch.view)
      if (patch.preset !== undefined && patch.preset !== 'date') next.delete('date')
      // 日付のチップ・見方を変えたら「もっと見る」の期間は最初に戻す（店舗・空席などの絞り込みは保つ）
      if (patch.windows !== undefined) set('more', patch.windows > 1 ? String(Math.min(MAX_WINDOWS, patch.windows)) : null)
      else if (patch.preset !== undefined || patch.view !== undefined) next.delete('more')
      return next
    }, { replace: true })
  }, [setParams])

  return { state, update }
}
