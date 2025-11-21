// 公演フォームの状態管理フック

import { useState, useEffect } from 'react'
import { DEFAULT_MAX_PARTICIPANTS } from '@/constants/game'
import type { ScheduleEvent, EventFormData, ModalMode, NewParticipant } from '../types'
import type { Store, Scenario, Staff } from '@/types'

interface UsePerformanceFormProps {
  mode: ModalMode
  event?: ScheduleEvent | null
  initialData?: { date: string; venue: string; timeSlot: string }
  stores: Store[]
  scenarios: Scenario[]
  staff: Staff[]
}

export function usePerformanceForm({
  mode,
  event,
  initialData,
  stores,
  scenarios,
  staff
}: UsePerformanceFormProps) {
  // フォームデータ
  const [formData, setFormData] = useState<any>({
    id: '',
    date: '',
    venue: '',
    scenario: '',
    gms: [],
    start_time: '10:00',
    end_time: '14:00',
    category: 'private',
    participant_count: 0,
    max_participants: DEFAULT_MAX_PARTICIPANTS,
    notes: ''
  })

  // 時間帯デフォルト値
  const [timeSlotDefaults] = useState({
    morning: { start: '10:00', end: '14:00' },
    afternoon: { start: '14:00', end: '18:00' },
    evening: { start: '18:00', end: '22:00' }
  })

  // 新規参加者データ
  const [newParticipant, setNewParticipant] = useState<NewParticipant>({
    customer_name: '',
    participant_count: 1,
    payment_method: 'onsite',
    notes: ''
  })

  const [isAddingParticipant, setIsAddingParticipant] = useState(false)
  const [customerNames, setCustomerNames] = useState<string[]>([])

  // イベントデータまたは初期データからフォームを初期化
  useEffect(() => {
    if (mode === 'edit' && event) {
      const selectedScenario = scenarios.find(s => s.title === event.scenario)
      
      setFormData({
        id: event.id,
        date: event.date,
        venue: event.venue,
        scenario: event.scenario,
        scenario_id: selectedScenario?.id || '',
        gms: event.gms || [],
        start_time: event.start_time,
        end_time: event.end_time,
        category: event.category || 'private',
        participant_count: event.participant_count || 0,
        max_participants: event.max_participants || selectedScenario?.max_participants || DEFAULT_MAX_PARTICIPANTS,
        notes: event.notes || ''
      })
    } else if (mode === 'add' && initialData) {
      const { date, venue, timeSlot } = initialData
      const timeDefaults = timeSlotDefaults[timeSlot as keyof typeof timeSlotDefaults] || timeSlotDefaults.morning
      
      setFormData((prev: any) => ({
        ...prev,
        date,
        venue,
        start_time: timeDefaults.start,
        end_time: timeDefaults.end
      }))
    }
  }, [mode, event, initialData, scenarios, timeSlotDefaults])

  // シナリオ変更時の処理
  const handleScenarioChange = (scenarioTitle: string) => {
    const selectedScenario = scenarios.find(s => s.title === scenarioTitle)
    
    setFormData((prev: any) => ({
      ...prev,
      scenario: scenarioTitle,
      scenario_id: selectedScenario?.id || '',
      max_participants: selectedScenario?.max_participants || DEFAULT_MAX_PARTICIPANTS,
      gms: selectedScenario?.available_gms || []
    }))
  }

  // バリデーション
  const validateForm = (): boolean => {
    if (!formData.date || !formData.venue || !formData.scenario) {
      return false
    }
    if (!formData.start_time || !formData.end_time) {
      return false
    }
    if (formData.start_time >= formData.end_time) {
      return false
    }
    return true
  }

  // フォームデータをEventFormDataに変換
  const getEventFormData = (): EventFormData => {
    const selectedScenario = scenarios.find(s => s.title === formData.scenario)
    
    return {
      id: formData.id,
      date: formData.date,
      venue: formData.venue,
      scenario: formData.scenario,
      scenario_id: selectedScenario?.id,
      category: formData.category,
      start_time: formData.start_time,
      end_time: formData.end_time,
      max_participants: formData.max_participants,
      capacity: formData.max_participants,
      gms: formData.gms,
      notes: formData.notes
    }
  }

  return {
    formData,
    setFormData,
    newParticipant,
    setNewParticipant,
    isAddingParticipant,
    setIsAddingParticipant,
    customerNames,
    setCustomerNames,
    handleScenarioChange,
    validateForm,
    getEventFormData
  }
}

