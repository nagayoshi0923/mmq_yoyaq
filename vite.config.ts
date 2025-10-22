import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import path from 'path'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico'],
      manifest: {
        name: 'Queens Waltz - マーダーミステリー管理システム',
        short_name: 'Queens Waltz',
        description: 'マーダーミステリー店舗管理システム',
        theme_color: '#ffffff',
        icons: []
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,webp}'],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/.*\.supabase\.co\/.*/i,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'supabase-cache',
              expiration: {
                maxEntries: 50,
                maxAgeSeconds: 5 * 60 // 5分
              }
            }
          }
        ]
      }
    })
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
