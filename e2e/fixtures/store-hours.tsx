import React from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { BusinessHoursSettings } from '../../src/pages/Settings/pages/BusinessHoursSettings'
import { storeApi } from '../../src/lib/api/storeApi'
import '../../src/index.css'
const failure = new URLSearchParams(location.search).get('failure')
let saved = JSON.parse(sessionStorage.getItem('store-hours') || 'null') || {
  id: 'hours', store_id: 'store', holidays: ['2026-09-23'], opening_hours: null,
  special_open_days: [{ date: '2026-09-22', note: '臨時営業' }], special_closed_days: [],
}
storeApi.getAll = async () => [{ id: 'store', name: '試験店舗', organization_id: 'org' }] as never
storeApi.getBusinessHours = async () => {
  if (failure === 'read') throw new Error('offline')
  return saved
}
storeApi.saveBusinessHours = async (storeId, fields) => {
  if (storeId !== 'store') throw new Error('店舗が不一致')
  document.documentElement.dataset.inserted = 'false'
  if (failure === 'write') throw new Error('offline')
  saved = { ...saved, ...fields }
  sessionStorage.setItem('store-hours', JSON.stringify(saved))
  document.documentElement.dataset.saved = JSON.stringify(saved)
  return { success: true }
}
createRoot(document.getElementById('root')!).render(<BrowserRouter><main style={{ maxWidth: 960, margin: 'auto', padding: 24 }}><BusinessHoursSettings storeId="store" /></main></BrowserRouter>)
