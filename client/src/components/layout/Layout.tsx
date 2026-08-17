import { Outlet } from 'react-router'
import { isElectron } from '@/lib/electronApi'
import { Sidebar } from './Sidebar'
import { TitleBar } from './TitleBar'

export function Layout() {
  const insetPadding = isElectron() ? 'pt-10' : ''

  return (
    <>
      <TitleBar />
      <div className={`flex h-screen ${insetPadding}`}>
        <Sidebar />
        <main className="flex-1 overflow-y-auto p-6">
          <Outlet />
        </main>
      </div>
    </>
  )
}
