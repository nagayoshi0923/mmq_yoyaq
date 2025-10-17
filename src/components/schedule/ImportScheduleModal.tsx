import { useState } from 'react'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { supabase } from '@/lib/supabase'
import { AlertCircle, CheckCircle2, Loader2 } from 'lucide-react'

interface ImportScheduleModalProps {
  isOpen: boolean
  onClose: () => void
  onImportComplete: () => void
}

// 店舗名→store_id のマッピング
const STORE_MAPPING: Record<string, string> = {
  "大久保": "bef973a7-faa2-466d-afcc-c6466f24474f",
  "馬場": "45e39d14-061f-4d01-ae8a-5d4f8893e3cd",
  "別館①": "0269032f-6059-440b-a429-9a56dbb027be",
  "別館②": "95ac6d74-56df-4cac-a67f-59fff9ab89b9",
  "大塚": "f94256c3-e992-4723-b965-9df5cd54ea81",
  "埼玉大宮": "8a254b6d-9293-42c6-b634-e872c83fc4fd",
  "京都出張": null  // 出張はstore_idなし（offsite）
}

export function ImportScheduleModal({ isOpen, onClose, onImportComplete }: ImportScheduleModalProps) {
  const [scheduleText, setScheduleText] = useState('')
  const [isImporting, setIsImporting] = useState(false)
  const [result, setResult] = useState<{ success: number; failed: number; errors: string[] } | null>(null)

  // カテゴリを判定
  const determineCategory = (title: string): string => {
    if (title.startsWith('貸・')) return 'private'
    if (title.startsWith('募・')) return 'open'
    if (title.includes('GMテスト') || title.includes('テスト')) return 'gmtest'
    if (title.includes('テストプレイ') || title.includes('テスプ')) return 'testplay'
    if (title.startsWith('出張・')) return 'offsite'
    if (title.includes('MTG')) return 'gmtest'
    return 'open'
  }

  // シナリオ名を抽出
  const extractScenarioName = (title: string): string => {
    if (!title || title.trim() === '') return ''
    
    // プレフィックスを除去
    let text = title.replace(/^(貸・|募・|出張・|GMテスト・|テストプレイ・)/, '')
    
    // MTGの場合
    if (text.includes('MTG')) return 'MTG（マネージャーミーティング）'
    
    // 時間表記の括弧で区切って、最初の部分（シナリオ名）のみを取得
    const match = text.match(/^([^(（]+)/)
    if (match) {
      text = match[1].trim()
    }
    
    // 記号の前で切る
    text = text.split('※')[0]
    text = text.split('✅')[0]
    text = text.split('🈵')[0]
    
    return text.trim()
  }

  // 予約情報を抽出
  const extractReservationInfo = (title: string): string | undefined => {
    const infoParts: string[] = []
    
    // お客様名を抽出
    const customerMatch = title.match(/([^(]+様)/)
    if (customerMatch) {
      const customer = customerMatch[1].replace(/\d+円/g, '').trim()
      infoParts.push(customer)
    }
    
    // 価格を抽出
    const priceMatch = title.match(/(\d+円)/)
    if (priceMatch) {
      infoParts.push(priceMatch[1])
    }
    
    return infoParts.length > 0 ? infoParts.join(' / ') : undefined
  }

  // 注記を抽出
  const extractNotes = (title: string): string | undefined => {
    const notes: string[] = []
    
    if (title.includes('※')) {
      const noteMatch = title.match(/※([^※]+)/)
      if (noteMatch) notes.push('※' + noteMatch[1].trim())
    }
    
    if (title.includes('✅')) notes.push('告知済み')
    if (title.includes('🈵')) notes.push('満席')
    if (title.includes('🙅‍♀️') || title.includes('🙅')) notes.push('中止')
    
    if (title.includes('@') && title.includes('人')) {
      const participantMatch = title.match(/@(\d+)(?:人)?/)
      if (participantMatch) notes.push(`参加者募集中(@${participantMatch[1]})`)
    }
    
    if (title.includes('指定')) notes.push('GM指定')
    if (title.includes('見学')) notes.push('見学あり')
    
    return notes.length > 0 ? notes.join(' / ') : undefined
  }

  // 中止かどうかを判定
  const isCancelled = (title: string): boolean => {
    return title.includes('🙅‍♀️') || title.includes('🙅')
  }

  // GM名を解析
  const parseGmNames = (gmText: string): string[] => {
    if (!gmText || gmText.trim() === '') return []
    
    // 括弧内の情報を除去
    let text = gmText.replace(/\([^)]+\)/g, '').replace(/（[^）]+）/g, '')
    
    // 絵文字を除去
    text = text.replace(/[🈵✅@]/g, '')
    
    // 矢印で分割（GM変更の場合）
    if (text.includes('→')) {
      text = text.split('→').pop() || ''
    }
    
    // カンマやスラッシュで分割
    const gms = text.split(/[,、/]/)
    
    return gms.map(gm => gm.trim()).filter(gm => gm)
  }

  // 時間を抽出
  const parseTimeFromTitle = (title: string): { start: string; end: string } | null => {
    const timeMatch = title.match(/\((\d+(?:\.\d+)?)-(\d+(?:\.\d+)?)\)/)
    if (timeMatch) {
      const start = parseFloat(timeMatch[1])
      const end = parseFloat(timeMatch[2])
      
      const startHour = Math.floor(start)
      const startMin = Math.round((start - startHour) * 60)
      const endHour = Math.floor(end)
      const endMin = Math.round((end - endHour) * 60)
      
      return {
        start: `${startHour.toString().padStart(2, '0')}:${startMin.toString().padStart(2, '0')}`,
        end: `${endHour.toString().padStart(2, '0')}:${endMin.toString().padStart(2, '0')}`
      }
    }
    return null
  }

  // 日付を解析
  const parseDate = (dateStr: string): string => {
    if (!dateStr || !dateStr.includes('/')) {
      return ''
    }
    const parts = dateStr.split('/')
    if (parts.length !== 2) {
      return ''
    }
    const month = parts[0].trim()
    const day = parts[1].trim()
    if (!month || !day) {
      return ''
    }
    return `2025-${month.padStart(2, '0')}-${day.padStart(2, '0')}`
  }

  // インポート処理
  const handleImport = async () => {
    setIsImporting(true)
    setResult(null)

    try {
      const lines = scheduleText.trim().split('\n')
      const events: any[] = []
      const errors: string[] = []

      let currentDate = ''
      let currentWeekday = ''

      for (const line of lines) {
        if (!line.trim()) continue

        const parts = line.split('\t').map(p => p.trim())
        if (parts.length < 4) continue

        // 日付が入っている場合は更新、空の場合は前の日付を使う
        const dateStr = parts[0]
        if (dateStr && dateStr.includes('/')) {
          currentDate = dateStr
          currentWeekday = parts[1]
        }
        
        // 日付がない場合はスキップ
        if (!currentDate) continue
        
        const venue = parts[3]
        if (!venue) continue

        // 時間帯別のデータを処理
        const timeSlots = [
          { titleIdx: 4, gmIdx: 5, defaultStart: '09:00', defaultEnd: '13:00' },
          { titleIdx: 6, gmIdx: 7, defaultStart: currentWeekday === '土' || currentWeekday === '日' ? '14:00' : '13:00', defaultEnd: '18:00' },
          { titleIdx: 8, gmIdx: 9, defaultStart: '19:00', defaultEnd: '23:00' }
        ]

        for (const slot of timeSlots) {
          const title = parts[slot.titleIdx]
          if (!title || title.trim() === '') continue

          const gmText = parts[slot.gmIdx] || ''
          const times = parseTimeFromTitle(title)
          const storeId = STORE_MAPPING[venue]

          const event = {
            date: parseDate(currentDate),
            venue,
            store_id: storeId,
            scenario: extractScenarioName(title),
            gms: parseGmNames(gmText),
            start_time: times?.start || slot.defaultStart,
            end_time: times?.end || slot.defaultEnd,
            category: determineCategory(title),
            reservation_info: extractReservationInfo(title),
            notes: extractNotes(title),
            is_cancelled: isCancelled(title)
          }

          events.push(event)
        }
      }

      // データベースに挿入
      let successCount = 0
      let failedCount = 0

      for (const event of events) {
        try {
          const { error } = await supabase
            .from('schedule_events')
            .insert(event)

          if (error) {
            failedCount++
            errors.push(`${event.date} ${event.venue} - ${event.scenario}: ${error.message}`)
          } else {
            successCount++
          }
        } catch (err) {
          failedCount++
          errors.push(`${event.date} ${event.venue} - ${event.scenario}: ${String(err)}`)
        }
      }

      setResult({ success: successCount, failed: failedCount, errors })

      if (failedCount === 0) {
        setTimeout(() => {
          onImportComplete()
          handleClose()
        }, 2000)
      }
    } catch (error) {
      setResult({ 
        success: 0, 
        failed: 0, 
        errors: [`解析エラー: ${error instanceof Error ? error.message : String(error)}`] 
      })
    } finally {
      setIsImporting(false)
    }
  }

  const handleClose = () => {
    setScheduleText('')
    setResult(null)
    onClose()
  }

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>スケジュールデータのインポート</DialogTitle>
          <DialogDescription>
            スプレッドシートからコピーしたデータを貼り付けてください（タブ区切り形式）
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <label className="text-sm font-medium mb-2 block">
              スケジュールデータ（Excel/Googleスプレッドシートからコピー）
            </label>
            <Textarea
              value={scheduleText}
              onChange={(e) => setScheduleText(e.target.value)}
              placeholder="11/1&#9;土&#9;ジノ&#9;馬場&#9;GMテスト・エイダ（9-13)3000円&#9;渚咲(そら）🈵..."
              className="min-h-[300px] font-mono text-xs"
              disabled={isImporting}
            />
            <p className="text-xs text-gray-500 mt-2">
              ※ スプレッドシートで範囲を選択してコピー（Ctrl+C / Cmd+C）し、ここに貼り付けてください
            </p>
          </div>

          {result && (
            <Alert variant={result.failed > 0 ? "destructive" : "default"}>
              {result.failed > 0 ? (
                <AlertCircle className="h-4 w-4" />
              ) : (
                <CheckCircle2 className="h-4 w-4" />
              )}
              <AlertDescription>
                <div className="font-semibold mb-2">
                  インポート完了: 成功 {result.success}件 / 失敗 {result.failed}件
                </div>
                {result.errors.length > 0 && (
                  <div className="mt-2 max-h-40 overflow-y-auto text-xs">
                    <div className="font-semibold mb-1">エラー詳細:</div>
                    {result.errors.map((error, i) => (
                      <div key={i} className="text-red-600">{error}</div>
                    ))}
                  </div>
                )}
              </AlertDescription>
            </Alert>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose} disabled={isImporting}>
            キャンセル
          </Button>
          <Button 
            onClick={handleImport} 
            disabled={!scheduleText.trim() || isImporting}
          >
            {isImporting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                インポート中...
              </>
            ) : (
              'インポート実行'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

