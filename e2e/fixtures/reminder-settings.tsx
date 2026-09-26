import React from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { EmailSettings } from '../../src/pages/Settings/pages/EmailSettings'
import '../../src/index.css'
import { apiClient } from '../../src/lib/apiClient'
let saved = {company_name:'試験店舗',reminder_template:'オープン専用の案内',private_reminder_template:'貸切専用の案内',reminder_schedule:[],reminder_enabled:true}
apiClient.get = async () => ({ layers:{organization:{},store:saved},revisions:{organization:0,store:1,scenario:0,performance:0},can_edit:true }) as never
apiClient.patch = async (_url,body: any) => {saved={...saved,...body.settings};document.documentElement.dataset.saved=JSON.stringify(saved);return {} as never}
createRoot(document.getElementById('root')!).render(<BrowserRouter><QueryClientProvider client={new QueryClient()}><main style={{maxWidth:960,margin:'auto',padding:24}}><EmailSettings storeId="store"/></main></QueryClientProvider></BrowserRouter>)
