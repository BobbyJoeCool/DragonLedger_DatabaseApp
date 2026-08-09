import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router'
import type { Race } from '@dragonledger/content-types'
import { apiFetch } from '@/api/client'
import { SourceBadge } from '@/components/browse/SourceBadge'

interface RaceExtraData {
  rawAbility?: string
  creatureType?: string
  rawProficiency?: string
  rawResist?: string
  rawWeapons?: string
  otherTags?: string[]
}

interface SubraceListEntry {
  id: string
  name: string
}

function RaceSubracesList({ raceId }: { raceId: string }) {
  const { data } = useQuery({
    queryKey: ['subraces-of-race', raceId],
    queryFn: async (): Promise<SubraceListEntry[]> => {
      const res = await apiFetch(`/api/subraces?raceId=${raceId}&fields=name`)
      if (!res.ok) throw new Error('Failed to load subraces')
      return res.json() as Promise<SubraceListEntry[]>
    },
  })

  const isSignedIn = Boolean(sessionStorage.getItem('app-password'))

  return (
    <div className="text-sm">
      <div className="flex items-center justify-between">
        <p className="font-medium">Subraces</p>
        {isSignedIn && (
          <Link
            to={`/browse/races/${raceId}/subraces/new`}
            className="text-xs text-primary hover:underline"
          >
            + New Subrace
          </Link>
        )}
      </div>
      {data && data.length > 0 ? (
        <ul className="list-inside list-disc">
          {data.map((s) => (
            <li key={s.id}>
              <Link to={`/browse/subraces/${s.id}`} className="text-primary hover:underline">
                {s.name}
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-muted-foreground">None yet.</p>
      )}
    </div>
  )
}

interface RaceCardProps {
  // `Race` (the Zod-schema-derived type) has no `id` field — it isn't part
  // of the content schema, only the Prisma row — so the real API response
  // this is cast from always carries one at runtime; accept it separately
  // rather than pretending `Race` has it.
  race: Race
  id: string
}

export function RaceCard({ race, id }: RaceCardProps) {
  const extra = (race.extraData ?? {}) as RaceExtraData
  const hasAdvanced = extra.rawAbility || extra.creatureType || extra.rawProficiency || extra.rawResist || extra.rawWeapons

  return (
    <div className="space-y-4 rounded-md border p-6 print:border-none">
      <div>
        <h2 className="text-2xl font-semibold">{race.name}</h2>
        <div className="mt-2">
          <SourceBadge sourceId={race.sourceId} />
        </div>
      </div>

      <dl className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1 text-sm">
        <div className="contents">
          <dt className="text-muted-foreground">Size</dt>
          <dd>{race.size.join(', ')}</dd>
        </div>
        <div className="contents">
          <dt className="text-muted-foreground">Speed</dt>
          <dd>
            {[
              `Walk ${race.speed.walk}`,
              race.speed.fly !== undefined ? `Fly ${race.speed.fly}` : null,
              race.speed.swim !== undefined ? `Swim ${race.speed.swim}` : null,
            ]
              .filter(Boolean)
              .join(', ')}
          </dd>
        </div>
      </dl>

      {race.traits.length > 0 && (
        <div className="space-y-2 text-sm">
          <p className="font-medium">Traits</p>
          {race.traits.map((t, i) => (
            <div key={i}>
              <p className="font-medium">
                {t.name} <span className="font-normal text-muted-foreground">(level {t.level})</span>
              </p>
              <p className="leading-relaxed">{t.description}</p>
            </div>
          ))}
        </div>
      )}

      <div className="space-y-2 text-sm leading-relaxed">
        {race.description.split('\n').map((paragraph, i) => (
          <p key={i}>{paragraph}</p>
        ))}
      </div>

      <RaceSubracesList raceId={id} />

      {hasAdvanced && (
        <div className="space-y-1 border-t pt-3 text-sm">
          <p className="font-medium">Additional Details</p>
          <dl className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1">
            {extra.creatureType && (
              <div className="contents">
                <dt className="text-muted-foreground">Creature Type</dt>
                <dd>{extra.creatureType}</dd>
              </div>
            )}
            {extra.rawAbility && (
              <div className="contents">
                <dt className="text-muted-foreground">Ability (raw)</dt>
                <dd>{extra.rawAbility}</dd>
              </div>
            )}
            {extra.rawProficiency && (
              <div className="contents">
                <dt className="text-muted-foreground">Proficiency (raw)</dt>
                <dd>{extra.rawProficiency}</dd>
              </div>
            )}
            {extra.rawResist && (
              <div className="contents">
                <dt className="text-muted-foreground">Resistance (raw)</dt>
                <dd>{extra.rawResist}</dd>
              </div>
            )}
            {extra.rawWeapons && (
              <div className="contents">
                <dt className="text-muted-foreground">Weapons (raw)</dt>
                <dd>{extra.rawWeapons}</dd>
              </div>
            )}
          </dl>
        </div>
      )}
    </div>
  )
}
