/**
 * 開発用：デザインプレビューページ
 * @path /dev/design-preview
 * @purpose アクセントカラーとデザインバリエーションの検証
 */
import { useState } from 'react'
import { Search, ChevronRight, Users, Clock, Calendar, Building2, Heart, Sparkles, Star, Flame, Crown, Zap, Ghost, Moon, Eye } from 'lucide-react'

// アクセントカラーのプリセット（大幅増量）
const ACCENT_PRESETS = [
  // ゴールド系
  { name: 'ゴールド', value: '#FFB400', group: 'gold' },
  { name: 'シャンパン', value: '#F7E7CE', group: 'gold' },
  { name: 'ブロンズ', value: '#CD7F32', group: 'gold' },
  // パープル系
  { name: 'ディープパープル', value: '#7C3AED', group: 'purple' },
  { name: 'ロイヤルパープル', value: '#6B21A8', group: 'purple' },
  { name: 'ラベンダー', value: '#A78BFA', group: 'purple' },
  // ブルー系
  { name: 'ティール', value: '#0891B2', group: 'blue' },
  { name: 'サファイア', value: '#1D4ED8', group: 'blue' },
  { name: 'スカイ', value: '#38BDF8', group: 'blue' },
  // グリーン系
  { name: 'エメラルド', value: '#10B981', group: 'green' },
  { name: 'フォレスト', value: '#166534', group: 'green' },
  { name: 'ライム', value: '#84CC16', group: 'green' },
  // オレンジ/ピンク系
  { name: 'コーラル', value: '#F97316', group: 'warm' },
  { name: 'ローズ', value: '#EC4899', group: 'warm' },
  { name: 'マゼンタ', value: '#D946EF', group: 'warm' },
  // ダーク系
  { name: 'ダークネイビー', value: '#1E293B', group: 'dark' },
  { name: 'チャコール', value: '#374151', group: 'dark' },
  { name: 'オニキス', value: '#18181B', group: 'dark' },
]

// メインカラーのプリセット
const PRIMARY_PRESETS = [
  { name: 'MMQ Red', value: '#E60012' },
  { name: 'Material Red', value: '#F44336' },
  { name: 'Crimson', value: '#DC143C' },
  { name: 'Wine', value: '#722F37' },
  { name: 'Burgundy', value: '#800020' },
  { name: 'Blood Red', value: '#8B0000' },
]

// デザインスタイルのプリセット
type DesignStyle = 'nintendo' | 'luxury' | 'gothic' | 'neon' | 'minimal'

const DESIGN_STYLES: { id: DesignStyle; name: string; desc: string }[] = [
  { id: 'nintendo', name: '🔴 シャープ', desc: 'クリーン・シャープ' },
  { id: 'luxury', name: '👑 ラグジュアリー', desc: 'ゴールド・装飾的' },
  { id: 'gothic', name: '🦇 ゴシック', desc: 'ダーク・ミステリアス' },
  { id: 'neon', name: '⚡ ネオン', desc: 'グロー・サイバー' },
  { id: 'minimal', name: '◻️ ミニマル', desc: 'モノトーン・静謐' },
]

// ダミーデータ
const DUMMY_SCENARIOS = [
  { id: '1', title: '消えた令嬢と銀の時計塔', players: '6人', duration: '3h', org: 'MMQ新宿', date: '1/15', weekday: '水', seats: 3 },
  { id: '2', title: '黒薔薇館の殺人', players: '7人', duration: '4h', org: 'MMQ渋谷', date: '1/18', weekday: '土', seats: 1 },
  { id: '3', title: '最後の晩餐会', players: '5-6人', duration: '2.5h', org: 'MMQ池袋', date: '1/20', weekday: '月', seats: 4 },
  { id: '4', title: '深淵の囁き', players: '8人', duration: '5h', org: 'MMQ新宿', date: '1/22', weekday: '水', seats: 2 },
]

const DUMMY_ORGS = [
  { id: '1', name: 'MMQ新宿店', desc: '西新宿エリア' },
  { id: '2', name: 'MMQ渋谷店', desc: '渋谷駅徒歩3分' },
  { id: '3', name: 'MMQ池袋店', desc: '池袋東口' },
]

export function DesignPreview() {
  const [primaryColor, setPrimaryColor] = useState('#E60012')
  const [accentColor, setAccentColor] = useState('#FFB400')
  const [borderRadius, setBorderRadius] = useState(0)
  const [designStyle, setDesignStyle] = useState<DesignStyle>('nintendo')

  // 派生カラー
  const primaryLight = `${primaryColor}15`
  const accentLight = `${accentColor}20`

  // スタイル別の設定
  const getStyleConfig = () => {
    switch (designStyle) {
      case 'luxury':
        return {
          bgColor: '#0A0A0A',
          textColor: '#FAFAFA',
          cardBg: '#1A1A1A',
          borderColor: accentColor + '40',
          heroGradient: `linear-gradient(135deg, ${primaryColor} 0%, #1A0505 100%)`,
          accentGlow: `0 0 40px ${accentColor}40`,
          fontStyle: 'font-serif',
          decorative: true,
        }
      case 'gothic':
        return {
          bgColor: '#0D0D0D',
          textColor: '#E5E5E5',
          cardBg: '#1A1A1A',
          borderColor: '#333',
          heroGradient: `linear-gradient(180deg, #1A0A0A 0%, #0D0D0D 100%)`,
          accentGlow: 'none',
          fontStyle: 'font-serif',
          decorative: true,
        }
      case 'neon':
        return {
          bgColor: '#0A0A0F',
          textColor: '#FAFAFA',
          cardBg: '#12121A',
          borderColor: accentColor,
          heroGradient: `linear-gradient(135deg, #0A0A0F 0%, #1A0A1A 100%)`,
          accentGlow: `0 0 20px ${accentColor}, 0 0 40px ${accentColor}60`,
          fontStyle: 'font-mono',
          decorative: false,
        }
      case 'minimal':
        return {
          bgColor: '#FFFFFF',
          textColor: '#1A1A1A',
          cardBg: '#FFFFFF',
          borderColor: '#E5E5E5',
          heroGradient: primaryColor,
          accentGlow: 'none',
          fontStyle: 'font-sans',
          decorative: false,
        }
      default: // sharp
        return {
          bgColor: '#FAFAFA',
          textColor: '#1A1A1A',
          cardBg: '#FFFFFF',
          borderColor: '#E5E7EB',
          heroGradient: `linear-gradient(135deg, ${primaryColor} 0%, ${primaryColor}DD 100%)`,
          accentGlow: 'none',
          fontStyle: 'font-sans',
          decorative: false,
        }
    }
  }

  const config = getStyleConfig()

  // スタイル変更時にカラーも自動調整
  const handleStyleChange = (style: DesignStyle) => {
    setDesignStyle(style)
    switch (style) {
      case 'luxury':
        setPrimaryColor('#8B0000')
        setAccentColor('#FFB400')
        setBorderRadius(0)
        break
      case 'gothic':
        setPrimaryColor('#800020')
        setAccentColor('#A78BFA')
        setBorderRadius(0)
        break
      case 'neon':
        setPrimaryColor('#E60012')
        setAccentColor('#38BDF8')
        setBorderRadius(4)
        break
      case 'minimal':
        setPrimaryColor('#1A1A1A')
        setAccentColor('#E60012')
        setBorderRadius(2)
        break
      default:
        setPrimaryColor('#E60012')
        setAccentColor('#FFB400')
        setBorderRadius(0)
    }
  }

  return (
    <div className={`min-h-screen ${config.fontStyle}`} style={{ backgroundColor: config.bgColor, color: config.textColor }}>
      {/* コントロールパネル - 固定 */}
      <div className="fixed top-0 right-0 z-50 bg-white border-l border-b shadow-lg p-4 w-80 max-h-screen overflow-y-auto text-gray-900">
        <h3 className="font-bold text-sm mb-4 text-gray-800">🎨 デザインコントロール</h3>
        
        {/* デザインスタイル */}
        <div className="mb-4">
          <label className="text-xs font-medium text-gray-600 block mb-2">デザインスタイル</label>
          <div className="grid grid-cols-1 gap-1">
            {DESIGN_STYLES.map(style => (
              <button
                key={style.id}
                onClick={() => handleStyleChange(style.id)}
                className={`text-left text-xs px-3 py-2 rounded transition-all ${
                  designStyle === style.id 
                    ? 'bg-gray-900 text-white' 
                    : 'bg-gray-100 hover:bg-gray-200'
                }`}
              >
                <span className="font-medium">{style.name}</span>
                <span className="text-gray-500 ml-2">{style.desc}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="border-t pt-3 mb-4" />
        
        {/* メインカラー */}
        <div className="mb-4">
          <label className="text-xs font-medium text-gray-600 block mb-2">メインカラー</label>
          <div className="flex flex-wrap gap-1.5 mb-2">
            {PRIMARY_PRESETS.map(p => (
              <button
                key={p.value}
                onClick={() => setPrimaryColor(p.value)}
                className="w-7 h-7 border-2 transition-all hover:scale-110"
                style={{ 
                  backgroundColor: p.value,
                  borderColor: primaryColor === p.value ? '#000' : 'transparent',
                }}
                title={p.name}
              />
            ))}
            <input
              type="color"
              value={primaryColor}
              onChange={(e) => setPrimaryColor(e.target.value)}
              className="w-7 h-7 cursor-pointer"
            />
          </div>
          <div className="text-xs text-gray-500 font-mono">{primaryColor}</div>
        </div>

        {/* アクセントカラー */}
        <div className="mb-4">
          <label className="text-xs font-medium text-gray-600 block mb-2">アクセントカラー</label>
          <div className="space-y-2">
            {['gold', 'purple', 'blue', 'green', 'warm', 'dark'].map(group => (
              <div key={group} className="flex flex-wrap gap-1.5">
                {ACCENT_PRESETS.filter(p => p.group === group).map(p => (
                  <button
                    key={p.value}
                    onClick={() => setAccentColor(p.value)}
                    className="w-6 h-6 border-2 transition-all hover:scale-110"
                    style={{ 
                      backgroundColor: p.value,
                      borderColor: accentColor === p.value ? '#000' : 'transparent',
                    }}
                    title={p.name}
                  />
                ))}
              </div>
            ))}
            <input
              type="color"
              value={accentColor}
              onChange={(e) => setAccentColor(e.target.value)}
              className="w-7 h-7 cursor-pointer"
            />
          </div>
          <div className="text-xs text-gray-500 font-mono mt-1">{accentColor}</div>
        </div>

        {/* 角丸 */}
        <div className="mb-4">
          <label className="text-xs font-medium text-gray-600 block mb-2">
            角丸: {borderRadius}px
          </label>
          <input
            type="range"
            min="0"
            max="24"
            value={borderRadius}
            onChange={(e) => setBorderRadius(Number(e.target.value))}
            className="w-full"
          />
        </div>

        {/* カラーパレット表示 */}
        <div className="border-t pt-3">
          <div className="text-xs font-medium text-gray-600 mb-2">現在のパレット</div>
          <div className="flex gap-2">
            <div className="text-center">
              <div className="w-10 h-10 border" style={{ backgroundColor: primaryColor }} />
              <span className="text-[9px] text-gray-500">Primary</span>
            </div>
            <div className="text-center">
              <div className="w-10 h-10 border" style={{ backgroundColor: accentColor }} />
              <span className="text-[9px] text-gray-500">Accent</span>
            </div>
            <div className="text-center">
              <div className="w-10 h-10 border" style={{ backgroundColor: config.bgColor }} />
              <span className="text-[9px] text-gray-500">BG</span>
            </div>
            <div className="text-center">
              <div className="w-10 h-10 border" style={{ backgroundColor: config.cardBg }} />
              <span className="text-[9px] text-gray-500">Card</span>
            </div>
          </div>
        </div>
      </div>

      {/* ===== ヘッダー ===== */}
      <header 
        className="sticky top-0 z-40 backdrop-blur-sm"
        style={{ 
          backgroundColor: designStyle === 'minimal' ? '#FFFFFFEE' : config.bgColor + 'EE',
          borderBottom: `1px solid ${config.borderColor}`,
        }}
      >
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            {/* ロゴ */}
            {designStyle === 'luxury' && (
              <div className="relative">
                <Crown className="w-8 h-8" style={{ color: accentColor }} />
              </div>
            )}
            {designStyle === 'gothic' && (
              <Ghost className="w-8 h-8" style={{ color: accentColor }} />
            )}
            {designStyle === 'neon' && (
              <div style={{ filter: `drop-shadow(0 0 8px ${accentColor})` }}>
                <Zap className="w-8 h-8" style={{ color: accentColor }} />
              </div>
            )}
            {(designStyle === 'nintendo' || designStyle === 'minimal') && (
              <div 
                className="w-10 h-10 flex items-center justify-center font-bold text-white text-lg"
                style={{ backgroundColor: primaryColor, borderRadius: `${borderRadius}px` }}
              >
                M
              </div>
            )}
            <span className={`font-bold text-xl tracking-tight ${designStyle === 'luxury' ? 'tracking-widest uppercase text-sm' : ''}`}>
              {designStyle === 'luxury' ? 'MURDER MYSTERY QUEST' : 'MMQ'}
            </span>
          </div>
          <div className="flex items-center gap-3">
            <button 
              className="px-4 py-2 text-sm font-medium transition-all"
              style={{ 
                color: designStyle === 'neon' ? accentColor : primaryColor,
                textShadow: designStyle === 'neon' ? `0 0 10px ${accentColor}` : 'none',
              }}
            >
              ログイン
            </button>
            <button 
              className="px-4 py-2 text-sm font-medium text-white transition-all"
              style={{ 
                backgroundColor: primaryColor,
                borderRadius: `${borderRadius}px`,
                boxShadow: designStyle === 'neon' ? `0 0 15px ${primaryColor}` : 'none',
              }}
            >
              新規登録
            </button>
          </div>
        </div>
      </header>

      {/* ===== ヒーローセクション ===== */}
      <section 
        className="relative overflow-hidden"
        style={{ 
          background: config.heroGradient,
          color: '#FFFFFF',
        }}
      >
        {/* 装飾要素 */}
        {designStyle === 'luxury' && (
          <>
            <div className="absolute inset-0 opacity-10" style={{
              backgroundImage: `repeating-linear-gradient(45deg, ${accentColor} 0, ${accentColor} 1px, transparent 0, transparent 50%)`,
              backgroundSize: '20px 20px',
            }} />
            <div className="absolute top-0 left-0 w-full h-1" style={{ backgroundColor: accentColor }} />
            <div className="absolute bottom-0 left-0 w-full h-1" style={{ backgroundColor: accentColor }} />
            {/* コーナー装飾 */}
            <div className="absolute top-4 left-4 w-16 h-16 border-l-2 border-t-2" style={{ borderColor: accentColor }} />
            <div className="absolute top-4 right-4 w-16 h-16 border-r-2 border-t-2" style={{ borderColor: accentColor }} />
            <div className="absolute bottom-4 left-4 w-16 h-16 border-l-2 border-b-2" style={{ borderColor: accentColor }} />
            <div className="absolute bottom-4 right-4 w-16 h-16 border-r-2 border-b-2" style={{ borderColor: accentColor }} />
          </>
        )}
        {designStyle === 'gothic' && (
          <>
            <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-black/50" />
            <Moon className="absolute top-8 right-32 w-16 h-16 text-purple-400/20" />
            <Eye className="absolute bottom-8 left-16 w-8 h-8 text-purple-400/30" />
          </>
        )}
        {designStyle === 'neon' && (
          <>
            <div className="absolute inset-0" style={{
              backgroundImage: `linear-gradient(${accentColor}10 1px, transparent 1px), linear-gradient(90deg, ${accentColor}10 1px, transparent 1px)`,
              backgroundSize: '50px 50px',
            }} />
            <div className="absolute top-0 left-0 w-full h-px" style={{ backgroundColor: accentColor, boxShadow: `0 0 20px ${accentColor}` }} />
          </>
        )}
        
        <div className="max-w-7xl mx-auto px-4 py-16 md:py-24 relative mr-80">
          <div className="max-w-2xl">
            {/* アクセントバッジ */}
            <div 
              className={`inline-flex items-center gap-2 px-3 py-1 text-xs font-medium mb-6 ${designStyle === 'luxury' ? 'tracking-widest' : ''}`}
              style={{ 
                backgroundColor: designStyle === 'neon' ? 'transparent' : accentColor,
                color: designStyle === 'neon' ? accentColor : '#000',
                borderRadius: `${borderRadius}px`,
                border: designStyle === 'neon' ? `1px solid ${accentColor}` : 'none',
                boxShadow: designStyle === 'neon' ? config.accentGlow : 'none',
              }}
            >
              {designStyle === 'luxury' && <Crown className="w-3 h-3" />}
              {designStyle === 'gothic' && <Ghost className="w-3 h-3" />}
              {designStyle === 'neon' && <Zap className="w-3 h-3" />}
              {(designStyle === 'nintendo' || designStyle === 'minimal') && <Sparkles className="w-3 h-3" />}
              MURDER MYSTERY QUEST
            </div>
            
            <h1 className={`text-4xl md:text-6xl font-bold mb-4 ${designStyle === 'luxury' ? 'tracking-wide' : 'tracking-tight'}`}>
              {designStyle === 'gothic' ? (
                <>闇に潜む真実を<br />暴け</>
              ) : designStyle === 'luxury' ? (
                <>至高の謎解き<br />体験を</>
              ) : (
                <>マーダーミステリーを<br />探そう</>
              )}
            </h1>
            <p className="text-lg md:text-xl opacity-90 mb-8">
              {designStyle === 'gothic' 
                ? '深淵を覗くとき、深淵もまたこちらを覗いている'
                : designStyle === 'luxury'
                ? '厳選された物語で、特別なひとときを'
                : '様々な店舗のマーダーミステリーを検索・予約'
              }
            </p>

            <div className="flex flex-col sm:flex-row gap-3">
              <button 
                className="flex items-center justify-center gap-2 px-8 py-4 text-lg font-semibold transition-all hover:scale-[1.02]"
                style={{ 
                  backgroundColor: '#fff',
                  color: primaryColor,
                  borderRadius: `${borderRadius}px`,
                  boxShadow: designStyle === 'neon' ? `0 0 20px ${accentColor}40` : 'none',
                }}
              >
                <Search className="w-5 h-5" />
                シナリオを探す
              </button>
              <button 
                className="flex items-center justify-center gap-2 px-8 py-4 text-lg font-medium transition-colors"
                style={{ 
                  border: `2px solid ${designStyle === 'neon' ? accentColor : 'rgba(255,255,255,0.4)'}`,
                  borderRadius: `${borderRadius}px`,
                  boxShadow: designStyle === 'neon' ? config.accentGlow : 'none',
                }}
              >
                マイページ
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* ===== 公演ラインナップ ===== */}
      <section className="max-w-7xl mx-auto px-4 py-12 mr-80">
        <div className="flex items-center justify-between mb-8">
          <h2 className={`text-2xl font-bold flex items-center gap-3 ${designStyle === 'luxury' ? 'tracking-wider' : ''}`}>
            {designStyle === 'luxury' && <Star className="w-6 h-6" style={{ color: accentColor }} />}
            {designStyle === 'gothic' && <Flame className="w-6 h-6" style={{ color: accentColor }} />}
            {designStyle === 'neon' && <Zap className="w-6 h-6" style={{ color: accentColor, filter: `drop-shadow(0 0 5px ${accentColor})` }} />}
            {(designStyle === 'nintendo' || designStyle === 'minimal') && <Calendar className="w-6 h-6" style={{ color: primaryColor }} />}
            公演ラインナップ
            {/* アクセントライン */}
            <span 
              className="w-12 h-1 ml-2"
              style={{ 
                backgroundColor: accentColor,
                boxShadow: designStyle === 'neon' ? config.accentGlow : 'none',
              }}
            />
          </h2>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {DUMMY_SCENARIOS.map((scenario, idx) => (
            <div 
              key={scenario.id}
              className="group cursor-pointer overflow-hidden transition-all hover:scale-[1.02]"
              style={{ 
                backgroundColor: config.cardBg,
                border: `1px solid ${config.borderColor}`,
                borderRadius: `${borderRadius}px`,
                boxShadow: designStyle === 'neon' ? `0 0 0 1px ${accentColor}40` : 'none',
              }}
            >
              {/* キービジュアル */}
              <div 
                className="relative aspect-[3/4] overflow-hidden"
                style={{
                  background: designStyle === 'gothic' 
                    ? 'linear-gradient(180deg, #2A1A2A 0%, #1A0A1A 100%)'
                    : designStyle === 'luxury'
                    ? `linear-gradient(135deg, #1A1A1A 0%, ${primaryColor}20 100%)`
                    : 'linear-gradient(135deg, #E5E7EB 0%, #D1D5DB 100%)',
                }}
              >
                <div className="absolute inset-0 flex items-center justify-center">
                  {designStyle === 'gothic' ? (
                    <Ghost className="w-12 h-12 text-purple-400/40" />
                  ) : designStyle === 'luxury' ? (
                    <Crown className="w-12 h-12" style={{ color: accentColor + '40' }} />
                  ) : (
                    <Sparkles className="w-12 h-12 text-gray-400" />
                  )}
                </div>
                {/* お気に入りボタン */}
                <button 
                  className="absolute top-2 right-2 w-8 h-8 flex items-center justify-center transition-colors"
                  style={{ 
                    backgroundColor: designStyle === 'neon' ? '#0A0A0F' : config.cardBg + 'E6',
                    borderRadius: `${borderRadius}px`,
                    border: designStyle === 'neon' ? `1px solid ${accentColor}40` : 'none',
                  }}
                >
                  <Heart className="w-4 h-4" style={{ color: designStyle === 'neon' ? accentColor : '#9CA3AF' }} />
                </button>
                {/* アクセントタグ */}
                {idx === 0 && (
                  <div 
                    className="absolute bottom-0 left-0 px-3 py-1 text-xs font-bold flex items-center gap-1"
                    style={{ 
                      backgroundColor: accentColor,
                      color: '#000',
                      boxShadow: designStyle === 'neon' ? config.accentGlow : 'none',
                    }}
                  >
                    {designStyle === 'luxury' && <Crown className="w-3 h-3" />}
                    {designStyle === 'gothic' && <Flame className="w-3 h-3" />}
                    人気
                  </div>
                )}
              </div>

              {/* コンテンツ */}
              <div className="p-4">
                <h3 className="font-bold mb-2 line-clamp-2 transition-colors group-hover:opacity-80">
                  {scenario.title}
                </h3>

                <div className="flex items-center gap-4 text-xs opacity-60 mb-3">
                  <span className="flex items-center gap-1">
                    <Users className="w-3 h-3" />
                    {scenario.players}
                  </span>
                  <span className="flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    {scenario.duration}
                  </span>
                </div>

                {/* 次回公演 */}
                <div 
                  className="border-t pt-3 mt-3"
                  style={{ borderColor: config.borderColor }}
                >
                  <div className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2">
                      <span 
                        className="w-1 h-5"
                        style={{ 
                          backgroundColor: primaryColor,
                          boxShadow: designStyle === 'neon' ? `0 0 5px ${primaryColor}` : 'none',
                        }}
                      />
                      <span className="font-medium">
                        {scenario.date}
                        <span className={`ml-1 font-normal opacity-60`}>
                          ({scenario.weekday})
                        </span>
                      </span>
                      <span className="opacity-40">{scenario.org}</span>
                    </div>
                    <span 
                      className="text-xs font-bold px-2 py-0.5"
                      style={{ 
                        backgroundColor: scenario.seats <= 2 ? (designStyle === 'gothic' || designStyle === 'luxury' || designStyle === 'neon' ? '#7F1D1D' : '#FEE2E2') : accentLight,
                        color: scenario.seats <= 2 ? (designStyle === 'gothic' || designStyle === 'luxury' || designStyle === 'neon' ? '#FCA5A5' : '#DC2626') : accentColor,
                        borderRadius: `${borderRadius}px`,
                      }}
                    >
                      残{scenario.seats}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* もっと見るボタン */}
        <div className="text-center mt-8">
          <button 
            className="inline-flex items-center gap-2 px-6 py-3 font-medium transition-all hover:scale-[1.02]"
            style={{ 
              border: `2px solid ${designStyle === 'neon' ? accentColor : primaryColor}`,
              color: designStyle === 'neon' ? accentColor : primaryColor,
              borderRadius: `${borderRadius}px`,
              boxShadow: designStyle === 'neon' ? config.accentGlow : 'none',
            }}
          >
            すべてのシナリオを見る
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </section>

      {/* ===== 参加店舗 ===== */}
      <section className="py-12 mr-80" style={{ backgroundColor: designStyle === 'minimal' ? '#F5F5F5' : config.cardBg }}>
        <div className="max-w-7xl mx-auto px-4">
          <h2 className={`text-2xl font-bold mb-8 flex items-center gap-3 ${designStyle === 'luxury' ? 'tracking-wider' : ''}`}>
            <Building2 className="w-6 h-6" style={{ color: primaryColor }} />
            参加店舗
            <span 
              className="w-12 h-1 ml-2"
              style={{ 
                backgroundColor: accentColor,
                boxShadow: designStyle === 'neon' ? config.accentGlow : 'none',
              }}
            />
          </h2>
          
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {DUMMY_ORGS.map(org => (
              <div
                key={org.id}
                className="group cursor-pointer p-5 transition-all hover:scale-[1.02]"
                style={{ 
                  backgroundColor: config.bgColor,
                  border: `1px solid ${config.borderColor}`,
                  borderRadius: `${borderRadius}px`,
                  boxShadow: designStyle === 'neon' ? `0 0 0 1px ${accentColor}20` : 'none',
                }}
              >
                <div className="flex items-center gap-4">
                  <div 
                    className="w-14 h-14 flex items-center justify-center flex-shrink-0"
                    style={{ 
                      backgroundColor: primaryLight,
                      borderRadius: `${borderRadius}px`,
                      border: designStyle === 'luxury' ? `1px solid ${accentColor}40` : 'none',
                    }}
                  >
                    <Building2 className="w-7 h-7" style={{ color: primaryColor }} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold">
                      {org.name}
                    </h3>
                    <p className="text-sm opacity-50">{org.desc}</p>
                  </div>
                  <ChevronRight className="w-5 h-5 opacity-30 group-hover:opacity-60 transition-opacity" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ===== CTA ===== */}
      <section className="max-w-7xl mx-auto px-4 py-12 mr-80">
        <div 
          className="relative overflow-hidden p-10 md:p-16 text-white"
          style={{ 
            background: config.heroGradient,
            borderRadius: `${borderRadius}px`,
          }}
        >
          {/* 装飾 */}
          {designStyle === 'luxury' && (
            <>
              <div className="absolute top-4 left-4 w-12 h-12 border-l-2 border-t-2" style={{ borderColor: accentColor }} />
              <div className="absolute bottom-4 right-4 w-12 h-12 border-r-2 border-b-2" style={{ borderColor: accentColor }} />
            </>
          )}
          {designStyle === 'neon' && (
            <div className="absolute inset-0 border" style={{ borderColor: accentColor, boxShadow: config.accentGlow }} />
          )}
          
          <div className="relative text-center">
            <h2 className={`text-3xl md:text-4xl font-bold mb-4 ${designStyle === 'luxury' ? 'tracking-wide' : ''}`}>
              {designStyle === 'gothic' 
                ? '闇の世界へようこそ'
                : designStyle === 'luxury'
                ? '至高の体験が、あなたを待つ'
                : '今すぐシナリオを探そう'
              }
            </h2>
            <p className="opacity-90 mb-8 max-w-lg mx-auto">
              様々な店舗のマーダーミステリーを検索。<br />
              あなたにぴったりの物語を見つけましょう。
            </p>
            <button 
              className="inline-flex items-center gap-2 px-8 py-4 font-semibold transition-all hover:scale-[1.02]"
              style={{ 
                backgroundColor: '#fff',
                color: primaryColor,
                borderRadius: `${borderRadius}px`,
                boxShadow: designStyle === 'neon' ? `0 0 20px ${accentColor}40` : 'none',
              }}
            >
              シナリオを探す
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>
        </div>
      </section>

      {/* ===== フッター ===== */}
      <footer 
        className="py-10 mr-80"
        style={{ 
          backgroundColor: designStyle === 'minimal' ? '#1A1A1A' : '#0A0A0A',
          color: '#9CA3AF',
        }}
      >
        <div className="max-w-7xl mx-auto px-4">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              {designStyle === 'luxury' && <Crown className="w-5 h-5" style={{ color: accentColor }} />}
              <span className="font-bold text-white">MMQ</span>
            </div>
            <p className="text-sm">© 2024 MMQ. All rights reserved.</p>
          </div>
        </div>
      </footer>
    </div>
  )
}

export default DesignPreview
