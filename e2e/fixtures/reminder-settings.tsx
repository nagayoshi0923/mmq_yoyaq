import React from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { EmailSettings } from '../../src/pages/Settings/pages/EmailSettings'
import { storeApi } from '../../src/lib/api/storeApi'
import { supabase } from '../../src/lib/supabase'
import '../../src/index.css'
let saved = { id:'setting',store_id:'store',company_name:'試験店舗',reminder_template:'オープン専用の案内',private_reminder_template:'貸切専用の案内',reminder_schedule:[],reminder_enabled:true }
storeApi.getAll = async () => [{id:'store',name:'試験店舗',organization_id:'org'}] as never
supabase.from = (() => {
  let update: object | undefined
  const chain = {
    select: () => chain,
    update: (v: object) => { update=v;return chain },
    eq: () => chain,
    maybeSingle: async () => ({data:saved,error:null}),
    then: (resolve: (v: unknown) => void) => {
      if(update) saved={...saved,...update}
      document.documentElement.dataset.saved=JSON.stringify(saved)
      return Promise.resolve(resolve({data:saved,error:null}))
    }
  }
  return chain
}) as typeof supabase.from
createRoot(document.getElementById('root')!).render(<BrowserRouter><QueryClientProvider client={new QueryClient()}><main style={{maxWidth:960,margin:'auto',padding:24}}><EmailSettings/></main></QueryClientProvider></BrowserRouter>)
