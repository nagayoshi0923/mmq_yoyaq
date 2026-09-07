import { defineConfig } from '@playwright/test'
export default defineConfig({ testDir: './e2e', testMatch: 'recruitment-response.spec.ts', reporter: 'list', use: { baseURL: 'http://localhost:5188' }, webServer: { command: 'VITE_SUPABASE_URL=http://127.0.0.1:54321 VITE_SUPABASE_ANON_KEY=public-test-key npm run dev -- --port 5188', url: 'http://localhost:5188', reuseExistingServer: false } })
