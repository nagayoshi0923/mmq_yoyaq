import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { useLocation } from 'react-router-dom'
import {
  useScrollRestoration,
  scrollRestorationPageKeyFromLocation,
} from '@/hooks/useScrollRestoration'

type ReportSlice = { isLoading: boolean; isFetching: boolean }

type RouteScrollContextValue = {
  report: (id: string, partial: Partial<ReportSlice>) => void
  unregisterReport: (id: string) => void
  clearScrollPosition: () => void
}

const RouteScrollContext = createContext<RouteScrollContextValue | null>(null)

/**
 * アプリ全体で `pathname`+`search` ごとにスクロールを保存・復元する。
 * データ待ちがある画面は `useReportRouteScrollRestoration` で isLoading / isFetching を渡す。
 */
export function RouteScrollRestorationProvider({ children }: { children: ReactNode }) {
  const { pathname, search } = useLocation()
  const [reports, setReports] = useState<Record<string, ReportSlice>>({})

  const report = useCallback((id: string, partial: Partial<ReportSlice>) => {
    setReports((prev) => {
      const prevSlice = prev[id] ?? { isLoading: false, isFetching: false }
      return {
        ...prev,
        [id]: {
          isLoading: partial.isLoading ?? prevSlice.isLoading,
          isFetching: partial.isFetching ?? prevSlice.isFetching,
        },
      }
    })
  }, [])

  const unregisterReport = useCallback((id: string) => {
    setReports((prev) => {
      const { [id]: _removed, ...rest } = prev
      return rest
    })
  }, [])

  const merged = useMemo(() => {
    let isLoading = false
    let isFetching = false
    for (const r of Object.values(reports)) {
      if (r.isLoading) isLoading = true
      if (r.isFetching) isFetching = true
    }
    return { isLoading, isFetching }
  }, [reports])

  const pageKey = scrollRestorationPageKeyFromLocation(pathname, search)

  const { clearScrollPosition } = useScrollRestoration({
    pageKey,
    isLoading: merged.isLoading,
    isFetching: merged.isFetching,
  })

  const value = useMemo(
    () => ({
      report,
      unregisterReport,
      clearScrollPosition,
    }),
    [report, unregisterReport, clearScrollPosition]
  )

  return <RouteScrollContext.Provider value={value}>{children}</RouteScrollContext.Provider>
}

export function useReportRouteScrollRestoration(
  reportId: string,
  opts: { isLoading?: boolean; isFetching?: boolean } = {}
) {
  const ctx = useContext(RouteScrollContext)
  const isLoading = opts.isLoading ?? false
  const isFetching = opts.isFetching ?? false

  useEffect(() => {
    if (!ctx) return
    ctx.report(reportId, { isLoading, isFetching })
    return () => ctx.unregisterReport(reportId)
  }, [ctx, reportId, isLoading, isFetching])
}

/** スケジュールの月変更など、現在ルートの保存スクロールだけ消す用途 */
export function useRouteScrollControls() {
  const ctx = useContext(RouteScrollContext)
  return {
    clearScrollPosition: ctx?.clearScrollPosition ?? (() => {}),
  }
}
