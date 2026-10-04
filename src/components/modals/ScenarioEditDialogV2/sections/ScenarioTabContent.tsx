/**
 * 作品編集画面のタブごとの中身。ScenarioEditDialogV2.tsx から見た目を変えずに切り出したもの。
 */
import type { Dispatch, SetStateAction } from 'react'
import { EmailSettings } from '@/pages/Settings/pages/EmailSettings'
import { CancellationSettings } from '@/pages/Settings/pages/CancellationSettings'
import { OperatingTextSettings } from '@/components/settings/OperatingTextSettings'
import { OperatingScalarSettings } from '@/components/settings/OperatingScalarSettings'
import { OPERATION_SETTING_KEYS, PAYMENT_SETTING_FIELDS } from '@/components/settings/operatingSettingFields'
import { PrivateBookingDeadlineSection } from '@/components/settings/PrivateBookingDeadlineSection'
import { RecruitmentSettingsSection } from './RecruitmentSettingsSection'
import { BookingCutoffSection } from './BookingCutoffSection'
import { BasicInfoSectionV2 } from './BasicInfoSectionV2'
import { GameInfoSectionV2 } from './GameInfoSectionV2'
import { PricingSectionV2 } from './PricingSectionV2'
import { GmSettingsSectionV2 } from './GmSettingsSectionV2'
import { CostsPropsSectionV2 } from './CostsPropsSectionV2'
import { PerformancesSectionV2 } from './PerformancesSectionV2'
import { SurveySectionV2 } from './SurveySectionV2'
import { CharactersSectionV2 } from './CharactersSectionV2'
import type { Staff } from '@/types'
import type { ScenarioGmAssignment } from '@/lib/scenarioAssignmentChanges'
import type { ScenarioFormData } from '../types'
import type { emptyScenarioStats } from '../utils/headerAndDiffs'

export function ScenarioTabContent({ tabId, formData, setFormData, scenarioId, canDeleteScenario, handleDelete, currentOrgScenarioId, currentMasterId, assignmentsError, staff, loadingStaff, isLoadingAssignments, selectedStaffIds, setSelectedStaffIds, currentAssignments, handleAssignmentUpdate, scenarioStats }: {
  tabId: string
  formData: ScenarioFormData
  setFormData: Dispatch<SetStateAction<ScenarioFormData>>
  scenarioId: string | null | undefined
  canDeleteScenario: boolean
  handleDelete: () => void
  currentOrgScenarioId: string | undefined
  currentMasterId: string | undefined
  assignmentsError: unknown
  staff: Staff[]
  loadingStaff: boolean
  isLoadingAssignments: boolean
  selectedStaffIds: string[]
  setSelectedStaffIds: Dispatch<SetStateAction<string[]>>
  currentAssignments: ScenarioGmAssignment[]
  handleAssignmentUpdate: (staffId: string, field: 'can_main_gm' | 'can_sub_gm', value: boolean) => void
  scenarioStats: ReturnType<typeof emptyScenarioStats>
}) {
  switch (tabId) {
    case 'basic':
      return <BasicInfoSectionV2 formData={formData} setFormData={setFormData} scenarioId={scenarioId} onDelete={canDeleteScenario ? handleDelete : undefined} />
    case 'game':
      return <div className="space-y-3"><GameInfoSectionV2 formData={formData} setFormData={setFormData} /><OperatingScalarSettings scope="scenario" targetId={currentOrgScenarioId} keys={OPERATION_SETTING_KEYS} title="開催判断・準備時間・クーポン" /><RecruitmentSettingsSection masterId={currentMasterId} minimumPlayers={formData.player_count_min} /><BookingCutoffSection masterId={currentMasterId} /><PrivateBookingDeadlineSection masterId={currentMasterId} /></div>
    case 'characters':
      return <CharactersSectionV2 formData={formData} setFormData={setFormData} />
    case 'pricing':
      return <PricingSectionV2 formData={formData} setFormData={setFormData} />
    case 'gm':
      return (
        <>
        {assignmentsError && <p role="alert" className="text-sm text-destructive">担当GMを読み込めませんでした。保存せずに画面を開き直してください。</p>}
        <GmSettingsSectionV2 
          formData={formData} 
          setFormData={setFormData} 
          staff={staff}
          loadingStaff={loadingStaff || isLoadingAssignments}
          selectedStaffIds={selectedStaffIds}
          onStaffSelectionChange={setSelectedStaffIds}
          currentAssignments={currentAssignments}
          onAssignmentUpdate={handleAssignmentUpdate}
        />
        </>
      )
    case 'costs':
      return <CostsPropsSectionV2 formData={formData} setFormData={setFormData} scenarioStats={scenarioStats} />
    case 'performances':
      return (
        <PerformancesSectionV2 
          performanceDates={scenarioStats.performanceDates}
          participationCosts={formData.participation_costs || []}
          scenarioParticipationFee={formData.participation_fee || 0}
          totalParticipants={scenarioStats.totalParticipants}
          totalStaffParticipants={scenarioStats.totalStaffParticipants}
          totalRevenue={scenarioStats.totalRevenue}
          totalLicenseCost={scenarioStats.totalLicenseCost}
          licenseAmount={formData.license_rewards?.find(r => r.item === 'normal')?.amount ?? formData.license_amount ?? 0}
          gmTestLicenseAmount={formData.license_rewards?.find(r => r.item === 'gmtest')?.amount ?? formData.gm_test_license_amount ?? 0}
          scenarioTitle={formData.title || 'シナリオ'}
          futurePerformanceCount={scenarioStats.futurePerformanceCount}
          futureReservationCount={scenarioStats.futureReservationCount}
        />
      )
    case 'booking-policy':
      return <div className="space-y-6"><OperatingTextSettings scope="scenario" targetId={currentOrgScenarioId} fields={PAYMENT_SETTING_FIELDS} /><CancellationSettings scope="scenario" targetId={currentOrgScenarioId} scenarioMasterId={currentMasterId || undefined} /></div>
    case 'email':
      return <EmailSettings scope="scenario" targetId={currentOrgScenarioId} />
    case 'survey':
      return <SurveySectionV2 formData={formData} setFormData={setFormData} organizationScenarioId={currentOrgScenarioId} />
    default:
      return null
  }
}
