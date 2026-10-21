import { PageHeader } from '@/components/layout/PageHeader'
import { PrivateBookingDeadlineSection } from '@/components/settings/PrivateBookingDeadlineSection'
import { OperatingScalarSettings } from '@/components/settings/OperatingScalarSettings'
import { PRIVATE_BOOKING_HORIZON_SETTING_KEYS } from '@/components/settings/operatingSettingFields'
import '@/components/modals/ScenarioEditDialogV2.css'

export function PrivateBookingSettings() {
  return <div className="space-y-6 max-w-4xl pb-12">
    <PageHeader title="貸切予約の受付締切" description="組織共通の初期値を設定します。シナリオ編集 → ゲーム設定で、作品ごとに上書きできます。" />
    <PrivateBookingDeadlineSection common />
    <OperatingScalarSettings scope="organization" keys={PRIVATE_BOOKING_HORIZON_SETTING_KEYS} title="貸切を受け付ける範囲" />
  </div>
}
