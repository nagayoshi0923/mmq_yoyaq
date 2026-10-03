import type { CustomerListOptions, CustomerSortKey } from '@/types/customerList'
import { useEffect, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { customerApi, type CustomerWithStats } from '@/lib/api/customerApi'
import { invalidateEverywhere } from '@/lib/queryInvalidation'
import type { Customer } from '@/types'
import { logger } from '@/utils/logger'
import { useAuth } from '@/contexts/AuthContext'
import { getCurrentOrganizationId } from '@/lib/organization'

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
  list: (organizationId: string | null, search: string, page: number, pageSize: number, options: CustomerListOptions = {}) =>
    ['customers', 'list', organizationId, search, page, pageSize, options] as const,
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
      total_spent: row.reservation_amount,
      reservation_count: row.reservation_count ?? 0,
      last_visit: row.last_visit ?? null,
      visit_count: row.visit_count ?? 0,
    } as Customer
  })
  return { customers, couponStats }
}

async function fetchCustomersWithStats(search: string, page: number, pageSize: number, options: CustomerListOptions): Promise<CustomerDataResult> {
  logger.log('顧客データ取得開始', { search, page, pageSize })
  const { customers: rows, totalCount } = await customerApi.listWithStats({
    search: search || undefined,
    page,
    pageSize,
    ...options,
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
  const { user, loading: authLoading } = useAuth()
  const organizationQuery = useQuery({
    queryKey: ['customer-organization', user?.id],
    queryFn: getCurrentOrganizationId,
    enabled: !!user && !authLoading,
    retry: false,
  })
  const organizationId = user ? organizationQuery.data ?? null : null
  const organizationLoading = authLoading || organizationQuery.isLoading
  const organizationError = organizationQuery.error
  const refetchOrganization = organizationQuery.refetch
  const [page, setPage] = useState(1)
  const [options, setOptionsState] = useState<CustomerListOptions>({ sortBy: 'created_at', sortDir: 'desc' })
  const setOptions = (next: CustomerListOptions) => { setPage(1); setOptionsState(next) }
  const toggleSort = (sortBy: CustomerSortKey) => setOptions({ ...options, sortBy, sortDir: options.sortBy === sortBy && options.sortDir === 'asc' ? 'desc' : 'asc' })
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState(searchTerm)

  // 検索語は 300ms debounce してから fetch に反映
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearchTerm(searchTerm.trim()), 300)
    return () => clearTimeout(t)
  }, [searchTerm])

  // 検索語が変わったら 1 ページ目に戻す
  useEffect(() => {
    setPage(1)
  }, [debouncedSearchTerm, organizationId])

  const queryKey = customerKeys.list(organizationId, debouncedSearchTerm, page, PAGE_SIZE, options)

  const { data, isLoading, error } = useQuery<CustomerDataResult>({
    queryKey,
    enabled: !!organizationId,
    queryFn: () => fetchCustomersWithStats(debouncedSearchTerm, page, PAGE_SIZE, options),
    staleTime: 3 * 60 * 1000, // 3分間キャッシュ
    placeholderData: (previousData, previousQuery) =>
      organizationId && previousQuery?.queryKey[2] === organizationId
        && previousQuery?.queryKey[3] === debouncedSearchTerm
        && JSON.stringify(previousQuery?.queryKey[6]) === JSON.stringify(options) ? previousData : undefined,
  })

  const refreshCustomers = async () => {
    if (!organizationId || organizationError) await refetchOrganization()
    // 今の組織の一覧だけを再取得する。接頭辞 ['customers'] で全組織を再取得すると、取得は今の組織（JWT）で行われるため、
    // 画面に出ていない別組織のキャッシュに今の組織の顧客が入ってしまう（#565）
    await invalidateEverywhere(queryClient, ['customers', 'list', organizationId])
  }

  const visibleData = organizationId && !error && !organizationError ? data : undefined

  return {
    organizationId,
    options, setOptions, toggleSort,
    customers: visibleData?.customers ?? [],
    loading: organizationLoading || isLoading,
    error: organizationError || error || (!organizationLoading && !organizationId ? new Error('組織情報を取得できません') : null),
    couponStats: visibleData?.couponStats ?? {},
    refreshCustomers,
    totalCount: visibleData?.totalCount ?? 0,
    page,
    setPage,
    pageSize: PAGE_SIZE,
  }
}
