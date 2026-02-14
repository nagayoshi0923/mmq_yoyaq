import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react-swc'
import path from 'path'

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
    include: ['lucide-react', 'react', 'react-dom', '@radix-ui/react-switch'],
  },
  build: {
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
    // ローカルネットワークからのアクセスを許可（スマホからもアクセス可能）
    host: '0.0.0.0',
    port: 5173,
    strictPort: true, // 5173固定（別ポートに逃がさない）
    // CORS設定（ネットワーク経由アクセス対応）
    cors: true,
    // タイムアウト設定（応答時間の改善）
    hmr: {
      overlay: true,
      // ネットワーク経由でのHMRを最適化
      clientPort: 5173
    },
    // ウォッチャーの最適化
    watch: {
      // 大きなファイルの変更をスキップしてパフォーマンス向上
      ignored: ['**/node_modules/**', '**/.git/**']
    }
  }
})
