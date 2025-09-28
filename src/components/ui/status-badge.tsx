import React from 'react'
import { Badge } from '@/components/ui/badge'

interface StatusBadgeProps {
  status: 'active' | 'legacy' | 'unused' | 'ready'
  usageCount?: number
  className?: string
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({ 
  status, 
  usageCount = 0, 
  className = "" 
}) => {
  switch (status) {
    case 'active':
      return (
        <Badge variant="default" className={`text-xs bg-green-100 text-green-700 border-green-200 ${className}`}>
          使用中{usageCount > 0 ? `${usageCount}件` : '0件'}
        </Badge>
      )
    case 'legacy':
      return (
        <Badge variant="secondary" className={`text-xs bg-blue-100 text-blue-700 border-blue-200 ${className}`}>
          以前の設定{usageCount > 0 ? `${usageCount}件` : '0件'}
        </Badge>
      )
    case 'ready':
      return (
        <Badge variant="outline" className={`text-xs bg-green-50 text-green-600 border-green-200 ${className}`}>
          待機設定
        </Badge>
      )
    case 'unused':
      return (
        <Badge variant="outline" className={`text-xs bg-gray-50 text-gray-500 border-gray-200 ${className}`}>
          未設定
        </Badge>
      )
    default:
      return null
  }
}
