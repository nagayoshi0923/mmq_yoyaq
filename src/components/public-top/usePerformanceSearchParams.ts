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
}

/**
 * 絞り込みを URL（?when=&date=&stores=&avail=&beginner=&area=&view=）に持つ。初期表示は「今週・空席あり」。
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
      return next
    }, { replace: true })
  }, [setParams])

  return { state, update }
}
