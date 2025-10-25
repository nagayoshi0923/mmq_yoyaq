import React, { useState } from 'react'
import { UnifiedSidebar, SidebarMenuItem } from './UnifiedSidebar'
import { Users, List, UserPlus, Search, Mail, Shield, StickyNote } from 'lucide-react'

export default {
  title: 'Layout/UnifiedSidebar',
  component: UnifiedSidebar,
}

const staffListItems: SidebarMenuItem[] = [
  { id: 'staff-list', label: 'スタッフ一覧', icon: List, description: 'すべてのスタッフを表示' },
  { id: 'new-staff', label: '新規作成', icon: UserPlus, description: '新しいスタッフを追加' },
  { id: 'search-filter', label: '検索・フィルタ', icon: Search, description: 'スタッフを検索・フィルタ' },
  { id: 'invite-staff', label: 'スタッフ招待', icon: Mail, description: 'メールで招待を送信' }
]

const staffEditItems: SidebarMenuItem[] = [
  { id: 'basic', label: '基本情報', icon: Users, description: '名前、ステータス、連絡先' },
  { id: 'contact', label: '連絡先情報', icon: Mail, description: 'メール、電話、SNS' },
  { id: 'role-store', label: '役割・担当店舗', icon: Shield, description: 'ロール、店舗、特別シナリオ' },
  { id: 'notes', label: '備考', icon: StickyNote, description: 'メモ・特記事項' }
]

export const ListMode = () => {
  const [activeTab, setActiveTab] = useState('staff-list')
  
  return (
    <div className="h-screen">
      <UnifiedSidebar
        title="スタッフ管理"
        mode="list"
        menuItems={staffListItems}
        activeTab={activeTab}
        onTabChange={setActiveTab}
      />
    </div>
  )
}

export const EditMode = () => {
  const [activeTab, setActiveTab] = useState('basic')
  
  return (
    <div className="h-screen">
      <UnifiedSidebar
        title="スタッフ管理"
        mode="edit"
        menuItems={staffEditItems}
        activeTab={activeTab}
        onTabChange={setActiveTab}
        onBackToList={() => alert('一覧に戻る')}
        editModeSubtitle="山田太郎を編集中"
      />
    </div>
  )
}

