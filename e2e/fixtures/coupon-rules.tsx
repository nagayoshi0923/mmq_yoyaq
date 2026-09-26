import { BrowserRouter } from 'react-router-dom'
import React, { useState } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AuthProvider } from '../../src/contexts/AuthContext'
import { CouponsPage } from '../../src/pages/MyPage/pages/CouponsPage'
import { CampaignEdit } from '../../src/pages/CouponManagement/CampaignEdit'
import { apiClient } from '../../src/lib/apiClient'
import '../../src/index.css'
const isCustomer=new URLSearchParams(location.search).has('customer')
let reservationFailed = new URLSearchParams(location.search).has('reservation-error')
apiClient.get = async path => {
  if (path.includes('current-reservations') && reservationFailed) { reservationFailed = false; throw new Error('予約を取得できませんでした') }
  if (path.includes('current-reservations')) return [{id:'valid',scenario_title:'利用対象の作品',organization_id:'org',store_name:'架空店舗',date:'2099-01-01',time:'13:00'},{id:'invalid',scenario_title:'対象外の作品',organization_id:'org',store_name:'架空店舗',date:'2099-01-01',time:'13:00'}] as never
  if (path.includes('type=all')) return [{id:'coupon',organization_id:'org',campaign_id:'campaign',customer_id:'customer',uses_remaining:1,status:'active',expires_at:new URLSearchParams(location.search).has('expired')?new Date(Date.now()-86400000).toISOString():'2099-01-01T14:59:59Z',created_at:'2026-01-01T00:00:00Z',updated_at:'2000-01-01T00:00:00Z',coupon_campaigns:{id:'campaign',name:'25%クーポン',combinable:true,same_scenario_once:true,discount_type:'percentage',discount_amount:25,max_uses_per_customer:1}}] as never
  return { organization_id: '00000000-0000-0000-0000-000000000001', stores: [{ id:'00000000-0000-0000-0000-000000000002',name:'架空店舗' }], scenarios: [{ id:'00000000-0000-0000-0000-000000000003', scenario_master_id:'00000000-0000-0000-0000-000000000004', scenario_masters:{title:'架空作品'} }] } as never
}
apiClient.post = async (path,body) => {
  if ((body as {reservation_id:string}).reservation_id==='invalid') throw new Error('対象シナリオではありません')
  if (path.includes('preview-use')) return {success:true,discount_amount:1000} as never
  return {success:true} as never
}

function Fixture() {
  const [saved,setSaved]=useState('')
  if(isCustomer) return <CouponsPage/>
  return <main className="p-6"><CampaignEdit campaign={null} onCancel={()=>{}} onSave={async data=>{setSaved(JSON.stringify(data))}}/><output aria-label="保存内容">{saved}</output></main>
}
createRoot(document.getElementById('root')!).render(<QueryClientProvider client={new QueryClient({ defaultOptions:{queries:{retry:false}}})}><BrowserRouter><AuthProvider><Fixture/></AuthProvider></BrowserRouter></QueryClientProvider>)
