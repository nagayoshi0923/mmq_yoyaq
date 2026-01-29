/**
 * 公開ページ用レイアウトコンポーネント
 * ヘッダーとフッターを含む共通レイアウト
 */
import { ReactNode } from 'react'
import { Header } from './Header'
import { Footer } from './Footer'
import { NavigationBar } from './NavigationBar'
import { useAuth } from '@/contexts/AuthContext'

interface PublicLayoutProps {
  children: ReactNode
  /** 組織スラッグ */
  organizationSlug?: string
  /** 組織名 */
  organizationName?: string
  /** フッターをミニマル表示にする */
  minimalFooter?: boolean
  /** フッターを非表示にする */
  hideFooter?: boolean
  /** ナビゲーションバーを非表示にする */
  hideNavigation?: boolean
}

export function PublicLayout({ 
  children, 
  organizationSlug, 
  organizationName,
  minimalFooter = false,
  hideFooter = false,
  hideNavigation = false
}: PublicLayoutProps) {
  const { user } = useAuth()
  const shouldShowNavigation = !hideNavigation && user && user.role !== 'customer' && user.role !== undefined

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Header />
      {shouldShowNavigation && (
        <NavigationBar currentPage={organizationSlug ? `booking/${organizationSlug}` : 'customer-booking'} />
      )}
      
      {/* メインコンテンツ */}
      <main className="flex-1">
        {children}
      </main>
      
      {/* フッター */}
      {!hideFooter && (
        <Footer 
          organizationSlug={organizationSlug}
          organizationName={organizationName}
          minimal={minimalFooter}
        />
      )}
    </div>
  )
}




