/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      // ブレークポイント設定：シンプルな3段階
      screens: {
        'xs': '375px',   // モバイル（iPhone等）
        'md': '768px',   // タブレット（iPad等）
        'xl': '1280px',  // デスクトップ（PC）
      },
      spacing: {
        'safe': 'max(0.75rem, env(safe-area-inset-left))',
      },
      // グローバルスペーシング拡張（ブレークポイント対応）
      inset: {
        'full': '100%',
      },
      fontSize: {
        // シンプルな4段階（全サイズ4px上げ）
        'xs': ['16px', { lineHeight: '1.4' }],      // バッジ・補足
        'sm': ['18px', { lineHeight: '1.5' }],      // 小テキスト
        'base': ['22px', { lineHeight: '1.6' }],    // 本文（デフォルト、PC版基準）
        'lg': ['26px', { lineHeight: '1.4' }],      // 見出し
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