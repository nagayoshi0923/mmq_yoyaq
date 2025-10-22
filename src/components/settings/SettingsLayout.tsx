import React from 'react'
import { StoreSelector } from './StoreSelector'

interface SettingsLayoutProps {
  children: React.ReactNode
  selectedStoreId: string
  onStoreChange: (storeId: string) => void
}

export const SettingsLayout: React.FC<SettingsLayoutProps> = ({ 
  children, 
  selectedStoreId, 
  onStoreChange 
}) => {
  return (
    <div className="space-y-6">
      {/* 店舗選択 */}
      <StoreSelector 
        selectedStoreId={selectedStoreId}
        onStoreChange={onStoreChange}
      />
      
      {/* 設定コンテンツ */}
      {children}
    </div>
  )
}
