/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string
  readonly VITE_SUPABASE_ANON_KEY: string
  readonly VITE_SUPABASE_PUBLISHABLE_KEY?: string
  readonly VITE_APP_ENV: string
  readonly VITE_SKIP_STAFF_LOOKUP: string
  readonly VITE_DISABLE_SW?: string
  /** ウェブプッシュ（VAPID）の公開鍵。無ければ通知の案内を出さない（貸切グループ 段階 3） */
  readonly VITE_VAPID_PUBLIC_KEY?: string
  readonly DEV: boolean
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

