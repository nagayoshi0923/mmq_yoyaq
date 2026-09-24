import React from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RecruitmentSettingsSection } from '../../src/components/modals/ScenarioEditDialogV2/sections/RecruitmentSettingsSection'
import { RecruitmentSettings } from '../../src/pages/Settings/pages/RecruitmentSettings'
import { apiClient } from '../../src/lib/apiClient'
import '../../src/index.css'
import '../../src/components/modals/ScenarioEditDialogV2.css'
let common = { enabled: true, deadline_minutes: 90, mode: 'percent', value: 50, updated_at: null as string | null }
let setting = { recruitment_enabled_source: 'common', recruitment_deadline_source: 'common', recruitment_extension_enabled: true, recruitment_max_missing: 2, recruitment_deadline_minutes: 90, recruitment_target_source: 'common', recruitment_target_mode: 'count', recruitment_target_value: 2, updated_at: '2026-09-08T00:00:00Z' }
apiClient.get = async (path) => (path.includes('common-recruitment-settings') ? { setting: common, common_count: 10, custom_count: 2, can_edit: true } : { setting, common, min_required: 7, history: [], can_edit: true }) as never
apiClient.patch = async (path, body) => {
 const value = body as { enabled: boolean; enabled_source: string; deadline_source: string; source: string; mode: string; value: number; deadline_minutes: number }
 if (path.includes('common-recruitment-settings')) common = { enabled: value.enabled, deadline_minutes: value.deadline_minutes, mode: value.mode, value: value.value, updated_at: new Date().toISOString() }
 else setting = { ...setting, recruitment_enabled_source: value.enabled_source, recruitment_deadline_source: value.deadline_source, recruitment_extension_enabled: value.enabled, recruitment_target_source: value.source, recruitment_target_mode: value.mode, recruitment_target_value: value.value, recruitment_deadline_minutes: value.deadline_minutes }
 return { success: true } as never
}
createRoot(document.getElementById('root')!).render(<QueryClientProvider client={new QueryClient()}><main className="scenario-edit-dialog__content" style={{ maxWidth: 760, padding: 24, margin: 'auto' }}>{location.search.includes('common') ? <RecruitmentSettings /> : <RecruitmentSettingsSection masterId="55000000-0000-0000-0000-000000000001" />}</main></QueryClientProvider>)
