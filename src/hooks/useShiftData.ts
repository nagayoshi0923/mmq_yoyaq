// スタッフシフトデータの管理

import { useMemo, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { shiftApi } from '@/lib/shiftApi'
import type { Staff } from '@/types'
import { logger } from '@/utils/logger'

export const shiftKeys = {
  month: (year: number, month: number) => ['shifts', year, month] as const,
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useShiftData(
  currentDate: Date,
  staff: Staff[],
  _staffLoading: boolean // 後方互換のため引数は残すが使わない
) {
  const year = currentDate.getFullYear()
  const month = currentDate.getMonth() + 1
  const storageKey = `shifts_${year}_${month}`
  const storageTs = `${storageKey}_ts`

  // 生シフトデータを React Query で取得・キャッシュ
  // staff の準備を待たずに並列でフェッチ開始
  const { data: rawShifts = [] } = useQuery({
    queryKey: shiftKeys.month(year, month),
    queryFn: () => shiftApi.getAllStaffShifts(year, month),
    staleTime: 5 * 60 * 1000,  // 5分間は再フェッチしない
    gcTime: 60 * 60 * 1000,
    // sessionStorage から初期値を復元 → 即表示
    initialData: () => {
      try {
        const cached = sessionStorage.getItem(storageKey)
        return cached ? JSON.parse(cached) : undefined
      } catch {
        return undefined
      }
    },
    initialDataUpdatedAt: () => {
      try {
        const ts = sessionStorage.getItem(storageTs)
        return ts ? parseInt(ts) : 0
      } catch {
        return 0
      }
    },
  })

  // フェッチ完了後に sessionStorage に保存
  useEffect(() => {
    if (!rawShifts || rawShifts.length === 0) return
    try {
      sessionStorage.setItem(storageKey, JSON.stringify(rawShifts))
      sessionStorage.setItem(storageTs, String(Date.now()))
    } catch { /* 容量超過など */ }
  }, [rawShifts, storageKey, storageTs])

  // スタッフ ID マップ（高速検索用）
  const staffById = useMemo(() => {
    const m = new Map<string, Staff>()
    for (const s of staff) m.set(s.id, s)
    return m
  }, [staff])

  // 生シフト + スタッフデータ → 日付×スロットのマップ
  const shiftData = useMemo(() => {
    if (!rawShifts.length || !staffById.size) return {}

    const shiftMap: Record<string, Array<Staff & { timeSlot: string }>> = {}
    const unmatchedIds = new Set<string>()

    for (const shift of rawShifts) {
      const fullStaff = staffById.get(shift.staff_id)
      if (!fullStaff) {
        unmatchedIds.add(shift.staff_id)
        continue
      }

      const date = shift.date
      if (shift.morning || shift.all_day) {
        const key = `${date}-morning`
        if (!shiftMap[key]) shiftMap[key] = []
        shiftMap[key].push({ ...fullStaff, timeSlot: 'morning' })
      }
      if (shift.afternoon || shift.all_day) {
        const key = `${date}-afternoon`
        if (!shiftMap[key]) shiftMap[key] = []
        shiftMap[key].push({ ...fullStaff, timeSlot: 'afternoon' })
      }
      if (shift.evening || shift.all_day) {
        const key = `${date}-evening`
        if (!shiftMap[key]) shiftMap[key] = []
        shiftMap[key].push({ ...fullStaff, timeSlot: 'evening' })
      }
    }

    if (unmatchedIds.size > 0) {
      logger.log(`⚠️ スタッフテーブルに存在しないstaff_id: ${unmatchedIds.size}件`)
    }

    return shiftMap
  }, [rawShifts, staffById])

  return { shiftData }
}
