/**
 * 参加者追加セクション（ボタン群／追加フォーム）。
 * ReservationList から子コンポーネント抽出・挙動不変。
 * JSX は元 ReservationList の該当ブロックを逐語移送し、クロージャ参照は同名 props として注入
 *（デモ追加のインライン処理もそのまま移送）。
 */
import type { Dispatch, SetStateAction } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { AutocompleteInput } from '@/components/ui/autocomplete-input'
import { supabase } from '@/lib/supabase'
import { logger } from '@/utils/logger'
import { showToast } from '@/utils/toast'
import { reservationApi } from '@/lib/reservationApi'
import { ACTIVE_RESERVATION_STATUSES, RESERVATION_SOURCE } from '@/lib/constants'
import { getCurrentOrganizationId } from '@/lib/organization'
import { findMatchingStaff } from '@/utils/staffUtils'
import type { Staff as StaffType, Scenario, Store, Reservation } from '@/types'
import type { ScheduleEvent, EventFormData } from '@/types/schedule'
import type { NewParticipant } from './newParticipant'

interface AddParticipantSectionProps {
  event: ScheduleEvent | null
  scenarios: Scenario[]
  stores: Store[]
  staff: StaffType[]
  currentEventData: EventFormData
  isAddingParticipant: boolean
  setIsAddingParticipant: Dispatch<SetStateAction<boolean>>
  newParticipant: NewParticipant
  setNewParticipant: Dispatch<SetStateAction<NewParticipant>>
  handleAddParticipant: () => void
  customerNames: string[]
  onParticipantChange?: (eventId: string, newCount: number) => void
  setReservations: Dispatch<SetStateAction<Reservation[]>>
}

export function AddParticipantSection({
  event,
  scenarios,
  stores,
  staff,
  currentEventData,
  isAddingParticipant,
  setIsAddingParticipant,
  newParticipant,
  setNewParticipant,
  handleAddParticipant,
  customerNames,
  onParticipantChange,
  setReservations,
}: AddParticipantSectionProps) {
  return (
            !isAddingParticipant ? (
              <div className="flex gap-2">
                <Button
                  onClick={() => setIsAddingParticipant(true)}
                  size="sm"
                >
                  + 参加者を追加
                </Button>
                <Button
                  onClick={async () => {
                    if (!event?.id) return
                    try {
                      const organizationId =
                        (await getCurrentOrganizationId()) || event?.organization_id || undefined
                      
                      // デモ顧客を取得
                      let customerId: string | null = null
                      try {
                        let query = supabase
                          .from('customers')
                          .select('id')
                          .or('name.ilike.%デモ%,email.ilike.%demo%')
                        if (organizationId) {
                          query = query.eq('organization_id', organizationId)
                        }
                        const { data: demoCustomer } = await query.limit(1).single()
                        if (demoCustomer) {
                          customerId = demoCustomer.id
                        }
                      } catch {
                        // デモ顧客が見つからなくても続行
                      }
                      
                      // 予約番号を生成
                      const now = new Date()
                      const dateStr = now.toISOString().slice(2, 10).replace(/-/g, '')
                      const randomStr = Math.random().toString(36).substring(2, 6).toUpperCase()
                      const reservationNumber = `${dateStr}-${randomStr}`
                      
                      // シナリオ情報を取得
                      const scenarioObj = scenarios.find(s => s.title === currentEventData.scenario)
                      const storeObj = stores.find(s => s.id === currentEventData.venue)
                      const isGmTest = currentEventData.category === 'gmtest'
                      const participationFee = isGmTest
                        ? (scenarioObj?.gm_test_participation_fee || scenarioObj?.participation_fee || 0)
                        : (scenarioObj?.participation_fee || 0)
                      
                      // 直接INSERTでデモ参加者を追加（キャンセル済み公演でも追加可能）
                      const duration = scenarioObj?.duration || 120
                      const { error: insertError } = await supabase
                        .from('reservations')
                        .insert({
                          schedule_event_id: event.id,
                          organization_id: organizationId ?? event?.organization_id ?? null,
                          scenario_master_id: scenarioObj?.id || null,
                          store_id: storeObj?.id || null,
                          customer_id: customerId,
                          customer_notes: 'デモ参加者',
                          participant_count: 1,
                          participant_names: ['デモ参加者'],
                          reservation_number: reservationNumber,
                          requested_datetime: `${currentEventData.date}T${currentEventData.start_time}+09:00`,
                          title: currentEventData.scenario || '',
                          duration: duration,
                          base_price: participationFee,
                          total_price: participationFee,
                          final_price: participationFee,
                          unit_price: participationFee,
                          payment_method: 'onsite',
                          payment_status: 'paid',
                          status: 'confirmed',
                          reservation_source: RESERVATION_SOURCE.WALK_IN
                        })
                      
                      if (insertError) {
                        throw insertError
                      }
                      
                      // 参加者数を再計算
                      const { data: updatedReservationsData } = await supabase
                        .from('reservations')
                        .select('participant_count')
                        .eq('schedule_event_id', event.id)
                        .in('status', [...ACTIVE_RESERVATION_STATUSES])
                      
                      const totalParticipants = updatedReservationsData?.reduce((sum, r) => sum + (r.participant_count || 0), 0) || 0
                      
                      await supabase
                        .from('schedule_events')
                        .update({ current_participants: totalParticipants })
                        .eq('id', event.id)
                      
                      showToast.success('デモ参加者を追加しました')
                      
                      // 予約リストを再取得
                      const eventOrgId = (event as any)?.organization_id || null
                      const updatedReservationList = await reservationApi.getByScheduleEvent(event.id, eventOrgId)
                      setReservations(updatedReservationList)
                      
                      // 参加者数を親に通知
                      if (onParticipantChange) {
                        onParticipantChange(event.id, totalParticipants)
                      }
                    } catch (error) {
                      logger.error('デモ参加者追加エラー:', error)
                      showToast.error('デモ参加者の追加に失敗しました')
                    }
                  }}
                  size="sm"
                  variant="outline"
                >
                  + デモ追加
                </Button>
              </div>
            ) : (
              <div className="border rounded-lg p-3 bg-muted/30">
                <h4 className="font-medium mb-2 text-sm">新しい参加者を追加</h4>
                <div className="space-y-2">
                  <div>
                    <Label htmlFor="customer_name" className="text-xs">参加者名 *</Label>
                    <AutocompleteInput
                      value={newParticipant.customer_name}
                      onChange={(value) => {
                        // スタッフかどうかを判定し、自動的にpayment_methodを設定
                        const matchedStaff = findMatchingStaff(value, null, staff)
                        setNewParticipant(prev => ({
                          ...prev,
                          customer_name: value,
                          // スタッフの場合は自動的に「スタッフ参加」に設定
                          payment_method: matchedStaff ? 'staff' : prev.payment_method === 'staff' ? 'onsite' : prev.payment_method
                        }))
                      }}
                      placeholder="参加者名を入力"
                      staffOptions={staff.map(s => ({ value: s.name, label: s.name, type: 'staff' as const }))}
                      customerOptions={customerNames.map(name => ({ value: name, label: name, type: 'customer' as const }))}
                      showStaffOnFocus={true}
                    />
                    {findMatchingStaff(newParticipant.customer_name, null, staff) && (
                      <p className="text-xs text-blue-600 mt-1">
                        ※ スタッフとして認識されました
                      </p>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <Label htmlFor="participant_count" className="text-xs">人数</Label>
                      <Input
                        id="participant_count"
                        type="number"
                        min="1"
                        className="h-8"
                        value={newParticipant.participant_count}
                        onChange={(e) => setNewParticipant(prev => ({ ...prev, participant_count: parseInt(e.target.value) || 1 }))}
                      />
                    </div>
                    <div>
                      <Label htmlFor="payment_method" className="text-xs">支払い方法</Label>
                      <Select
                        value={newParticipant.payment_method}
                        onValueChange={(value: 'onsite' | 'online' | 'staff') => setNewParticipant(prev => ({ ...prev, payment_method: value }))}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="onsite">現地決済</SelectItem>
                          <SelectItem value="online">事前決済</SelectItem>
                          <SelectItem value="staff">スタッフ参加（無料）</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div>
                    <Label htmlFor="notes" className="text-xs">メモ</Label>
                    <Textarea
                      id="notes"
                      value={newParticipant.notes}
                      onChange={(e) => setNewParticipant(prev => ({ ...prev, notes: e.target.value }))}
                      placeholder="特記事項があれば入力"
                      rows={1}
                      className="min-h-[32px]"
                    />
                  </div>
                  <div className="flex gap-2 justify-end pt-1">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setIsAddingParticipant(false)
                        setNewParticipant({
                          customer_name: '',
                          participant_count: 1,
                          payment_method: 'onsite',
                          notes: ''
                        })
                      }}
                    >
                      キャンセル
                    </Button>
                    <Button
                      size="sm"
                      onClick={handleAddParticipant}
                    >
                      追加
                    </Button>
                  </div>
                </div>
              </div>
            )

  )
}
