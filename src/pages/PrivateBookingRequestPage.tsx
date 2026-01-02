import { useState, useEffect } from 'react'
import { PrivateBookingRequest } from './PrivateBookingRequest/index'
import { scenarioApi, storeApi } from '@/lib/api'
import { useOrganization } from '@/hooks/useOrganization'
import { logger } from '@/utils/logger'

interface TimeSlot {
  label: string
  startTime: string
  endTime: string
}

export function PrivateBookingRequestPage() {
  const { organization } = useOrganization()
  const [loading, setLoading] = useState(true)
  const [scenario, setScenario] = useState<any>(null)
  const [stores, setStores] = useState<any[]>([])
  const [selectedStoreIds, setSelectedStoreIds] = useState<string[]>([])
  const [selectedTimeSlots, setSelectedTimeSlots] = useState<Array<{date: string, slot: TimeSlot}>>([])
  
  // 予約サイトのベースパス
  const bookingBasePath = organization?.slug ? `/${organization.slug}` : '/queens-waltz'
  
  // URLパラメータから情報を取得
  const urlParams = new URLSearchParams(window.location.hash.split('?')[1] || '')
  const scenarioId = urlParams.get('scenario') || ''
  const dateParam = urlParams.get('date') || ''
  const storeId = urlParams.get('store') || ''
  const slotParam = urlParams.get('slot') || ''
  
  // 日付を正しいフォーマットに変換
  const formatDate = (dateStr: string): string => {
    if (!dateStr) return ''
    // 時間帯文字列の場合は空文字を返す
    if (['morning', 'afternoon', 'evening'].includes(dateStr)) {
      return ''
    }
    // dateStrが数値のみの場合、現在の月の日付として扱う
    if (/^\d+$/.test(dateStr)) {
      const today = new Date()
      const year = today.getFullYear()
      const month = today.getMonth() + 1
      return `${year}-${String(month).padStart(2, '0')}-${String(dateStr).padStart(2, '0')}`
    }
    // YYYY-MM-DD形式かチェック
    if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
      return dateStr
    }
    return ''
  }
  
  const date = formatDate(dateParam)
  
  const slotMap: { [key: string]: TimeSlot } = {
    morning: { label: '午前', startTime: '09:00', endTime: '12:00' },
    afternoon: { label: '午後', startTime: '12:00', endTime: '17:00' },
    evening: { label: '夜間', startTime: '17:00', endTime: '22:00' }
  }

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    try {
      setLoading(true)
      
      // シナリオデータを取得
      const scenarios = await scenarioApi.getAll()
      const foundScenario = scenarios.find((s: any) => s.id === scenarioId)
      
      if (!foundScenario) {
        logger.error('シナリオが見つかりません')
        return
      }
      
      setScenario(foundScenario)
      
      // 店舗データを取得
      const storesData = await storeApi.getAll()
      setStores(storesData)
      
      // URLパラメータから選択済み店舗と時間帯を設定
      if (storeId) {
        setSelectedStoreIds([storeId])
      }
      
      // 日付が有効な場合のみ時間帯を設定
      if (date && date.match(/^\d{4}-\d{2}-\d{2}$/) && slotParam && slotMap[slotParam]) {
        setSelectedTimeSlots([
          {
            date: date,
            slot: slotMap[slotParam]
          }
        ])
      }
      
    } catch (error) {
      logger.error('データの読み込みエラー:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleBack = () => {
    window.history.back()
  }

  const handleComplete = () => {
    // 完了後の処理（トップページへ遷移など）
    window.location.href = bookingBasePath
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <p className="text-muted-foreground">読み込み中...</p>
      </div>
    )
  }

  if (!scenario) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center space-y-4">
          <p className="text-muted-foreground">シナリオが見つかりません</p>
          <button
            onClick={handleBack}
            className="text-primary hover:underline"
          >
            戻る
          </button>
        </div>
      </div>
    )
  }

  return (
    <PrivateBookingRequest
      scenarioTitle={scenario.title}
      scenarioId={scenario.id}
      participationFee={scenario.participation_fee || 0}
      maxParticipants={scenario.player_count_max || 8}
      selectedTimeSlots={selectedTimeSlots}
      selectedStoreIds={selectedStoreIds}
      stores={stores}
      onBack={handleBack}
      onComplete={handleComplete}
    />
  )
}

