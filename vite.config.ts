import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react-swc'
import path from 'path'

// 0.0.0.0 は LAN 公開に便利だが、OS によっては os.networkInterfaces() が失敗し Vite 起動が落ちる（uv_interface_addresses 等）
const devHost = process.env.VITE_DEV_HOST === 'all' ? '0.0.0.0' : '127.0.0.1'
const devLan = devHost === '0.0.0.0'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react()
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "react": "react",
      "react-dom": "react-dom"
    },
  },
  optimizeDeps: {
    // lucide-react の Tree-shaking を最適化
    // Radix は個別 import されるため明示 include しておくと、504 Outdated Optimize Dep が起きにくい
    include: [
      'lucide-react',
      'react',
      'react-dom',
      '@radix-ui/react-switch',
      '@radix-ui/react-tooltip',
    ],
  },
  build: {
    target: 'esnext',
    reportCompressedSize: false,
    // チャンクサイズ警告のしきい値を上げる（KB単位）
    chunkSizeWarningLimit: 1000,
    rollupOptions: {
      output: {
        // ファイル名の形式を変更してMIMEタイプの問題を回避
        entryFileNames: 'assets/[name]-[hash].js',
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash].[ext]',
        // 🚀 手動チャンク分割: 初期バンドルを軽量化
        // object 形式だと Rollup が「最初に到達したエントリの依存グラフ」に
        // 引きずられてベンダー以外の共有モジュール（date-fns 等）まで
        // 特定チャンク（AdminDashboard 等）に同居させてしまうことがあるため、
        // node_modules を正規表現で判定する function 形式に変更。
        manualChunks(id) {
          if (!id.includes('node_modules')) {
            // 共有レイアウト（Header/NotificationDropdown/AppLayout/PublicLayout）は
            // 複数の動的 import チャンクから参照されるため、Rollup が
            // AdminDashboard 等の特定チャンクへ同居させてしまう。
            // 明示的に独立チャンクへ切り出す（AdminSidebar は含めない＝顧客に管理ナビを配らない）。
            if (/\/src\/components\/layout\/(Header|NotificationDropdown|AppLayout|PublicLayout)\.tsx$/.test(id)) {
              return 'shared-layout'
            }
            return undefined
          }
          if (/node_modules\/(react|react-dom|scheduler)\//.test(id)) {
            return 'vendor-react'
          }
          if (/node_modules\/date-fns\//.test(id)) {
            return 'vendor-datefns'
          }
          if (/node_modules\/(lucide-react|@radix-ui)\//.test(id)) {
            return 'vendor-ui'
          }
          if (/node_modules\/@supabase\//.test(id)) {
            return 'vendor-supabase'
          }
          if (/node_modules\/@tanstack\/react-table\//.test(id)) {
            return 'vendor-table'
          }
          if (/node_modules\/(chart\.js|react-chartjs-2)\//.test(id)) {
            return 'vendor-chart'
          }
          // その他の node_modules は自動分割に任せる
          return undefined
        }
      }
    },
    // ソースマップを本番環境では無効化（パフォーマンス向上）
    sourcemap: false,
    // 圧縮を有効化
    minify: 'esbuild',
    // CSS コード分割を有効化
    cssCodeSplit: true
  },
  // 開発サーバーの最適化
  server: {
    // 既定 127.0.0.1（起動安定）。スマホ等から繋ぐときは VITE_DEV_HOST=all npm run dev
    host: devHost,
    // `vercel dev` 経由で起動された場合は PORT env が渡されるのでそれに従う。
    // 単独 `npm run dev` 時は 5173 固定（別ポートに逃がさない）。
    port: process.env.PORT ? parseInt(process.env.PORT, 10) : 5173,
    strictPort: !process.env.PORT,
    // CORS設定（ネットワーク経由アクセス対応）
    cors: true,
    // /api/* をステージング Vercel deploy に転送する
    // 理由: macOS 上で vercel dev が spawn EBADF で関数を実行できないため、
    // ローカルからは staging deploy の /api を叩く方式に切り替えた。
    // ローカルで API 自体を編集したい場合は staging へ push して反映を待つ
    // （UI のみのローカル開発であれば npm run dev のみで完結する）。
    // 環境変数 VITE_API_TARGET で別 URL を指定可能（例: 本番確認、preview deploy 確認）
    proxy: {
      '/api': {
        target: process.env.VITE_API_TARGET || 'https://mmq-yoyaq-git-staging-nagayoshi0923s-projects.vercel.app',
        changeOrigin: true,
        secure: true,
      },
    },
    hmr: {
      overlay: true,
      ...(devLan ? { clientPort: 5173 } : {}),
    },
    // ウォッチャーの最適化
    watch: {
      // 大きなファイルの変更をスキップしてパフォーマンス向上
      ignored: ['**/node_modules/**', '**/.git/**']
    }
  }
})
