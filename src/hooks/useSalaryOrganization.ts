import { useQuery } from '@tanstack/react-query'
import { useAuth } from '@/contexts/AuthContext'
import { getCurrentOrganizationId } from '@/lib/organization'

/** 給与・売上の組織解決。スタッフ行がない管理者も従来のusers経由で解決する。 */
export function useSalaryOrganization() {
  const { user, loading } = useAuth()
  const query = useQuery({
    queryKey: ['salary-organization', user?.id],
    queryFn: getCurrentOrganizationId,
    enabled: !!user && !loading,
    retry: false,
  })
  return {
    organizationId: user ? query.data ?? null : null,
    isLoading: loading || query.isLoading,
    error: query.error,
  }
}
