import { useState, useEffect, useRef } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { getGmResponses, getMyGmResponses } from '@/lib/gmResponseApi'
import * as storeApi from '@/lib/api'
import { logger } from '@/utils/logger'

export interface GMRequest {
  id: string
  reservation_id: string
  reservation_number: string
  scenario_title: string
  customer_name: string
  candidate_datetimes: {
    candidates: Array<{
      order: number
      date: string
      timeSlot: string
      startTime: string
      endTime: string
      status: string
    }>
    requestedStores?: Array<{
      storeId: string
      storeName: string
    }>
    confirmedStore?: {
      storeId: string
      storeName: string
    }
  }
  response_status: string
  available_candidates: number[]
  notes: string
  reservation_status?: string
  has_other_gm_response?: boolean
  created_at: string
}

interface UseGMRequestsProps {
  userId?: string
}

export const gmRequestKeys = {
  byUser: (userId: string) => ['gm-requests', userId] as const,
  stores: ['gm-request-stores'] as const,
}

async function fetchGMRequestsForUser(): Promise<{ requests: GMRequest[]; staffName: string }> {
  const { responses: responsesData, staffId, staffName } = await getMyGmResponses()
  const reservationIds = (responsesData || []).map((r: any) => r.reservation_id).filter(Boolean)
  const otherGMResponses = new Set<string>()

  if (reservationIds.length > 0) {
    const allResponsesData = (await getGmResponses(reservationIds)).filter(r => r.staff_id !== staffId)

    allResponsesData.forEach((r: any) => {
      if (['available', 'all_unavailable'].includes(r.response_status)) {
        otherGMResponses.add(r.reservation_id)
      }
    })
  }

  const requests: GMRequest[] = (responsesData || []).map((response: any) => {
    let candidateDatetimes = response.reservations?.candidate_datetimes || { candidates: [] }

    if ((!candidateDatetimes.requestedStores || candidateDatetimes.requestedStores.length === 0) && response.reservations?.store_id) {
      const storeInfo = response.reservations.stores
      if (storeInfo) {
        candidateDatetimes = {
          ...candidateDatetimes,
          requestedStores: [{ storeId: storeInfo.id, storeName: storeInfo.name, storeShortName: storeInfo.short_name }],
        }
      }
    }

    return {
      id: response.id,
      reservation_id: response.reservation_id,
      reservation_number: response.reservations?.reservation_number || '',
      scenario_title: response.reservations?.title || '',
      customer_name: response.reservations?.customer_name || '',
      candidate_datetimes: candidateDatetimes,
      response_status: response.response_status || 'pending',
      available_candidates: response.available_candidates || [],
      notes: response.notes || '',
      reservation_status: response.reservations?.status || 'pending',
      has_other_gm_response: otherGMResponses.has(response.reservation_id),
      created_at: response.reservations?.created_at || new Date().toISOString(),
    }
  })

  logger.log('🔍 GM確認ページ - 取得完了:', requests.length, '件')
  return { requests, staffName }
}

export function useGMRequests({ userId }: UseGMRequestsProps) {
  const queryClient = useQueryClient()

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: userId ? gmRequestKeys.byUser(userId) : ['gm-requests-disabled'],
    queryFn: () => fetchGMRequestsForUser(),
    enabled: !!userId,
    staleTime: 2 * 60 * 1000, // 2分間キャッシュ
  })

  const { data: stores = [] } = useQuery({
    queryKey: gmRequestKeys.stores,
    queryFn: () => storeApi.storeApi.getAll(),
    staleTime: 10 * 60 * 1000,
  })

  const requests = data?.requests ?? []
  const staffName = data?.staffName ?? ''

  // 回答済みリクエストの初期選択状態を復元（データ初回取得時のみ）
  const [selectedCandidates, setSelectedCandidates] = useState<Record<string, number[]>>({})
  const [notes, setNotes] = useState<Record<string, string>>({})
  const initializedRef = useRef(false)

  useEffect(() => {
    if (requests.length > 0 && !initializedRef.current) {
      initializedRef.current = true
      const initialSelections: Record<string, number[]> = {}
      const initialNotes: Record<string, string> = {}
      requests.forEach(req => {
        if (req.available_candidates?.length > 0) initialSelections[req.id] = req.available_candidates
        if (req.notes) initialNotes[req.id] = req.notes
      })
      setSelectedCandidates(initialSelections)
      setNotes(initialNotes)
    }
  }, [requests])

  const [activeTab, setActiveTab] = useState<'pending' | 'all'>('pending')
  const [currentDate, setCurrentDate] = useState(new Date())

  const loadGMRequests = () => {
    if (userId) {
      initializedRef.current = false
      queryClient.invalidateQueries({ queryKey: gmRequestKeys.byUser(userId) })
    }
  }

  const loadStores = () =>
    queryClient.invalidateQueries({ queryKey: gmRequestKeys.stores })

  const toggleCandidate = (requestId: string, candidateOrder: number) => {
    const current = selectedCandidates[requestId] || []
    const newSelection = current.includes(candidateOrder)
      ? current.filter(c => c !== candidateOrder)
      : [...current, candidateOrder]
    setSelectedCandidates({ ...selectedCandidates, [requestId]: newSelection })
  }

  const filterByMonth = (reqs: GMRequest[]) => {
    const year = currentDate.getFullYear()
    const month = currentDate.getMonth() + 1
    return reqs.filter(req =>
      req.candidate_datetimes?.candidates?.some(c => {
        const [cYear, cMonth] = c.date.split('-').map(Number)
        return cYear === year && cMonth === month
      })
    )
  }

  const pendingRequests = requests.filter(r =>
    r.response_status === 'pending' ||
    r.response_status === null ||
    r.response_status === '' ||
    r.response_status === 'available'
  )

  const allRequests = filterByMonth(requests)

  const handlePrevMonth = () =>
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1))

  const handleNextMonth = () =>
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1))

  const formatMonthYear = (date: Date) =>
    `${date.getFullYear()}年${date.getMonth() + 1}月`

  return {
    requests,
    isLoading,
    isError,
    retryRequests: refetch,
    stores,
    staffName,
    activeTab,
    setActiveTab,
    currentDate,
    setCurrentDate,
    selectedCandidates,
    setSelectedCandidates,
    notes,
    setNotes,
    loadGMRequests,
    loadStores,
    toggleCandidate,
    filterByMonth,
    pendingRequests,
    allRequests,
    handlePrevMonth,
    handleNextMonth,
    formatMonthYear,
  }
}
