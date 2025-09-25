import React, { useState, useEffect } from 'react'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Label } from '@/components/ui/label'
import { X } from 'lucide-react'

// スケジュールイベントの型定義
interface ScheduleEvent {
  id: string
  date: string // YYYY-MM-DD
  venue: string // 店舗ID
  scenario: string
  gms: string[] // GMの名前の配列
  start_time: string // HH:MM
  end_time: string // HH:MM
  category: 'open' | 'private' | 'gmtest' | 'testplay' | 'offsite' // 公演カテゴリ
  is_cancelled: boolean
  participant_count?: number
  max_participants?: number
  notes?: string
}

interface Store {
  id: string
  name: string
  short_name: string
  color: string
}

interface PerformanceModalProps {
  isOpen: boolean
  onClose: () => void
  onSave: (eventData: any) => void
  mode: 'add' | 'edit'
  event?: ScheduleEvent | null  // 編集時のみ
  initialData?: { date: string, venue: string, timeSlot: string }  // 追加時のみ
  stores: Store[]
}

// 30分間隔の時間オプションを生成
const generateTimeOptions = () => {
  const options = []
  for (let hour = 9; hour <= 23; hour++) {
    for (let minute = 0; minute < 60; minute += 30) {
      const timeString = `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`
      options.push(timeString)
    }
  }
  return options
}

const timeOptions = generateTimeOptions()

export function PerformanceModal({
  isOpen,
  onClose,
  onSave,
  mode,
  event,
  initialData,
  stores
}: PerformanceModalProps) {
  const [formData, setFormData] = useState<any>({
    id: '',
    date: '',
    venue: '',
    scenario: '',
    gms: [],
    start_time: '10:00',
    end_time: '14:00',
    category: 'open',
    participant_count: 0,
    max_participants: 8,
    notes: ''
  })
  const [newGm, setNewGm] = useState('')

  // モードに応じてフォームを初期化
  useEffect(() => {
    if (mode === 'edit' && event) {
      // 編集モード：既存データで初期化
      setFormData(event)
    } else if (mode === 'add' && initialData) {
      // 追加モード：初期データで初期化
      const timeSlotDefaults = {
        morning: { start_time: '10:00', end_time: '14:00' },
        afternoon: { start_time: '14:30', end_time: '18:30' },
        evening: { start_time: '19:00', end_time: '23:00' }
      }
      
      const defaults = timeSlotDefaults[initialData.timeSlot as keyof typeof timeSlotDefaults] || timeSlotDefaults.morning
      
      setFormData({
        id: Date.now().toString(),
        date: initialData.date,
        venue: initialData.venue,
        scenario: '',
        gms: [],
        start_time: defaults.start_time,
        end_time: defaults.end_time,
        category: 'open',
        participant_count: 0,
        max_participants: 8,
        notes: ''
      })
    }
  }, [mode, event, initialData])

  const handleSave = () => {
    onSave(formData)
    onClose()
  }

  const addGm = () => {
    if (newGm.trim() && !formData.gms.includes(newGm.trim())) {
      setFormData((prev: any) => ({
        ...prev,
        gms: [...prev.gms, newGm.trim()]
      }))
      setNewGm('')
    }
  }

  const removeGm = (gmToRemove: string) => {
    setFormData((prev: any) => ({
      ...prev,
      gms: prev.gms.filter((gm: string) => gm !== gmToRemove)
    }))
  }

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      addGm()
    }
  }

  // 店舗名を取得
  const getStoreName = (storeId: string) => {
    const store = stores.find(s => s.id === storeId)
    return store ? store.name : storeId
  }

  // 店舗カラーを取得
  const getStoreColor = (storeId: string) => {
    const store = stores.find(s => s.id === storeId)
    const storeColors: { [key: string]: string } = {
      blue: 'bg-blue-100 text-blue-800',
      green: 'bg-green-100 text-green-800',
      purple: 'bg-purple-100 text-purple-800',
      orange: 'bg-orange-100 text-orange-800',
      red: 'bg-red-100 text-red-800',
      amber: 'bg-amber-100 text-amber-800'
    }
    return store ? storeColors[store.color] || 'bg-gray-100 text-gray-800' : 'bg-gray-100 text-gray-800'
  }

  const modalTitle = mode === 'add' ? '新しい公演を追加' : '公演を編集'
  const modalDescription = mode === 'add' ? '新しい公演の詳細情報を入力してください。' : '公演の詳細情報を編集してください。'

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{modalTitle}</DialogTitle>
          <DialogDescription>
            {modalDescription}
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-4">
          {/* 基本情報 */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="date">日付</Label>
              <Input
                id="date"
                type="date"
                value={formData.date}
                onChange={(e) => setFormData((prev: any) => ({ ...prev, date: e.target.value }))}
              />
            </div>
            <div>
              <Label htmlFor="venue">店舗</Label>
              {mode === 'edit' ? (
                <div className="flex items-center gap-2">
                  <Badge className={getStoreColor(formData.venue)}>
                    {getStoreName(formData.venue)}
                  </Badge>
                  <span className="text-sm text-muted-foreground">(変更不可)</span>
                </div>
              ) : (
                <Select value={formData.venue} onValueChange={(value) => setFormData((prev: any) => ({ ...prev, venue: value }))}>
                  <SelectTrigger>
                    <SelectValue placeholder="店舗を選択" />
                  </SelectTrigger>
                  <SelectContent>
                    {stores.map(store => (
                      <SelectItem key={store.id} value={store.id}>
                        <div className="flex items-center gap-2">
                          <Badge className={getStoreColor(store.id)} size="sm">
                            {store.short_name}
                          </Badge>
                          {store.name}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          </div>

          {/* 時間設定 */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="start_time">開始時間</Label>
              <Select value={formData.start_time} onValueChange={(value) => setFormData((prev: any) => ({ ...prev, start_time: value }))}>
                <SelectTrigger>
                  <SelectValue placeholder="開始時間を選択" />
                </SelectTrigger>
                <SelectContent>
                  {timeOptions.map(time => (
                    <SelectItem key={time} value={time}>{time}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="end_time">終了時間</Label>
              <Select value={formData.end_time} onValueChange={(value) => setFormData((prev: any) => ({ ...prev, end_time: value }))}>
                <SelectTrigger>
                  <SelectValue placeholder="終了時間を選択" />
                </SelectTrigger>
                <SelectContent>
                  {timeOptions.map(time => (
                    <SelectItem key={time} value={time}>{time}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* カテゴリと参加者数 */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="category">公演カテゴリ</Label>
              <Select value={formData.category} onValueChange={(value: any) => setFormData((prev: any) => ({ ...prev, category: value }))}>
                <SelectTrigger>
                  <SelectValue placeholder="カテゴリを選択" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="open">オープン公演</SelectItem>
                  <SelectItem value="private">貸切公演</SelectItem>
                  <SelectItem value="gmtest">GMテスト</SelectItem>
                  <SelectItem value="testplay">テストプレイ</SelectItem>
                  <SelectItem value="offsite">出張公演</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="max_participants">最大参加者数</Label>
              <Input
                id="max_participants"
                type="number"
                min="1"
                max="20"
                value={formData.max_participants}
                onChange={(e) => setFormData((prev: any) => ({ ...prev, max_participants: parseInt(e.target.value) || 8 }))}
              />
            </div>
          </div>

          {/* シナリオ */}
          <div>
            <Label htmlFor="scenario">シナリオタイトル</Label>
            <Input
              id="scenario"
              value={formData.scenario}
              onChange={(e) => setFormData((prev: any) => ({ ...prev, scenario: e.target.value }))}
              placeholder="シナリオタイトルを入力"
            />
          </div>

          {/* GM管理 */}
          <div>
            <Label htmlFor="gms">GM</Label>
            <div className="flex gap-2 mb-2">
              <Input
                value={newGm}
                onChange={(e) => setNewGm(e.target.value)}
                onKeyPress={handleKeyPress}
                placeholder="GM名を入力してEnter"
              />
              <Button type="button" onClick={addGm} variant="outline">
                追加
              </Button>
            </div>
            <div className="flex flex-wrap gap-2">
              {formData.gms.map((gm: string, index: number) => (
                <Badge key={index} variant="secondary" className="flex items-center gap-1">
                  {gm}
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-4 w-4 p-0 hover:bg-red-100"
                    onClick={() => removeGm(gm)}
                  >
                    <X className="h-3 w-3" />
                  </Button>
                </Badge>
              ))}
            </div>
          </div>

          {/* 備考 */}
          <div>
            <Label htmlFor="notes">備考</Label>
            <Textarea
              id="notes"
              value={formData.notes}
              onChange={(e) => setFormData((prev: any) => ({ ...prev, notes: e.target.value }))}
              placeholder="備考があれば入力してください"
              rows={3}
            />
          </div>
        </div>

        {/* アクションボタン */}
        <div className="flex justify-end gap-2 pt-4">
          <Button variant="outline" onClick={onClose}>
            キャンセル
          </Button>
          <Button onClick={handleSave}>
            {mode === 'add' ? '追加' : '保存'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
