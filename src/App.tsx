import React from 'react'
import { AuthProvider, useAuth } from '@/contexts/AuthContext'
import { LoginForm } from '@/components/auth/LoginForm'
import { AdminDashboard } from '@/pages/AdminDashboard'

function AppContent() {
  const { user, loading } = useAuth()

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center space-y-4">
          <div className="animate-pulse">
            <div className="w-16 h-16 bg-primary/20 rounded-full mx-auto"></div>
          </div>
          <p className="text-muted-foreground">読み込み中...</p>
        </div>
      </div>
    )
  }

  if (!user) {
    return <LoginForm />
  }

  // ロールに応じてルーティング
  switch (user.role) {
    case 'admin':
      return <AdminDashboard />
    case 'staff':
      return <AdminDashboard /> // 現在は管理者と同じ画面（後で分離）
    case 'customer':
      return (
        <div className="min-h-screen flex items-center justify-center bg-background">
          <div className="text-center space-y-4">
            <h1>顧客向けページ</h1>
            <p className="text-muted-foreground">顧客向け機能は今後実装予定です</p>
          </div>
        </div>
      )
    default:
      return <LoginForm />
  }
}

function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  )
}

export default App
