import { Moon, Sun } from 'lucide-react'
import { useTheme } from './ThemeProvider'

export function ThemeToggle() {
  const { resolved, setTheme } = useTheme()

  return (
    <button
      type="button"
      onClick={() => setTheme(resolved === 'dark' ? 'light' : 'dark')}
      className="rounded p-2 text-sidebar-foreground hover:bg-sidebar-accent/50"
      aria-label={`Switch to ${resolved === 'dark' ? 'light' : 'dark'} mode`}
    >
      {resolved === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
    </button>
  )
}
