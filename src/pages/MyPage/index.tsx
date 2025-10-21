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
    <div className="flex">
      <Sidebar currentPage={currentSubPage} onPageChange={setCurrentSubPage} />
      <div className="flex-1 p-8">
        <div className="max-w-4xl">
          {renderContent()}
        </div>
      </div>
    </div>
  )
}
