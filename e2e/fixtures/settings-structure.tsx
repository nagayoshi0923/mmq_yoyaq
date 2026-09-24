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

const stores = [{ id: 'a', name: '店舗A', organization_id: 'org' }, { id: 'b', name: '店舗B', organization_id: 'org' }]
storeApi.getAll = async () => stores as never
supabase.auth.getUser = async () => ({ data: { user: { id: 'test-user' } }, error: null }) as never
const writes: unknown[] = []
const row = (table: string, store: string) => table === 'users' ? { organization_id: 'org' } : table === 'global_settings' ? { id: 'global', enable_email_notifications: true } : { id: `setting-${store}`, store_id: store, advance_booking_days: store === 'b' ? 77 : 33, default_duration: store === 'b' ? 240 : 180 }
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

function Fixture() {
  const mode = new URLSearchParams(location.search).get('mode')
  const [store, setStore] = useState('b')
  const master = { title: '共通のタイトル', author: '作者', official_duration: 120, player_count_min: 5, player_count_max: 6, difficulty: '3', genre: ['推理'] }
  const stored = { override_title: '自社のタイトル', override_author: null }
  const baseline = scenarioEffectiveFields(stored, master)
  const [values, setValues] = useState(baseline)
  const [resets, setResets] = useState<Record<string, unknown>>({})
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
