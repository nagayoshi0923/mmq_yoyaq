import { useEffect, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { customerApi, type CustomerWithStats } from '@/lib/api/customerApi'
import { invalidateEverywhere } from '@/lib/queryInvalidation'
import type { Customer } from '@/types'
import { logger } from '@/utils/logger'

export interface CustomerCouponStats {
  total_coupons: number
  used_coupons: number
  remaining_coupons: number
}

interface CustomerDataResult {
  customers: Customer[]
  couponStats: Record<string, CustomerCouponStats>
  totalCount: number
}

export const customerKeys = {
  all: ['customers'] as const,
  list: (search: string, page: number, pageSize: number) =>
    ['customers', 'list', search, page, pageSize] as const,
}

const PAGE_SIZE = 50

function toCustomerDataResult(rows: CustomerWithStats[]): Omit<CustomerDataResult, 'totalCount'> {
  const couponStats: Record<string, CustomerCouponStats> = {}
  const customers = rows.map((row) => {
    couponStats[row.id] = {
      total_coupons: row.total_coupons ?? 0,
      used_coupons: row.used_coupons ?? 0,
      remaining_coupons: row.remaining_coupons ?? 0,
    }
    return {
      ...row,
      total_spent: row.total_paid ?? 0,
      reservation_count: row.reservation_count ?? 0,
      last_visit: row.last_visit ?? null,
      visit_count: row.visit_count ?? 0,
    } as Customer
  })
  return { customers, couponStats }
}

async function fetchCustomersWithStats(search: string, page: number, pageSize: number): Promise<CustomerDataResult> {
  logger.log('顧客データ取得開始', { search, page, pageSize })
  const { customers: rows, totalCount } = await customerApi.listWithStats({
    search: search || undefined,
    page,
    pageSize,
  })
  const { customers, couponStats } = toCustomerDataResult(rows)
  logger.log('顧客データ取得完了:', customers.length, '/', totalCount)
  return { customers, couponStats, totalCount }
}

/**
 * 顧客データの取得（サーバ集計＋ページング）を管理するフック。
 *
 * @param searchTerm 検索語（呼び出し側が管理する生値。例: URL クエリ由来）。
 *                    フック内部で 300ms debounce してから RPC に渡す。
 */
export function useCustomerData(searchTerm = '') {
  const queryClient = useQueryClient()
  const [page, setPage] = useState(1)
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState(searchTerm)

  // 検索語は 300ms debounce してから fetch に反映
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearchTerm(searchTerm.trim()), 300)
    return () => clearTimeout(t)
  }, [searchTerm])

  // 検索語が変わったら 1 ページ目に戻す
  useEffect(() => {
    setPage(1)
  }, [debouncedSearchTerm])

  const queryKey = customerKeys.list(debouncedSearchTerm, page, PAGE_SIZE)

  const { data, isLoading } = useQuery<CustomerDataResult>({
    queryKey,
    queryFn: () => fetchCustomersWithStats(debouncedSearchTerm, page, PAGE_SIZE),
    staleTime: 3 * 60 * 1000, // 3分間キャッシュ
    placeholderData: (previousData) => previousData,
  })

  const refreshCustomers = () =>
    invalidateEverywhere(queryClient, customerKeys.all)

  return {
    customers: data?.customers ?? [],
    loading: isLoading,
    couponStats: data?.couponStats ?? {},
    refreshCustomers,
    totalCount: data?.totalCount ?? 0,
    page,
    setPage,
    pageSize: PAGE_SIZE,
  }
}
