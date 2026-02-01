/**
 * 組織（マルチテナント）関連の React フック
 * 
 * React Queryでキャッシュし、ページ遷移で再取得しないよう最適化
 */
import { logger } from '@/utils/logger'
import { useCallback, useState, useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { Organization, Staff } from '@/types'
import { QUEENS_WALTZ_ORG_ID } from '@/lib/organization'

// NOTE: Supabase の型推論（select parser）の都合で、select 文字列は literal に寄せる
const ORGANIZATION_SELECT_FIELDS =
  'id, name, slug, plan, contact_email, contact_name, is_license_manager, is_active, settings, notes, created_at, updated_at' as const
const STAFF_SELECT_FIELDS =
  'id, organization_id, name, line_name, x_account, discord_id:discord_user_id, discord_channel_id, role, stores, ng_days, want_to_learn, available_scenarios, notes, phone, email, user_id, availability, experience, special_scenarios, status, avatar_url, avatar_color, created_at, updated_at' as const

interface UseOrganizationResult {
  organization: Organization | null
  staff: Staff | null
  organizationId: string | null
  isLicenseManager: boolean
  isLoading: boolean
  error: Error | null
  refetch: () => Promise<void>
}

// Query Keys（キャッシュキー）
export const organizationKeys = {
  current: ['organization', 'current'] as const,
}

/**
 * 組織情報を取得する関数（React Query用）
 */
async function fetchOrganizationData(): Promise<{ organization: Organization | null; staff: Staff | null }> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return { organization: null, staff: null }
  }

  // スタッフ情報を取得
  const { data: staffData, error: staffError } = await supabase
    .from('staff')
    .select(STAFF_SELECT_FIELDS)
    .eq('user_id', user.id)
    .maybeSingle()

  if (staffError && staffError.code !== 'PGRST116') {
    throw staffError
  }

  if (!staffData) {
    return { organization: null, staff: null }
  }

  // 組織情報を取得
  const orgId = staffData?.organization_id || QUEENS_WALTZ_ORG_ID
  
  const { data: orgData, error: orgError } = await supabase
    .from('organizations')
    .select(ORGANIZATION_SELECT_FIELDS)
    .eq('id', orgId)
    .maybeSingle()

  if (orgError && orgError.code !== 'PGRST116') {
    logger.warn('Organization not found:', orgId, orgError)
  }

  return {
    organization: orgData as Organization | null,
    staff: staffData as Staff,
  }
}

/**
 * 現在のユーザーの組織情報を取得するフック
 * 
 * React Queryでキャッシュされるため、ページ遷移時に再取得しない
 * - staleTime: 10分（この間は再取得しない）
 * - gcTime: 30分（メモリに保持）
 */
export function useOrganization(): UseOrganizationResult {
  const queryClient = useQueryClient()

  const { data, isLoading, error } = useQuery({
    queryKey: organizationKeys.current,
    queryFn: fetchOrganizationData,
    staleTime: 10 * 60 * 1000, // 10分間はfreshとみなす（再取得しない）
    gcTime: 30 * 60 * 1000, // 30分間メモリに保持
    refetchOnMount: false, // マウント時に再取得しない（キャッシュを使う）
    refetchOnWindowFocus: false, // タブ復帰時も再取得しない
    retry: 1,
  })

  const refetch = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: organizationKeys.current })
  }, [queryClient])

  return {
    organization: data?.organization ?? null,
    staff: data?.staff ?? null,
    organizationId: data?.staff?.organization_id ?? null,
    isLicenseManager: data?.organization?.is_license_manager ?? false,
    isLoading,
    error: error as Error | null,
    refetch,
  }
}

interface UseOrganizationsResult {
  organizations: Organization[]
  isLoading: boolean
  error: Error | null
  refetch: () => Promise<void>
}

/**
 * 組織一覧を取得するフック（管理者用）
 */
export function useOrganizations(): UseOrganizationsResult {
  const [organizations, setOrganizations] = useState<Organization[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  const fetchOrganizations = useCallback(async () => {
    try {
      setIsLoading(true)
      setError(null)

      const { data, error: fetchError } = await supabase
        .from('organizations')
        .select(ORGANIZATION_SELECT_FIELDS)
        .order('name')

      if (fetchError) throw fetchError
      setOrganizations(data as Organization[])
    } catch (err) {
      logger.error('Failed to fetch organizations:', err)
      setError(err instanceof Error ? err : new Error('Unknown error'))
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchOrganizations()
  }, [fetchOrganizations])

  return {
    organizations,
    isLoading,
    error,
    refetch: fetchOrganizations,
  }
}

/**
 * クインズワルツの組織IDかどうかを判定
 */
export function isQueensWaltz(organizationId: string | null): boolean {
  return organizationId === QUEENS_WALTZ_ORG_ID
}

