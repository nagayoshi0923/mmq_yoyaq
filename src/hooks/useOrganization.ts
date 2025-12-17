/**
 * 組織（マルチテナント）関連の React フック
 */
import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import type { Organization, Staff } from '@/types'
import { QUEENS_WALTZ_ORG_ID } from '@/lib/organization'

interface UseOrganizationResult {
  organization: Organization | null
  staff: Staff | null
  organizationId: string | null
  isLicenseManager: boolean
  isLoading: boolean
  error: Error | null
  refetch: () => Promise<void>
}

/**
 * 現在のユーザーの組織情報を取得するフック
 */
export function useOrganization(): UseOrganizationResult {
  const [organization, setOrganization] = useState<Organization | null>(null)
  const [staff, setStaff] = useState<Staff | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  const fetchOrganization = useCallback(async () => {
    try {
      setIsLoading(true)
      setError(null)

      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        setOrganization(null)
        setStaff(null)
        return
      }

      // スタッフ情報を取得
      const { data: staffData, error: staffError } = await supabase
        .from('staff')
        .select('*')
        .eq('user_id', user.id)
        .single()

      if (staffError) {
        // スタッフが見つからない場合はエラーではなく null を返す
        if (staffError.code === 'PGRST116') {
          setStaff(null)
          setOrganization(null)
          return
        }
        throw staffError
      }

      setStaff(staffData as Staff)

      // 組織情報を取得
      // organization_idがない場合はクインズワルツをデフォルトで使用
      const orgId = staffData?.organization_id || QUEENS_WALTZ_ORG_ID
      
      const { data: orgData, error: orgError } = await supabase
        .from('organizations')
        .select('*')
        .eq('id', orgId)
        .single()

      if (orgError) {
        // 組織が見つからない場合もエラーログのみ
        console.warn('Organization not found:', orgId, orgError)
      } else {
        setOrganization(orgData as Organization)
      }
    } catch (err) {
      console.error('Failed to fetch organization:', err)
      setError(err instanceof Error ? err : new Error('Unknown error'))
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchOrganization()

    // 認証状態の変更を監視
    const { data: { subscription } } = supabase.auth.onAuthStateChange(() => {
      fetchOrganization()
    })

    return () => {
      subscription.unsubscribe()
    }
  }, [fetchOrganization])

  return {
    organization,
    staff,
    organizationId: staff?.organization_id || null,
    isLicenseManager: organization?.is_license_manager ?? false,
    isLoading,
    error,
    refetch: fetchOrganization,
  }
}

/**
 * 組織一覧を取得するフック（管理者用）
 */
export function useOrganizations() {
  const [organizations, setOrganizations] = useState<Organization[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  const fetchOrganizations = useCallback(async () => {
    try {
      setIsLoading(true)
      setError(null)

      const { data, error: fetchError } = await supabase
        .from('organizations')
        .select('*')
        .order('name')

      if (fetchError) throw fetchError
      setOrganizations(data as Organization[])
    } catch (err) {
      console.error('Failed to fetch organizations:', err)
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

