import { Users } from 'lucide-react'
import { AppLayout } from '@/components/layout/AppLayout'
import { PageHeader } from '@/components/layout/PageHeader'
import { PrivateGroupList } from './components/PrivateGroupList'

export default function PrivateGroupListPage() {
  return (
    <AppLayout
      currentPage="private-booking-groups"
      containerPadding="px-[10px] py-3 sm:py-4 md:py-6"
    >
      <PageHeader
        title={<><Users className="h-5 w-5" />グループ一覧</>}
        description="貸切公演グループの管理（招待状況・確定日・アンケート通知など）"
      />
      <PrivateGroupList />
    </AppLayout>
  )
}
