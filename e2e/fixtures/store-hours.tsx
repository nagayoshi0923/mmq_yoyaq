import React from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { BusinessHoursSettings } from '../../src/pages/Settings/pages/BusinessHoursSettings'
import { storeApi } from '../../src/lib/api/storeApi'
import { supabase } from '../../src/lib/supabase'
import '../../src/index.css'
const failure = new URLSearchParams(location.search).get('failure')
let saved = JSON.parse(sessionStorage.getItem('store-hours') || 'null') || {
  id: 'hours', store_id: 'store', holidays: ['2026-09-23'], opening_hours: null,
  special_open_days: [{ date: '2026-09-22', note: '臨時営業' }], special_closed_days: [],
}
storeApi.getAll = async () => [{ id: 'store', name: '試験店舗', organization_id: 'org' }] as never
supabase.auth.getUser = (async () => ({ data: { user: { id: 'test-user' } }, error: null })) as typeof supabase.auth.getUser
supabase.from = ((table: string) => {
  let update: object | undefined
  let inserted = false
  const filters: Record<string, unknown> = {}
  const chain = {
    select: () => chain,
    update: (value: object) => { update = value; return chain },
    insert: () => { inserted = true; return chain },
    eq: (key: string, value: unknown) => { filters[key] = value; return chain },
    maybeSingle: async () => table === 'users'
      ? { data: { organization_id: 'org' }, error: null }
      : { data: failure === 'read' ? null : saved, error: failure === 'read' ? { message: 'offline' } : null },
    then: (resolve: (value: unknown) => void) => {
      document.documentElement.dataset.inserted = String(inserted)
      if (table !== 'business_hours_settings' || filters.organization_id !== 'org' || filters.store_id !== 'store') throw new Error('店舗・組織境界が不足')
      if (failure === 'write') return Promise.resolve(resolve({ data: null, error: { message: 'offline' } }))
      if (update) saved = { ...saved, ...update }
      sessionStorage.setItem('store-hours', JSON.stringify(saved))
      document.documentElement.dataset.saved = JSON.stringify(saved)
      return Promise.resolve(resolve({ data: [{ id: 'hours' }], error: null }))
    },
  }
  return chain
}) as typeof supabase.from
createRoot(document.getElementById('root')!).render(<BrowserRouter><main style={{ maxWidth: 960, margin: 'auto', padding: 24 }}><BusinessHoursSettings storeId="store" /></main></BrowserRouter>)
