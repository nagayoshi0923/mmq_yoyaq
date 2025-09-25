import React, { useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Calendar, Clock, MapPin, Users } from 'lucide-react'

interface AddPerformanceModalProps {
  isOpen: boolean
  onClose: () => void
  date: string
  venue: string
  timeSlot: 'morning' | 'afternoon' | 'evening'
  onSave: (performanceData: any) => void
}

export function AddPerformanceModal({
  isOpen,
  onClose,
  date,
  venue,
  timeSlot,
  onSave
}: AddPerformanceModalProps) {
  const [formData, setFormData] = useState({
    scenario: '',
    gms: [''],
    startTime: getDefaultStartTime(timeSlot),
    endTime: getDefaultEndTime(timeSlot),
    category: 'open' as 'open' | 'private' | 'gmtest' | 'testplay' | 'trip',
    maxParticipants: 8,
    notes: ''
  })

  // 30分単位の時間オプションを生成
  const generateTimeOptions = () => {
    const times = []
    for (let hour = 9; hour <= 23; hour++) {
      times.push(`${hour.toString().padStart(2, '0')}:00`)
      times.push(`${hour.toString().padStart(2, '0')}:30`)
    }
    return times
  }

  const timeOptions = generateTimeOptions()

  // 時間帯に応じたデフォルト時間
  function getDefaultStartTime(slot: string) {
    switch (slot) {
      case 'morning': return '10:00'
      case 'afternoon': return '14:00'
      case 'evening': return '19:00'
      default: return '10:00'
    }
  }

  function getDefaultEndTime(slot: string) {
    switch (slot) {
      case 'morning': return '13:00'
      case 'afternoon': return '18:00'
      case 'evening': return '22:00'
      default: return '13:00'
    }
  }

  // 店舗名の表示用
  const storeNames: Record<string, string> = {
    'takadanobaba': '高田馬場店',
    'bekkan1': '別館①',
    'bekkan2': '別館②',
    'okubo': '大久保店',
    'otsuka': '大塚店',
    'omiya': '埼玉大宮店'
  }

  // 店舗カラー設定
  const storeColors: Record<string, string> = {
    'takadanobaba': 'bg-blue-100 text-blue-800',
    'bekkan1': 'bg-green-100 text-green-800',
    'bekkan2': 'bg-purple-100 text-purple-800',
    'okubo': 'bg-orange-100 text-orange-800',
    'otsuka': 'bg-red-100 text-red-800',
    'omiya': 'bg-amber-100 text-amber-800'
  }

  // 時間帯の表示用
  const timeSlotNames = {
    'morning': '午前',
    'afternoon': '午後',
    'evening': '夜間'
  }

  // カテゴリ設定
  const categoryConfig = {
    open: { label: 'オープン公演', badgeColor: 'bg-blue-100 text-blue-800' },
    private: { label: '貸切公演', badgeColor: 'bg-purple-100 text-purple-800' },
    gmtest: { label: 'GMテスト', badgeColor: 'bg-orange-100 text-orange-800' },
    testplay: { label: 'テストプレイ', badgeColor: 'bg-yellow-100 text-yellow-800' },
    trip: { label: '出張公演', badgeColor: 'bg-green-100 text-green-800' }
  }

  const handleSave = () => {
    const performanceData = {
      id: Date.now().toString(), // 仮のID生成
      date,
      venue,
      scenario: formData.scenario,
      gms: formData.gms.filter(gm => gm.trim() !== ''),
      start_time: formData.startTime,
      end_time: formData.endTime,
      category: formData.category,
      is_cancelled: false,
      max_participants: formData.maxParticipants,
      participant_count: 0,
      notes: formData.notes
    }
    
    onSave(performanceData)
    onClose()
    
    // フォームリセット
    setFormData({
      scenario: '',
      gms: [''],
      startTime: getDefaultStartTime(timeSlot),
      endTime: getDefaultEndTime(timeSlot),
      category: 'open',
      maxParticipants: 8,
      notes: ''
    })
  }

  const addGMField = () => {
    setFormData(prev => ({
      ...prev,
      gms: [...prev.gms, '']
    }))
  }

  const updateGM = (index: number, value: string) => {
    setFormData(prev => ({
      ...prev,
      gms: prev.gms.map((gm, i) => i === index ? value : gm)
    }))
  }

  const removeGM = (index: number) => {
    if (formData.gms.length > 1) {
      setFormData(prev => ({
        ...prev,
        gms: prev.gms.filter((_, i) => i !== index)
      }))
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>新しい公演を追加</DialogTitle>
          
          {/* 基本情報表示 */}
          <div className="flex flex-wrap gap-2 mt-4">
            <Badge variant="outline" className="flex items-center gap-1">
              <Calendar className="w-3 h-3" />
              {date}
            </Badge>
            <Badge className={`flex items-center gap-1 ${storeColors[venue] || 'bg-gray-100 text-gray-800'}`}>
              <MapPin className="w-3 h-3" />
              {storeNames[venue] || venue}
            </Badge>
            <Badge variant="outline" className="flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {timeSlotNames[timeSlot]}
            </Badge>
          </div>
        </DialogHeader>

        <div className="space-y-6">
          {/* シナリオ名 */}
          <div className="space-y-2">
            <label className="text-sm font-medium">シナリオ名</label>
            <Input
              value={formData.scenario}
              onChange={(e) => setFormData(prev => ({ ...prev, scenario: e.target.value }))}
              placeholder="シナリオ名を入力（未定の場合は空欄可）"
            />
          </div>

          {/* カテゴリ */}
          <div className="space-y-2">
            <label className="text-sm font-medium">公演カテゴリ</label>
            <Select value={formData.category} onValueChange={(value: any) => setFormData(prev => ({ ...prev, category: value }))}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(categoryConfig).map(([key, config]) => (
                  <SelectItem key={key} value={key}>
                    <div className="flex items-center gap-2">
                      <Badge size="sm" className={config.badgeColor}>
                        {config.label}
                      </Badge>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* 時間設定 */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">開始時間</label>
              <Select value={formData.startTime} onValueChange={(value) => setFormData(prev => ({ ...prev, startTime: value }))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {timeOptions.map((time) => (
                    <SelectItem key={time} value={time}>
                      {time}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">終了時間</label>
              <Select value={formData.endTime} onValueChange={(value) => setFormData(prev => ({ ...prev, endTime: value }))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {timeOptions.map((time) => (
                    <SelectItem key={time} value={time}>
                      {time}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* GM設定 */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium">GM</label>
              <Button type="button" variant="outline" size="sm" onClick={addGMField}>
                GM追加
              </Button>
            </div>
            <div className="space-y-2">
              {formData.gms.map((gm, index) => (
                <div key={index} className="flex gap-2">
                  <Input
                    value={gm}
                    onChange={(e) => updateGM(index, e.target.value)}
                    placeholder={`GM${index + 1}の名前（未定の場合は空欄可）`}
                  />
                  {formData.gms.length > 1 && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => removeGM(index)}
                    >
                      削除
                    </Button>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* 参加人数 */}
          <div className="space-y-2">
            <label className="text-sm font-medium flex items-center gap-1">
              <Users className="w-4 h-4" />
              最大参加人数
            </label>
            <Input
              type="number"
              min="1"
              max="20"
              value={formData.maxParticipants}
              onChange={(e) => setFormData(prev => ({ ...prev, maxParticipants: parseInt(e.target.value) || 8 }))}
            />
          </div>

          {/* 備考 */}
          <div className="space-y-2">
            <label className="text-sm font-medium">備考</label>
            <Textarea
              value={formData.notes}
              onChange={(e) => setFormData(prev => ({ ...prev, notes: e.target.value }))}
              placeholder="特記事項があれば入力"
              className="min-h-[80px]"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            キャンセル
          </Button>
          <Button 
            onClick={handleSave}
          >
            公演を追加
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
