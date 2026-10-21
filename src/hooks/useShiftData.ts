// スタッフシフトデータの管理

import { useMemo, useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { shiftApi } from '@/lib/shiftApi'
import { useAuth } from '@/contexts/AuthContext'
import { useOrganization } from '@/hooks/useOrganization'
import type { Staff } from '@/types'
import { logger } from '@/utils/logger'

// 利用者・組織ごとに分ける。同じ画面のまま別の利用者・組織に替わったとき、
// 替わる前の先読みや保存済みの値を使わない（Codex 独立レビュー #1212 P2）
export const shiftKeys = {
  month: (scope: string, year: number, month: number) => ['shifts', scope, year, month] as const,
}

function shiftStorageKey(scope: string, year: number, month: number) {
  return `shifts_${scope}_${year}_${month}`
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
  const { user } = useAuth()
  const { organizationId } = useOrganization()
  // 利用者と組織の両方が分かるまでは取得しない（分からないまま取った値を別の範囲で使わないため）
  const scope = user?.id && organizationId ? `${user.id}:${organizationId}` : null
  const storageKey = scope ? shiftStorageKey(scope, year, month) : null
  const storageTs = storageKey ? `${storageKey}_ts` : null

  // 利用者・組織を持たない旧形式のキー（shifts_YYYY_MM）は読まずに消す
  useEffect(() => {
    try {
      sessionStorage.removeItem(`shifts_${year}_${month}`)
      sessionStorage.removeItem(`shifts_${year}_${month}_ts`)
    } catch { /* 使えない環境 */ }
  }, [year, month])

  // 生シフトデータを React Query で取得・キャッシュ
  // staff の準備を待たずに並列でフェッチ開始
  const queryClient = useQueryClient()
  const { data: rawShifts = [], isFetching } = useQuery({
    queryKey: shiftKeys.month(scope ?? '', year, month),
    queryFn: () => shiftApi.getAllStaffShifts(year, month),
    enabled: scope !== null,
    staleTime: 5 * 60 * 1000,  // 5分間は再フェッチしない
    gcTime: 60 * 60 * 1000,
    // sessionStorage から初期値を復元 → 即表示（同じ利用者・組織の値だけ）
    initialData: () => {
      if (!storageKey) return undefined
      try {
        const cached = sessionStorage.getItem(storageKey)
        return cached ? JSON.parse(cached) : undefined
      } catch {
        return undefined
      }
    },
    initialDataUpdatedAt: () => {
      if (!storageTs) return 0
      try {
        const ts = sessionStorage.getItem(storageTs)
        return ts ? parseInt(ts) : 0
      } catch {
        return 0
      }
    },
  })

  // 表示中の月を取り終えたら前後 1 か月も先読みする（公演データと同じ）。
  // 月移動のあとにシフトだけ遅れて届くと、表の全セル（availableStaff）をもう一度描き直していた。
  useEffect(() => {
    if (isFetching || !scope) return
    for (const offset of [-1, 1]) {
      const d = new Date(year, month - 1 + offset, 1)
      const y = d.getFullYear()
      const m = d.getMonth() + 1
      void queryClient.prefetchQuery({
        queryKey: shiftKeys.month(scope, y, m),
        queryFn: () => shiftApi.getAllStaffShifts(y, m),
        staleTime: 5 * 60 * 1000,
      })
    }
  }, [isFetching, scope, year, month, queryClient])

  // フェッチ完了後に sessionStorage に保存
  useEffect(() => {
    if (!storageKey || !storageTs || !rawShifts || rawShifts.length === 0) return
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
