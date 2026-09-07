import React from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RecruitmentSettingsSection } from '../../src/components/modals/ScenarioEditDialogV2/sections/RecruitmentSettingsSection'
import { RecruitmentEmailSample } from '../../src/components/modals/ScenarioEditDialogV2/sections/RecruitmentEmailSample'
import { apiClient } from '../../src/lib/apiClient'
import '../../src/index.css'
import '../../src/components/modals/ScenarioEditDialogV2.css'
let setting = { recruitment_extension_enabled: true, recruitment_max_missing: 2, recruitment_deadline_minutes: 90, updated_at: '2026-09-08T00:00:00Z' }
apiClient.get = async () => ({ setting, history: [], can_edit: true }) as never
apiClient.patch = async (_path, body) => {
 const value = body as { enabled: boolean; max_missing: number; deadline_minutes: number }
 setting = { ...setting, recruitment_extension_enabled: value.enabled, recruitment_max_missing: value.max_missing, recruitment_deadline_minutes: value.deadline_minutes }
 return { success: true } as never
}
createRoot(document.getElementById('root')!).render(<QueryClientProvider client={new QueryClient()}><main className="scenario-edit-dialog__content" style={{ maxWidth: 680, padding: 24, margin: 'auto' }}><p className="scenario-edit-card__title">ゲーム設定</p><RecruitmentSettingsSection masterId="55000000-0000-0000-0000-000000000001" /><RecruitmentEmailSample masterId="55000000-0000-0000-0000-000000000001" scenarioName="確認用シナリオ" /></main></QueryClientProvider>)
