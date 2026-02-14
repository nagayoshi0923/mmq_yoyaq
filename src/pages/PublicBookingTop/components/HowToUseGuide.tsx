import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { 
  X, Search, Calendar, MousePointerClick, CheckCircle, 
  HelpCircle, ChevronRight, Clock, Users, MapPin, Store
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
        {/* ヘッダー */}
        <div 
          className="px-4 sm:px-6 py-3 sm:py-4 text-white flex items-center justify-between flex-shrink-0"
          style={{ backgroundColor: THEME.primary }}
        >
          <div className="flex items-center gap-2">
            <HelpCircle className="w-4 h-4 sm:w-5 sm:h-5" />
            <h2 className="text-base sm:text-lg font-bold">ご予約ガイド</h2>
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
          <div className="text-center mb-5 sm:mb-6">
            <p className="text-base sm:text-lg font-bold text-gray-900 mb-1">
              {organizationName || 'MMQ'}へようこそ！
            </p>
            <p className="text-xs sm:text-sm text-gray-500">
              かんたん3ステップで予約できます
            </p>
          </div>

          {/* ステップ説明 */}
          <div className="space-y-0">
            {/* Step 1 */}
            <div className="flex gap-3 sm:gap-4">
              <div className="flex flex-col items-center">
                <div 
                  className="flex-shrink-0 w-9 h-9 sm:w-10 sm:h-10 rounded-full flex items-center justify-center text-white font-bold text-sm"
                  style={{ backgroundColor: THEME.primary }}
                >
                  1
                </div>
                <div className="w-0.5 flex-1 bg-gray-200 my-1" />
              </div>
              <div className="pb-5">
                <h3 className="font-bold text-sm sm:text-base text-gray-900">シナリオを探す</h3>
                <p className="text-xs sm:text-sm text-gray-500 mt-1 leading-relaxed">
                  「ラインナップ」タブでシナリオ一覧から選べます。
                  <br />
                  「カレンダー」タブでは日程から空き状況を確認できます。
                </p>
              </div>
            </div>

            {/* Step 2 */}
            <div className="flex gap-3 sm:gap-4">
              <div className="flex flex-col items-center">
                <div 
                  className="flex-shrink-0 w-9 h-9 sm:w-10 sm:h-10 rounded-full flex items-center justify-center text-white font-bold text-sm"
                  style={{ backgroundColor: THEME.primary }}
                >
                  2
                </div>
                <div className="w-0.5 flex-1 bg-gray-200 my-1" />
              </div>
              <div className="pb-5">
                <h3 className="font-bold text-sm sm:text-base text-gray-900">公演を選んで予約</h3>
                <p className="text-xs sm:text-sm text-gray-500 mt-1 leading-relaxed">
                  シナリオ詳細ページから参加したい日程・人数を選択します。
                </p>
              </div>
            </div>

            {/* Step 3 */}
            <div className="flex gap-3 sm:gap-4">
              <div className="flex flex-col items-center">
                <div 
                  className="flex-shrink-0 w-9 h-9 sm:w-10 sm:h-10 rounded-full flex items-center justify-center text-white font-bold text-sm"
                  style={{ backgroundColor: THEME.primary }}
                >
                  3
                </div>
              </div>
              <div className="pb-2">
                <h3 className="font-bold text-sm sm:text-base text-gray-900">予約完了！</h3>
                <p className="text-xs sm:text-sm text-gray-500 mt-1 leading-relaxed">
                  お名前・連絡先を入力して送信。確認メールが届きます。
                </p>
              </div>
            </div>
          </div>

          {/* 便利機能 */}
          <div className="mt-4 sm:mt-5 rounded-lg bg-gray-50 border border-gray-200 divide-y divide-gray-200">
            <div className="px-3 sm:px-4 py-2.5 sm:py-3 flex items-start gap-2.5">
              <Calendar className="w-4 h-4 text-gray-400 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-xs sm:text-sm font-medium text-gray-700">カレンダーで空き確認</p>
                <p className="text-[11px] sm:text-xs text-gray-400 mt-0.5">店舗プルダウンで絞り込むと、その店舗の空き枠と貸切可能な日時が表示されます</p>
              </div>
            </div>
            <div className="px-3 sm:px-4 py-2.5 sm:py-3 flex items-start gap-2.5">
              <Users className="w-4 h-4 text-gray-400 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-xs sm:text-sm font-medium text-gray-700">貸切予約</p>
                <p className="text-[11px] sm:text-xs text-gray-400 mt-0.5">お好きなシナリオを、お仲間だけで楽しめるプランです。カレンダーの空き枠にある「貸切申込」ボタンから日時・店舗を選んでリクエストできます</p>
              </div>
            </div>
            <div className="px-3 sm:px-4 py-2.5 sm:py-3 flex items-start gap-2.5">
              <Clock className="w-4 h-4 text-gray-400 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-xs sm:text-sm font-medium text-gray-700">キャンセル待ち</p>
                <p className="text-[11px] sm:text-xs text-gray-400 mt-0.5">満席の公演でもキャンセル待ち登録ができます</p>
              </div>
            </div>
          </div>

          {/* 閉じるボタン */}
          <div className="mt-5 sm:mt-6 flex justify-center">
            <Button 
              onClick={handleClose}
              className="w-full sm:w-auto px-8 py-2.5 text-sm sm:text-base font-medium rounded-lg"
              style={{ backgroundColor: THEME.primary }}
            >
              予約を始める
              <ChevronRight className="w-4 h-4 ml-1" />
            </Button>
          </div>

          <p className="text-center text-[10px] sm:text-xs text-gray-400 mt-3">
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

