import { useState } from 'react'
import { Sidebar } from './components/Sidebar'
import { ProfilePage } from './pages/ProfilePage'
import { ReservationsPage } from './pages/ReservationsPage'
import { AlbumPage } from './pages/AlbumPage'
import { WantToPlayPage } from './pages/LikedScenariosPage'
import { SettingsPage } from './pages/SettingsPage'

export default function MyPage() {
  const [currentSubPage, setCurrentSubPage] = useState('profile')

  const renderContent = () => {
    switch (currentSubPage) {
      case 'profile':
        return <ProfilePage />
      case 'reservations':
        return <ReservationsPage />
      case 'album':
        return <AlbumPage />
      case 'want-to-play':
        return <WantToPlayPage />
      case 'settings':
        return <SettingsPage />
      default:
        return <ProfilePage />
    }
  }

  return (
    <div className="flex flex-col md:flex-row min-h-screen">
      <Sidebar currentPage={currentSubPage} onPageChange={setCurrentSubPage} />
      <div className="flex-1 px-4 py-2.5 xs:py-3 sm:py-4 md:py-6 bg-background overflow-y-auto pb-20 md:pb-0">
        <div className="max-w-7xl mx-auto">
          {renderContent()}
        </div>
      </div>
    </div>
  )
}
