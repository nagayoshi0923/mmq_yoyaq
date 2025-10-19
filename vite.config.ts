import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  optimizeDeps: {
    // lucide-react の Tree-shaking を最適化
    include: ['lucide-react']
  },
  build: {
    // チャンクサイズ警告のしきい値を上げる（KB単位）
    chunkSizeWarningLimit: 1000,
    rollupOptions: {
      output: {
        // マニュアルチャンク分割でベンダーライブラリを分離
        manualChunks: {
          // React 関連
          'vendor-react': ['react', 'react-dom'],
          
          // UI ライブラリ
          'vendor-ui': [
            'lucide-react',
            '@radix-ui/react-dialog',
            '@radix-ui/react-select',
            '@radix-ui/react-checkbox',
            '@radix-ui/react-label',
            '@radix-ui/react-tabs',
            '@radix-ui/react-tooltip'
          ],
          
          // テーブルライブラリ
          'vendor-table': ['@tanstack/react-table'],
          
          // Supabase
          'vendor-supabase': ['@supabase/supabase-js'],
          
          // ユーティリティ
          'vendor-utils': ['date-fns', 'clsx'],
          
          // チャートライブラリ（SalesManagement のみ使用）
          'vendor-chart': ['chart.js', 'react-chartjs-2'],
          
          // エクスポートライブラリ（使用時のみロード）
          'vendor-xlsx': ['xlsx']
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
    // HMR の高速化
    hmr: {
      overlay: true
    }
  }
})
