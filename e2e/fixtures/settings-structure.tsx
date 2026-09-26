import { BookingCutoffSection } from '../../src/components/modals/ScenarioEditDialogV2/sections/BookingCutoffSection'
import { RecruitmentSettingsSection } from '../../src/components/modals/ScenarioEditDialogV2/sections/RecruitmentSettingsSection'
import { RecruitmentSettings } from '../../src/pages/Settings/pages/RecruitmentSettings'
import { PrivateBookingDeadlineSection } from '../../src/components/settings/PrivateBookingDeadlineSection'
import { apiClient } from '../../src/lib/apiClient'
import React, { useState } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { SettingsOverview } from '../../src/components/settings/SettingsOverview'
import { StoreSelector } from '../../src/components/settings/StoreSelector'
import { ScenarioSettingSources } from '../../src/components/settings/ScenarioSettingSources'
import { ReservationSettings } from '../../src/pages/Settings/pages/ReservationSettings'
import { NotificationSettings } from '../../src/pages/Settings/pages/NotificationSettings'
import { PerformanceScheduleSettings } from '../../src/pages/Settings/pages/PerformanceScheduleSettings'
import { storeApi } from '../../src/lib/api/storeApi'
import { organizationSettingsApi } from '../../src/lib/api/organizationSettingsApi'
import { supabase } from '../../src/lib/supabase'
import { scenarioEffectiveFields, scenarioSourcePayload } from '../../src/lib/scenarioSettingSources'
import '../../src/index.css'
import '../../src/components/modals/ScenarioEditDialogV2.css'

const stores = [{ id: 'a', name: '店舗A', organization_id: 'org' }, { id: 'b', name: '店舗B', organization_id: 'org' }]
storeApi.getAll = async () => stores as never
supabase.auth.getUser = async () => ({ data: { user: { id: 'test-user' } }, error: null }) as never
const writes: unknown[] = []
const row = (table: string, store: string) => table === 'users' ? { organization_id: 'org' } : table === 'global_settings' ? { id: 'global', enable_email_notifications: true } : { id: `setting-${store}`, store_id: store, payment_method_label: store === 'b' ? '店舗Bの案内' : '店舗Aの案内', default_duration: store === 'b' ? 240 : 180 }
supabase.from = ((table: string) => {
  let payload: unknown
  let store = 'a'
  const filters: Record<string, unknown> = {}
  const respond = () => {
    if (payload) { writes.push({ table, filters, payload }); document.documentElement.dataset.writes = JSON.stringify(writes) }
    return { data: table === 'staff' || table === 'scenarios' || table === 'organization_scenarios_with_master' ? [] : row(table, store), error: null }
  }
  const chain = {
    select: () => chain, order: () => chain, in: () => chain, limit: () => chain,
    update: (value: unknown) => { payload = value; return chain }, insert: (value: unknown) => { payload = value; return chain },
    eq: (key: string, value: string) => { filters[key] = value; if (key === 'store_id') store = value; return chain },
    maybeSingle: async () => respond(), single: async () => respond(),
    then: (resolve: (value: unknown) => unknown) => Promise.resolve(resolve(respond())),
  }
  return chain
}) as typeof supabase.from
const times = { morning: { start_time: '10:00', end_time: '14:00' }, afternoon: { start_time: '14:30', end_time: '18:30' }, evening: { start_time: '19:00', end_time: '23:00' } }
organizationSettingsApi.getTimeSlotSettings = async () => ({ weekday: times, holiday: times })
organizationSettingsApi.updateTimeSlotSettings = async (payload) => { document.documentElement.dataset.timeSaved = JSON.stringify(payload); return {} as never }

let privateDays: number | null = null
let cutoff: number | null = null
let recruitment = { recruitment_extension_enabled: true, recruitment_enabled_source: 'common', recruitment_deadline_source: 'common', recruitment_target_source: 'common', recruitment_target_mode: 'count', recruitment_target_value: 2, recruitment_deadline_minutes: 90, updated_at: '2026-09-24T00:00:00Z' }
let recruitmentCommon = { enabled: true, deadline_minutes: 60, mode: 'count', value: 2, updated_at: '2026-09-24T00:00:00Z' }
const paymentOverrides: Record<string, Record<string, unknown>> = {}
apiClient.get = async (url) => {
 if (url.includes('operating-settings')) {
  const id = new URL(url, location.origin).searchParams.get('target_id') || 'a'
  return { layers: { organization: {}, store: { payment_method_label: id === 'b' ? '店舗Bの案内' : '店舗Aの案内', ...paymentOverrides[id] } }, revisions: { store: 1 }, can_edit: true } as never
 }
 if (url.includes('booking-cutoff-settings')) return { setting: { booking_cutoff_minutes: cutoff, updated_at: '2026-09-24T00:00:00Z' }, common_minutes: 30, can_edit: true } as never
 if (url.includes('common-recruitment-settings')) return { setting: recruitmentCommon, can_edit: true, common_count: 3, custom_count: 1 } as never
 if (url.includes('recruitment-settings')) return { setting: recruitment, common: recruitmentCommon, can_edit: true, min_required: 7, history: [] } as never
 return { setting: { private_booking_deadline_days: privateDays, updated_at: '2026-09-24T00:00:00Z' }, common_days: 7, can_edit: true } as never
}
apiClient.patch = async (url, payload: any) => {
 if (url.includes('operating-settings')) {
  const id = new URL(url, location.origin).searchParams.get('target_id') || 'a'
  paymentOverrides[id] = { ...paymentOverrides[id], ...payload.settings }
  writes.push({ scope: 'store', target_id: id, payload }); document.documentElement.dataset.writes = JSON.stringify(writes)
  return {} as never
 }
 if (url.includes('booking-cutoff-settings')) { cutoff=payload.minutes; document.documentElement.dataset.cutoffSaved=JSON.stringify(payload) }
 else if (url.includes('common-recruitment-settings')) { recruitmentCommon={...recruitmentCommon,...payload}; document.documentElement.dataset.commonSaved=JSON.stringify(payload) }
 else if (url.includes('recruitment-settings')) { recruitment={...recruitment,recruitment_extension_enabled:payload.enabled_source === 'common' ? recruitment.recruitment_extension_enabled : payload.enabled,recruitment_enabled_source:payload.enabled_source,recruitment_deadline_source:payload.deadline_source,recruitment_deadline_minutes:payload.deadline_source === 'common' ? recruitment.recruitment_deadline_minutes : payload.deadline_minutes}; document.documentElement.dataset.recruitmentSaved=JSON.stringify(payload) }
 else { privateDays = payload.days; document.documentElement.dataset.privateSaved = JSON.stringify(payload) }
 return { success: true } as never
}

function Fixture() {
  const mode = new URLSearchParams(location.search).get('mode')
  const [store, setStore] = useState('b')
  const master = { title: '共通のタイトル', author: '作者', official_duration: 120, player_count_min: 5, player_count_max: 6, difficulty: '3', genre: ['推理'] }
  const stored = { override_title: '自社のタイトル', override_author: null }
  const baseline = scenarioEffectiveFields(stored, master)
  const [values, setValues] = useState(baseline)
  const [resets, setResets] = useState<Record<string, unknown>>({})
  if (mode === 'booking-cutoff') return <BookingCutoffSection masterId="11111111-1111-4111-8111-111111111111" />
  if (mode === 'recruitment') return <RecruitmentSettingsSection masterId="11111111-1111-4111-8111-111111111111" />
  if (mode === 'common-recruitment') return <RecruitmentSettings />
  if (mode === 'private-deadline') return <PrivateBookingDeadlineSection masterId="11111111-1111-4111-8111-111111111111" />
  if (mode === 'scenario') return <>
    <ScenarioSettingSources state={{ stored, baseline }} current={values} master={master} resets={resets} onReset={(field, value) => { setValues(v => ({ ...v, [field]: value })); setResets(v => ({ ...v, [field]: value })) }} />
    <button onClick={() => { document.documentElement.dataset.sourceSaved = JSON.stringify(scenarioSourcePayload(values, { stored, baseline }, resets)) }}>作品設定を保存</button>
  </>
  if (mode === 'org-notifications') return <NotificationSettings scope="organization" />
  if (mode === 'org-time') return <PerformanceScheduleSettings scope="organization" />
  if (mode === 'store-notifications') return <><StoreSelector stores={stores} selectedStoreId={store} onStoreChange={setStore} /><NotificationSettings key={store} storeId={store} scope="store" /></>
  if (mode === 'reservation') return <><StoreSelector stores={stores} selectedStoreId={store} onStoreChange={setStore} /><ReservationSettings key={store} storeId={store} /></>
  return <SettingsOverview slug="test-org" isPlatformAdmin={new URLSearchParams(location.search).has('platform')} />
}
createRoot(document.getElementById('root')!).render(<BrowserRouter><QueryClientProvider client={new QueryClient()}><main style={{ maxWidth: 1100, padding: 20, margin: 'auto' }}><Fixture /></main></QueryClientProvider></BrowserRouter>)
