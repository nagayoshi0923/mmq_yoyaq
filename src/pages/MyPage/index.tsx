import { useState } from 'react'
import { Header } from '@/components/layout/Header'
import { NavigationBar } from '@/components/layout/NavigationBar'
import { Sidebar } from './components/Sidebar'
import { ProfilePage } from './pages/ProfilePage'
import { ReservationsPage } from './pages/ReservationsPage'
import { GmHistoryPage } from './pages/GmHistoryPage'
import { AccountPage } from './pages/AccountPage'
import { SettingsPage } from './pages/SettingsPage'

export default function MyPage() {
  const [currentSubPage, setCurrentSubPage] = useState('profile')

  const handlePageChange = (pageId: string) => {
    window.location.hash = pageId === 'dashboard' ? '' : pageId
  }

  const renderContent = () => {
    switch (currentSubPage) {
      case 'profile':
        return <ProfilePage />
      case 'reservations':
        return <ReservationsPage />
      case 'gm-history':
        return <GmHistoryPage />
      case 'account':
        return <AccountPage />
      case 'settings':
        return <SettingsPage />
      default:
        return <ProfilePage />
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <Header onPageChange={handlePageChange} />
      <NavigationBar currentPage="my-page" onPageChange={handlePageChange} />

      <main className="flex">
        <Sidebar currentPage={currentSubPage} onPageChange={setCurrentSubPage} />
        <div className="flex-1 p-8">
          <div className="max-w-4xl">
            {renderContent()}
          </div>
        </div>
      </main>
    </div>
  )
}
