import type { Source } from '@/hooks/useSources'
import { SourceRow } from './SourceRow'

interface SourcesTableProps {
  sources: Source[]
  isSignedIn: boolean
}

export function SourcesTable({ sources, isSignedIn }: SourcesTableProps) {
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b text-left text-muted-foreground">
          <th className="px-3 py-2 font-medium">Name</th>
          <th className="px-3 py-2 font-medium">Type</th>
          <th className="px-3 py-2 text-right font-medium">Entries</th>
          <th className="px-3 py-2 font-medium">Last Updated</th>
          <th className="px-3 py-2"></th>
        </tr>
      </thead>
      <tbody>
        {sources.map((source) => (
          <SourceRow key={source.id} source={source} isSignedIn={isSignedIn} />
        ))}
      </tbody>
    </table>
  )
}
