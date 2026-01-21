import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { 
  X, Search, Calendar, MousePointerClick, CheckCircle, 
  HelpCircle, ChevronRight, Clock, Users, MapPin 
} from 'lucide-react'
import { MYPAGE_THEME as THEME } from '@/lib/theme'

const STORAGE_KEY = 'mmq_has_seen_guide'

interface HowToUseGuideProps {
  organizationName?: string | null
  isOpen: boolean
  onClose: () => void
}

/**
 * 予約の使い方ガイドコンポーネント
 * - 初回訪問時は自動表示
 * - いつでも「?」ボタンから再表示可能
 */
export function HowToUseGuide({ organizationName, isOpen, onClose }: HowToUseGuideProps) {
  if (!isOpen) return null

  const steps = [
    {
      icon: Search,
      title: '1. シナリオを探す',
      description: '気になるシナリオをラインナップから選ぶか、カレンダーから日程で探します。',
    },
    {
      icon: MousePointerClick,
      title: '2. 公演を選択',
      description: 'シナリオ詳細ページで、参加したい日程と人数を選びます。',
    },
    {
      icon: CheckCircle,
      title: '3. 予約確定',
      description: 'お名前・連絡先を入力して予約完了。確認メールが届きます。',
    },
  ]

  const handleClose = () => {
    // 閉じた時に「見た」フラグを設定
    localStorage.setItem(STORAGE_KEY, 'true')
    onClose()
  }

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-2 sm:p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200"
      onClick={handleClose}
    >
      <Card
        className="w-full max-w-lg bg-white shadow-2xl border-0 overflow-hidden max-h-[90vh] flex flex-col"
        onClick={(event) => event.stopPropagation()}
      >
        {/* ヘッダー（固定） */}
        <div 
          className="px-4 sm:px-6 py-3 sm:py-4 text-white flex items-center justify-between flex-shrink-0"
          style={{ backgroundColor: THEME.primary }}
        >
          <div className="flex items-center gap-2">
            <HelpCircle className="w-4 h-4 sm:w-5 sm:h-5" />
            <h2 className="text-base sm:text-lg font-bold">予約の仕方</h2>
          </div>
          <button 
            onClick={handleClose}
            className="p-1.5 hover:bg-white/20 transition-colors rounded"
            aria-label="閉じる"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <CardContent className="p-4 sm:p-6 overflow-y-auto flex-1">
          {/* ウェルカムメッセージ */}
          <div className="text-center mb-4 sm:mb-6">
            <p className="text-sm sm:text-base text-gray-600">
              {organizationName || 'MMQ'}へようこそ！
              <br />
              <span className="font-medium text-gray-900">3ステップで簡単に予約できます。</span>
            </p>
          </div>

          {/* ステップ説明 */}
          <div className="space-y-2 sm:space-y-4">
            {steps.map((step, index) => {
              const Icon = step.icon
              return (
                <div 
                  key={index}
                  className="flex items-start gap-3 sm:gap-4 p-3 sm:p-4 bg-gray-50 border border-gray-100"
                >
                  <div 
                    className="flex-shrink-0 w-8 h-8 sm:w-10 sm:h-10 flex items-center justify-center"
                    style={{ backgroundColor: THEME.accentLight, color: THEME.primary }}
                  >
                    <Icon className="w-4 h-4 sm:w-5 sm:h-5" />
                  </div>
                  <div className="min-w-0">
                    <h3 className="font-medium text-sm sm:text-base text-gray-900">{step.title}</h3>
                    <p className="text-xs sm:text-sm text-gray-600 mt-0.5 sm:mt-1">{step.description}</p>
                  </div>
                </div>
              )
            })}
          </div>

          {/* 追加情報（モバイルではコンパクト） */}
          <div className="mt-4 sm:mt-6 p-3 sm:p-4 bg-amber-50 border border-amber-200">
            <h4 className="font-medium text-amber-800 mb-1.5 sm:mb-2 text-sm sm:text-base">💡 知っておくと便利</h4>
            <ul className="text-xs sm:text-sm text-amber-700 space-y-1">
              <li className="flex items-center gap-2">
                <Calendar className="w-3.5 h-3.5 sm:w-4 sm:h-4 flex-shrink-0" />
                <span>「カレンダー」タブで日程から探せます</span>
              </li>
              <li className="flex items-center gap-2">
                <Clock className="w-3.5 h-3.5 sm:w-4 sm:h-4 flex-shrink-0" />
                <span>満席時はキャンセル待ち登録可能</span>
              </li>
              <li className="flex items-center gap-2">
                <Users className="w-3.5 h-3.5 sm:w-4 sm:h-4 flex-shrink-0" />
                <span>貸切予約も可能（要事前リクエスト）</span>
              </li>
            </ul>
          </div>

          {/* 閉じるボタン */}
          <div className="mt-4 sm:mt-6 flex justify-center">
            <Button 
              onClick={handleClose}
              className="px-6 sm:px-8 text-sm sm:text-base"
              style={{ backgroundColor: THEME.primary, borderRadius: 0 }}
            >
              予約を始める
              <ChevronRight className="w-4 h-4 ml-1" />
            </Button>
          </div>

          <p className="text-center text-[10px] sm:text-xs text-gray-400 mt-3 sm:mt-4">
            いつでも「?」ボタンから再表示できます
          </p>
        </CardContent>
      </Card>
    </div>
  )
}

/**
 * 使い方ガイドを開くボタン（常時表示用）
 */
interface HowToUseButtonProps {
  onClick: () => void
}

export function HowToUseButton({ onClick }: HowToUseButtonProps) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-1 px-2 py-1 text-xs font-medium text-gray-500 hover:text-gray-700 hover:bg-gray-100 transition-colors"
      title="使い方を見る"
    >
      <HelpCircle className="w-4 h-4" />
      <span className="hidden sm:inline">使い方</span>
    </button>
  )
}

/**
 * 初回訪問かどうかをチェックするフック
 */
export function useHowToUseGuide() {
  const [isGuideOpen, setIsGuideOpen] = useState(false)
  const [isFirstVisit, setIsFirstVisit] = useState(false)

  useEffect(() => {
    // 初回訪問かどうかをチェック
    const hasSeen = localStorage.getItem(STORAGE_KEY)
    if (!hasSeen) {
      setIsFirstVisit(true)
      // 少し遅延してからガイドを表示（ページロード後）
      const timer = setTimeout(() => {
        setIsGuideOpen(true)
      }, 500)
      return () => clearTimeout(timer)
    }
  }, [])

  const openGuide = () => setIsGuideOpen(true)
  const closeGuide = () => setIsGuideOpen(false)

  return {
    isGuideOpen,
    isFirstVisit,
    openGuide,
    closeGuide,
  }
}

