import React from 'react'
import { Badge } from '@/components/ui/badge'

interface StatusBadgeProps {
  status: 'active' | 'legacy' | 'unused' | 'ready'
  label?: string // カスタムラベル（指定した場合はusageCountを無視）
  usageCount?: number
  startDate?: string // 待機設定の開始日
  endDate?: string // 使用中設定の終了日
  className?: string
}

// 日付フォーマット関数
const formatDate = (dateString: string) => {
  const date = new Date(dateString)
  const month = date.getMonth() + 1
  const day = date.getDate()
  return `${month}月${day}日`
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({ 
  status, 
  label,
  usageCount = 0, 
  startDate,
  endDate,
  className = "" 
}) => {
  switch (status) {
    case 'active':
      return (
        <div className="flex items-center gap-1">
          <Badge variant="default" className={`text-xs bg-green-100 text-green-700 border-green-200 ${className}`}>
            {label || (usageCount > 0 ? `使用中${usageCount}件` : '使用中0件')}
          </Badge>
          {endDate && (
            <span className="text-xs text-gray-500">
              {formatDate(endDate)}まで
            </span>
          )}
        </div>
      )
    case 'legacy':
      return (
        <Badge variant="outline" className={`text-xs bg-gray-50 text-gray-600 border-gray-200 ${className}`}>
          {label || (usageCount > 0 ? `以前の設定${usageCount}件` : '以前の設定0件')}
        </Badge>
      )
    case 'ready':
      return (
        <div className="flex items-center gap-1">
          <Badge variant="outline" className={`text-xs bg-blue-50 text-blue-600 border-blue-200 ${className}`}>
            {label || '待機設定'}
          </Badge>
          {startDate && (
            <span className="text-xs text-gray-500">
              {formatDate(startDate)}から
            </span>
          )}
        </div>
      )
    case 'unused':
      return (
        <Badge variant="outline" className={`text-xs bg-gray-50 text-gray-500 border-gray-200 ${className}`}>
          {label || '未設定'}
        </Badge>
      )
    default:
      return null
  }
}
