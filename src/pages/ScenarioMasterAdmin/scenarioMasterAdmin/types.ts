import { FileText, Clock, CheckCircle, XCircle } from 'lucide-react'

export interface ScenarioMaster {
  id: string
  title: string
  author: string | null
  key_visual_url: string | null
  player_count_min: number
  player_count_max: number
  official_duration: number
  genre: string[]
  master_status: 'draft' | 'pending' | 'approved' | 'rejected'
  updated_at: string
  submitted_by_organization_id: string | null
  submitted_by_organization_name?: string | null
  organization_count?: number
  using_organizations?: { id: string; name: string }[]
}

export const STATUS_CONFIG = {
  draft: { label: '下書き', color: 'bg-gray-100 text-gray-700', icon: FileText },
  pending: { label: '承認待ち', color: 'bg-yellow-100 text-yellow-700', icon: Clock },
  approved: { label: '承認済み', color: 'bg-green-100 text-green-700', icon: CheckCircle },
  rejected: { label: '却下', color: 'bg-red-100 text-red-700', icon: XCircle },
}
