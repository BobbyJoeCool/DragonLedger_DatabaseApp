import { isElectron } from '@/lib/electronApi'

export function TitleBar() {
  if (!isElectron()) return null

  return (
    <div
      className="fixed top-0 left-0 right-0 z-40 flex h-10 items-center justify-center text-xs font-medium text-muted-foreground"
      style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
    >
      DragonLedger
    </div>
  )
}
