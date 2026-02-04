/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string
  readonly VITE_SUPABASE_ANON_KEY: string
  readonly VITE_SUPABASE_PUBLISHABLE_KEY?: string
  readonly VITE_APP_ENV: string
  readonly VITE_SKIP_STAFF_LOOKUP: string
  readonly VITE_DISABLE_SW?: string
  readonly DEV: boolean
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

