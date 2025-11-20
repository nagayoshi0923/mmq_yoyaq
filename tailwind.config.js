/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      // 375px対応：iPhone SE / 小型デバイス対応
      screens: {
        'xs': '375px',  // iPhone SE などの小型デバイス
        'sm': '640px',  // デフォルト sm ブレークポイント
      },
      spacing: {
        'safe': 'max(0.75rem, env(safe-area-inset-left))',
      },
      fontSize: {
        // スケジュール画面用：小さめな文字サイズ
        'xs': ['8px', { lineHeight: '1.2' }],       // バッジ用最小
        'sm': ['9px', { lineHeight: '1.3' }],       // 小コンテンツ用
        'base': ['10px', { lineHeight: '1.4' }],    // 標準コンテンツ用
        'lg': ['11px', { lineHeight: '1.5' }],      // 大コンテンツ用
        'xl': ['12px', { lineHeight: '1.6' }],      // 見出し用
        'schedule-xs': [
          ['8px', '9px', '10px'],
          { lineHeight: '1' }
        ],
        'schedule-sm': [
          ['9px', '10px', '11px'],
          { lineHeight: '1.2' }
        ],
        'schedule-base': [
          ['9px', '10px', '12px'],
          { lineHeight: '1.3' }
        ],
        'schedule-lg': [
          ['10px', '11px', '13px'],
          { lineHeight: '1.4' }
        ],
      },
      width: {
        // グローバルアイコンサイズ
        'icon-sm': ['6px', '7px', '8px'],            // 小（ユーザー、バッジ内アイコン）
        'icon-md': ['8px', '10px', '12px'],          // 中（警告アイコン）
        'icon-lg': ['12px', '14px', '16px'],         // 大（ナビゲーションアイコン）
      },
      height: {
        // グローバルアイコンサイズ
        'icon-sm': ['6px', '7px', '8px'],            // 小（ユーザー、バッジ内アイコン）
        'icon-md': ['8px', '10px', '12px'],          // 中（警告アイコン）
        'icon-lg': ['12px', '14px', '16px'],         // 大（ナビゲーションアイコン）
        // グローバルバッジサイズ
        'badge-default': ['16px', '16px', '16px'],  // デフォルト
        'badge-compact': ['12px', '12px', '12px'],  // 圧縮
      },
      gap: {
        // グローバルギャップ
        'default': '4px',                             // デフォルト（基本）
        'compact': '2px',                             // 圧縮（狭い）
        'relaxed': '8px',                             // ゆったり（広い）
      },
      padding: {
        // グローバルパディング（既存に追加）
        'default': '4px',                             // デフォルト
        'compact': '0px',                             // 圧縮
        'relaxed': '8px',                             // ゆったり
      },
      margin: {
        // グローバルマージン
        'default': '4px',                             // デフォルト
        'compact': '0px',                             // 圧縮
        'relaxed': '8px',                             // ゆったり
      },
      borderWidth: {
        // グローバルボーダー
        'default': '2px',                             // デフォルト
        'thin': '1px',                                // 細い
        'thick': '4px',                               // 太い
      },
      borderRadius: {
        // グローバルボーダーradius
        'default': '8px',                             // デフォルト
        'compact': '4px',                             // 圧縮
        'full': '9999px',                             // 完全な丸
      },
      lineHeight: {
        // グローバル行間
        'default': '1.25',                            // デフォルト（タイト）
        'compact': '1',                               // 圧縮（最小）
        'relaxed': '1.5',                             // ゆったり
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