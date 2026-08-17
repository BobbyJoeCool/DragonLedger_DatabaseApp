import { NavLink, useNavigate } from 'react-router'
import { isElectron } from '@/lib/electronApi'
import { ThemeToggle } from '../ThemeToggle'

const navItems = [
  { to: '/browse', label: 'Browse' },
  { to: '/create', label: 'Create' },
  { to: '/display', label: 'Display' },
  { to: '/sources', label: 'Sources' },
]

export function Sidebar() {
  const navigate = useNavigate()
  const isSignedIn = Boolean(sessionStorage.getItem('app-password'))

  function handleSignOut() {
    sessionStorage.removeItem('app-password')
    navigate('/login')
  }

  return (
    <aside className="flex w-56 flex-col border-r bg-sidebar">
      <div className={`border-b p-4 ${isElectron() ? 'pl-20' : ''}`}>
        <h1 className="text-sm font-semibold">DragonLedger</h1>
      </div>
      <nav className="flex-1 space-y-1 p-2">
        {navItems.map(({ to, label }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              `block rounded px-3 py-2 text-sm transition-colors ${
                isActive
                  ? 'bg-sidebar-accent font-medium text-sidebar-accent-foreground'
                  : 'text-sidebar-foreground hover:bg-sidebar-accent/50'
              }`
            }
          >
            {label}
          </NavLink>
        ))}
      </nav>
      <div className="border-t p-2">
        <div className="flex items-center justify-between">
          {isSignedIn ? (
            <button
              type="button"
              onClick={handleSignOut}
              className="rounded px-3 py-2 text-left text-sm text-sidebar-foreground hover:bg-sidebar-accent/50"
            >
              Sign out
            </button>
          ) : (
            <NavLink
              to="/login"
              className="block rounded px-3 py-2 text-sm text-sidebar-foreground hover:bg-sidebar-accent/50"
            >
              Sign in
            </NavLink>
          )}
          <ThemeToggle />
        </div>
      </div>
    </aside>
  )
}
