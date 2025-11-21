/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      // ブレークポイント設定：モバイル・タブレット・デスクトップ対応
      screens: {
        'xs': '375px',   // iPhone SE などの小型デバイス
        'sm': '390px',   // iPhone 15/16 などの大型iPhone
        'md': '640px',   // タブレット小（iPad mini）
        'lg': '768px',   // タブレット標準（iPad）
        'xl': '1024px',  // 大画面（iPad Pro / PC）
        '2xl': '1280px', // PC標準
      },
      spacing: {
        'safe': 'max(0.75rem, env(safe-area-inset-left))',
      },
      // グローバルスペーシング拡張（ブレークポイント対応）
      inset: {
        'full': '100%',
      },
      fontSize: {
        // グローバル文字サイズ（xs/375→sm/390→md/640→lg/768→xl/1024→2xl/1280）
        // PC(2xl/1280px)を基準に逆算、モバイルファースト
        'xs': [
          ['8px', '8px', '8px', '10px', '11px', '11px', '11px'],
          { lineHeight: '1.2' }
        ],                                          // バッジ用最小
        'sm': [
          ['9px', '11px', '12px', '13px', '14px', '15px', '15px'],
          { lineHeight: '1.3' }
        ],                                          // 小コンテンツ用
        'base': [
          ['11px', '13px', '14px', '15px', '17px', '18px', '19px'],
          { lineHeight: '1.4' }
        ],                                          // デフォルト用
        'lg': [
          ['12px', '14px', '15px', '16px', '19px', '21px', '22px'],
          { lineHeight: '1.5' }
        ],                                          // 大コンテンツ用
        'xl': [
          ['13px', '15px', '16px', '18px', '21px', '23px', '25px'],
          { lineHeight: '1.6' }
        ],                                          // 見出し用
        'schedule-xs': [
          ['8px', '8px', '9px', '10px', '10px', '10px', '10px'],
          { lineHeight: '1' }
        ],                                          // スケジュール最小
        'schedule-sm': [
          ['9px', '9px', '10px', '11px', '11px', '12px', '12px'],
          { lineHeight: '1.2' }
        ],
        'schedule-base': [
          ['9px', '9px', '10px', '12px', '12px', '13px', '14px'],
          { lineHeight: '1.3' }
        ],
        'schedule-lg': [
          ['10px', '10px', '11px', '13px', '13px', '14px', '15px'],
          { lineHeight: '1.4' }
        ],
        'badge': [
          ['8px', '8px', '9px', '9px', '9px', '9px', '9px'],
          { lineHeight: '1' }
        ],                                          // バッジテキスト
      },
      width: {
        // グローバルアイコンサイズ（xs/375→sm/390→md/640→lg/768→xl/1024→2xl/1280）
        'icon-sm': ['6px', '7px', '7px', '8px', '8px', '8px', '8px'],            // 小
        'icon-md': ['8px', '9px', '9px', '10px', '12px', '12px', '12px'],        // 中
        'icon-lg': ['12px', '13px', '13px', '14px', '16px', '18px', '18px'],     // 大
      },
      height: {
        // グローバルアイコンサイズ
        'icon-sm': ['6px', '7px', '7px', '8px', '8px', '8px', '8px'],            // 小
        'icon-md': ['8px', '9px', '9px', '10px', '12px', '12px', '12px'],        // 中
        'icon-lg': ['12px', '13px', '13px', '14px', '16px', '18px', '18px'],     // 大
        // グローバルバッジサイズ
        'badge-default': ['16px', '17px', '18px', '18px', '20px', '22px', '24px'], // デフォルト
        'badge-compact': ['12px', '13px', '14px', '14px', '16px', '18px', '20px'], // 圧縮
      },
      gap: {
        // グローバルギャップ（xs/375→sm/390→md/640→lg/768→xl/1024→2xl/1280）
        'default': ['2px', '2px', '3px', '4px', '4px', '4px', '4px'],       // デフォルト
        'compact': ['1px', '1px', '1.5px', '2px', '2px', '2px', '2px'],     // 圧縮
        'relaxed': ['4px', '4px', '5px', '6px', '8px', '8px', '8px'],       // ゆったり
      },
      padding: {
        // グローバルパディング
        'default': ['2px', '2px', '3px', '4px', '4px', '4px', '4px'],       // デフォルト
        'compact': ['0px', '0px', '0px', '0px', '0px', '0px', '0px'],       // 圧縮
        'relaxed': ['4px', '4px', '5px', '6px', '8px', '8px', '8px'],       // ゆったり
      },
      margin: {
        // グローバルマージン
        'default': ['2px', '2px', '3px', '4px', '4px', '4px', '4px'],       // デフォルト
        'compact': ['0px', '0px', '0px', '0px', '0px', '0px', '0px'],       // 圧縮
        'relaxed': ['4px', '4px', '5px', '6px', '8px', '8px', '8px'],       // ゆったり
      },
      borderWidth: {
        // グローバルボーダー（xs/375→sm/390→md/640→lg/768→xl/1024→2xl/1280）
        'default': ['1px', '1px', '1px', '2px', '2px', '2px', '2px'],       // デフォルト
        'thin': ['1px', '1px', '1px', '1px', '1px', '1px', '1px'],          // 細い
        'thick': ['2px', '2px', '2px', '3px', '4px', '4px', '4px'],         // 太い
      },
      borderRadius: {
        // グローバルボーダーradius
        'default': ['6px', '6px', '6px', '8px', '8px', '8px', '8px'],       // デフォルト
        'compact': ['3px', '3px', '3px', '4px', '4px', '4px', '4px'],       // 圧縮
        'full': '9999px',                                                     // 完全な丸
      },
      lineHeight: {
        // グローバル行間（全ブレークポイント同じ）
        'default': '1.25',                                                  // デフォルト
        'compact': '1',                                                     // 圧縮
        'relaxed': '1.5',                                                   // ゆったり
      },
      maxWidth: {
        // グローバル最大幅（コンテナ）
        'container-default': ['100%', '100%', '100%', '100%', '1024px', '1280px', '1536px'], // ページ最大幅
      },
      minHeight: {
        // グローバル最小高さ（ボタン等）
        'button-default': ['32px', '36px', '36px', '40px', '40px', '40px', '40px'],  // ボタンデフォルト
        'input-default': ['32px', '36px', '36px', '40px', '40px', '40px', '40px'],   // 入力フィールド
      },
      boxShadow: {
        // グローバルシャドウ
        'default': '0 1px 2px 0 rgba(0, 0, 0, 0.05)',                       // 薄い影
        'md': '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -2px rgba(0, 0, 0, 0.1)', // 中
        'lg': '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -4px rgba(0, 0, 0, 0.1)', // 大
      },
      transition: {
        // グローバルトランジション
        'default': 'all 0.2s ease-in-out',                                 // デフォルト
        'fast': 'all 0.15s ease-in-out',                                    // 高速
        'slow': 'all 0.3s ease-in-out',                                     // 低速
      },
      opacity: {
        // グローバル透明度（よく使うもの）
        '5': '0.05',
        '10': '0.1',
        '15': '0.15',
        '25': '0.25',
        '50': '0.5',
        '75': '0.75',
        '90': '0.9',
        '95': '0.95',
      },
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        // グローバルカラー（ステータス・バッジ用）
        'status': {
          'success': '#16a34a',      // 緑
          'warning': '#ea580c',      // オレンジ
          'error': '#dc2626',        // 赤
          'info': '#0284c7',         // 青
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
      },
    },
  },
  plugins: [],
}