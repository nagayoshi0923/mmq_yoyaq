/**
 * @page アカウント管理
 * @path #accounts
 * @purpose ユーザー（スタッフ/管理者）と顧客の統合管理
 * @access admin
 * @organization 全組織
 */
import { useSearchParams } from 'react-router-dom'
import { Users } from 'lucide-react'
import { AppLayout } from '@/components/layout/AppLayout'
import { PageHeader } from '@/components/layout/PageHeader'
import { UserManagementContent } from './pages/UserManagementContent'
import { CustomerManagementContent } from './pages/CustomerManagementContent'

export function AccountManagement() {
  const [searchParams] = useSearchParams()
  const activeTab = searchParams.get('tab') || 'users'

  const renderContent = () => {
    switch (activeTab) {
      case 'customers': return <CustomerManagementContent />
      default:          return <UserManagementContent />
    }
  }

  return (
    <AppLayout
      currentPage="accounts"
      maxWidth="max-w-[1440px]"
      containerPadding="px-[10px] py-3 sm:py-4 md:py-6"
      stickyLayout={true}
    >
      <PageHeader
        title={<><Users className="h-5 w-5" />アカウント管理</>}
        description="スタッフ・顧客アカウントの統合管理"
      />
      {renderContent()}
    </AppLayout>
  )
}

export default AccountManagement
