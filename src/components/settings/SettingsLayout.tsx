import React from 'react'
import { StoreSelector } from './StoreSelector'

interface SettingsLayoutProps {
  children: React.ReactNode
  selectedStoreId: string
  onStoreChange: (storeId: string) => void
  showStoreSelector?: boolean // 店舗選択を表示するかどうか（デフォルト: true）
}

export const SettingsLayout: React.FC<SettingsLayoutProps> = ({ 
  children, 
  selectedStoreId, 
  onStoreChange,
  showStoreSelector = true
}) => {
  return (
    <div className="space-y-6">
      {/* 店舗選択（店舗別設定の場合のみ表示） */}
      {showStoreSelector && (
        <StoreSelector 
          selectedStoreId={selectedStoreId}
          onStoreChange={onStoreChange}
        />
      )}
      
      {/* 設定コンテンツ */}
      {children}
    </div>
  )
}
