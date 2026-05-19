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
        manualChunks: {
          // ベンダーライブラリを分離（キャッシュ効率向上）
          'vendor-react': ['react', 'react-dom'],
          'vendor-ui': ['lucide-react', '@radix-ui/react-dialog', '@radix-ui/react-select', '@radix-ui/react-dropdown-menu', '@radix-ui/react-checkbox', '@radix-ui/react-tabs', '@radix-ui/react-alert-dialog', '@radix-ui/react-popover', '@radix-ui/react-avatar', '@radix-ui/react-label', '@radix-ui/react-tooltip'],
          'vendor-supabase': ['@supabase/supabase-js'],
          'vendor-table': ['@tanstack/react-table'],
          'vendor-utils': ['clsx', 'class-variance-authority'],
          // 重い依存関係を分離
          'vendor-chart': ['chart.js', 'react-chartjs-2'],
          // ページコンポーネントごとのチャンク（自動分割に任せる部分）
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
