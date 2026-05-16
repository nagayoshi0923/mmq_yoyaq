import { useState, useEffect, useCallback, useRef } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { supabase } from '@/lib/supabase'
import { logger } from '@/utils/logger'

export interface TablePreferences {
  columnOrder: string[]
  columnVisibility: Record<string, boolean>
}

/**
 * テーブルのカラム表示設定（順序・表示/非表示）をDBに保存・取得するフック。
 * 未ログイン時は保存しない（デフォルト値を返す）。
 * 保存はデバウンス（800ms）。
 */
export function useTablePreferences(
  tableKey: string | undefined,
  defaultColumnKeys: string[]
): [TablePreferences, (prefs: TablePreferences) => void, boolean] {
  const { user } = useAuth()
  const defaultKeysRef = useRef(defaultColumnKeys)

  const buildDefault = useCallback((): TablePreferences => ({
    columnOrder: defaultKeysRef.current,
    columnVisibility: {},
  }), [])

  const [prefs, setPrefs] = useState<TablePreferences>(buildDefault)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!tableKey || !user?.id) {
      setPrefs(buildDefault())
      return
    }

    setLoading(true)
    supabase
      .from('user_table_preferences')
      .select('column_order, column_visibility')
      .eq('user_id', user.id)
      .eq('table_key', tableKey)
      .maybeSingle()
      .then(({ data, error }) => {
        setLoading(false)
        if (error) {
          logger.error('useTablePreferences: 読み込みエラー', error)
          return
        }
        if (!data) return

        const savedOrder = (data.column_order as string[]) ?? []
        const currentKeys = new Set(defaultKeysRef.current)
        const validOrder = savedOrder.filter(k => currentKeys.has(k))
        const newKeys = defaultKeysRef.current.filter(k => !savedOrder.includes(k))

        setPrefs({
          columnOrder: [...validOrder, ...newKeys],
          columnVisibility: (data.column_visibility as Record<string, boolean>) ?? {},
        })
      })
  }, [tableKey, user?.id, buildDefault])

  const saveTimerRef = useRef<ReturnType<typeof setTimeout>>()

  const setAndSave = useCallback((newPrefs: TablePreferences) => {
    setPrefs(newPrefs)

    if (!tableKey || !user?.id) return

    clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(() => {
      supabase
        .from('user_table_preferences')
        .upsert(
          {
            user_id: user.id,
            table_key: tableKey,
            column_order: newPrefs.columnOrder,
            column_visibility: newPrefs.columnVisibility,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'user_id,table_key' }
        )
        .then(({ error }) => {
          if (error) logger.error('useTablePreferences: 保存エラー', error)
        })
    }, 800)
  }, [tableKey, user?.id])

  return [prefs, setAndSave, loading]
}
