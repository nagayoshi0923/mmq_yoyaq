import React from 'react'
import { BookingCutoffSection } from '../../src/components/modals/ScenarioEditDialogV2/sections/BookingCutoffSection'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BookingDeadlineTab } from '../../src/components/schedule/BookingDeadlineTab'
import { apiClient } from '../../src/lib/apiClient'
import '../../src/index.css'
import '../../src/components/modals/ScenarioEditDialogV2.css'
const fixture = { judgment_deadline: '2026-09-08T16:30:00+09:00', judgment_status: 'active', booking_deadline: '2026-09-08T18:00:00+09:00', effective_booking_deadline: '2026-09-08T16:30:00+09:00', override_minutes: null as number | null, default_minutes: 0, updated_at: '2026-09-08T00:00:00+09:00' }
let scenarioMinutes: number | null = null
apiClient.get = async (path) => { if (path.includes('scenario-booking-cutoff')) return { setting: { booking_cutoff_minutes: scenarioMinutes, updated_at: fixture.updated_at }, can_edit: true } as never; if (!path.startsWith('/api/schedule?')) throw Error('wrong path'); return { window: fixture, can_edit: true } as never }
apiClient.patch = async (path, body) => {
 if (path.includes('scenario-booking-cutoff')) { scenarioMinutes=(body as { minutes: number | null }).minutes; return { success: true } as never }
 if (!path.startsWith('/api/schedule?action=booking-cutoff')) throw Error('wrong path')
 fixture.override_minutes = (body as { minutes: number | null }).minutes
 fixture.booking_deadline = fixture.override_minutes === null ? '2026-09-08T18:00:00+09:00' : '2026-09-08T17:30:00+09:00'
 return { success: true } as never
}
createRoot(document.getElementById('root')!).render(<QueryClientProvider client={new QueryClient()}><main className="scenario-edit-dialog__content" style={{ maxWidth: 680, padding: 24, margin: 'auto' }}><p className="scenario-edit-card__title">ゲーム設定 / 募集・締切</p><BookingCutoffSection masterId="55000000-0000-0000-0000-000000000001" /><BookingDeadlineTab eventId="33000000-0000-0000-0000-000000000001" /></main></QueryClientProvider>)
