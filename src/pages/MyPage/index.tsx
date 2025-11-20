import { useState } from 'react'
import { Sidebar } from './components/Sidebar'
import { ProfilePage } from './pages/ProfilePage'
import { ReservationsPage } from './pages/ReservationsPage'
import { PlayedScenariosPage } from './pages/PlayedScenariosPage'
import { WantToPlayPage } from './pages/LikedScenariosPage'
import { GmHistoryPage } from './pages/GmHistoryPage'
import { AccountPage } from './pages/AccountPage'
import { SettingsPage } from './pages/SettingsPage'

export default function MyPage() {
  const [currentSubPage, setCurrentSubPage] = useState('profile')

  const renderContent = () => {
    switch (currentSubPage) {
      case 'profile':
        return <ProfilePage />
      case 'reservations':
        return <ReservationsPage />
      case 'played-scenarios':
        return <PlayedScenariosPage />
      case 'want-to-play':
        return <WantToPlayPage />
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
    <div className="flex flex-col md:flex-row min-h-screen">
      <Sidebar currentPage={currentSubPage} onPageChange={setCurrentSubPage} />
      <div className="flex-1 px-2.5 xs:px-3 sm:px-4 md:px-8 py-2.5 xs:py-3 sm:py-4 md:py-8 bg-background overflow-y-auto pb-20 md:pb-0">
        <div className="max-w-4xl mx-auto">
          {renderContent()}
        </div>
      </div>
    </div>
  )
}
