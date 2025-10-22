import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import path from 'path'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react()
  ],
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
        // ファイル名の形式を変更してMIMEタイプの問題を回避
        entryFileNames: 'assets/[name]-[hash].js',
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash].[ext]',
        // マニュアルチャンク分割でベンダーライブラリを分離
        manualChunks(id) {
          if (id.includes('node_modules')) {
            // React 関連
            if (id.includes('react') || id.includes('react-dom')) {
              return 'vendor-react'
            }
            
            // UI ライブラリ
            if (id.includes('lucide-react') || id.includes('@radix-ui')) {
              return 'vendor-ui'
            }
            
            // テーブルライブラリ
            if (id.includes('@tanstack/react-table')) {
              return 'vendor-table'
            }
            
            // Supabase
            if (id.includes('@supabase')) {
              return 'vendor-supabase'
            }
            
            // ユーティリティ
            if (id.includes('date-fns') || id.includes('clsx')) {
              return 'vendor-utils'
            }
            
            // チャートライブラリ
            if (id.includes('chart.js') || id.includes('react-chartjs-2')) {
              return 'vendor-chart'
            }
            
            // エクスポートライブラリ
            if (id.includes('xlsx')) {
              return 'vendor-xlsx'
            }
            
            // その他の node_modules
            return 'vendor'
          }
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
