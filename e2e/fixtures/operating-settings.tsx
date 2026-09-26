import React,{useState} from 'react'
import {createRoot} from 'react-dom/client'
import {QueryClient,QueryClientProvider} from '@tanstack/react-query'
import {OperatingScalarSettings} from '../../src/components/settings/OperatingScalarSettings'
import {apiClient} from '../../src/lib/apiClient'
import type {SettingScope,SettingLayers} from '../../supabase/functions/_shared/settings-inheritance'
import '../../src/index.css'
const scopes: SettingScope[]=['organization','store','scenario','performance']
const layers: SettingLayers={organization:{preparation_minutes:90,judgment_minutes_before:240},store:{preparation_minutes:60},scenario:{preparation_minutes:30},performance:{preparation_minutes:0}}
apiClient.get=async (url)=>{
 const scope=new URL(url,'http://localhost').searchParams.get('scope') as SettingScope
 return {layers:Object.fromEntries(scopes.slice(0,scopes.indexOf(scope)+1).map(k=>[k,layers[k]])),revisions:{organization:1,store:1,scenario:1,performance:1},can_edit:!location.search.includes('readonly')} as never
}
apiClient.patch=async(url,body:any)=>{
 const scope=new URL(url,'http://localhost').searchParams.get('scope') as SettingScope
 layers[scope]={...layers[scope],...body.settings}
 document.documentElement.dataset.saved=JSON.stringify({scope,...body})
 return {} as never
}
function App(){const[scope,setScope]=useState<SettingScope>('performance');return <main className="p-6 md:p-8 space-y-6"><h1 className="text-2xl font-bold">設定</h1><nav className="flex flex-wrap gap-3">{scopes.map((s,i)=><button key={s} onClick={()=>setScope(s)}>{['組織共通','店舗','シナリオ','公演'][i]}</button>)}</nav><OperatingScalarSettings key={scope} scope={scope} targetId="fixture" title="開催判断・準備時間" keys={['judgment_minutes_before','preparation_minutes']}/></main>}
createRoot(document.getElementById('root')!).render(<QueryClientProvider client={new QueryClient()}><App/></QueryClientProvider>)
