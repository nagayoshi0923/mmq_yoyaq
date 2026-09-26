import { PageHeader } from '@/components/layout/PageHeader'
import { PrivateBookingDeadlineSection } from '@/components/settings/PrivateBookingDeadlineSection'
import '@/components/modals/ScenarioEditDialogV2.css'

export function PrivateBookingSettings() {
  return <div className="space-y-6 max-w-4xl pb-12">
    <PageHeader title="貸切予約の受付締切" description="組織共通の初期値を設定します。シナリオ編集 → ゲーム設定で、作品ごとに上書きできます。" />
    <PrivateBookingDeadlineSection common />
  </div>
}
