import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router'
import type { Race, Subrace } from '@dragonledger/content-types'
import { apiFetch } from '@/api/client'
import { SourceBadge } from '@/components/browse/SourceBadge'
import { Divider, Shell, Subcard, cardStyles } from '@/components/cards/shared'

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
        <p className={cardStyles.sectionLabel}>Subraces</p>
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
        <p className="dl-muted">None yet.</p>
      )}
    </div>
  )
}

type SubraceRow = Subrace & { id: string }

function SubraceSubcard({ subrace }: { subrace: SubraceRow }) {
  return (
    <Subcard tabLabel="Subrace">
      <p className={cardStyles.entryName}>{subrace.name}</p>
      {(subrace.size || subrace.speed) && (
        <dl className={cardStyles.detailGrid}>
          {subrace.size && (
            <div className={cardStyles.detailRow}>
              <dt className={cardStyles.detailLabel}>Size</dt>
              <dd>{subrace.size.join(', ')}</dd>
            </div>
          )}
          {subrace.speed && (
            <div className={cardStyles.detailRow}>
              <dt className={cardStyles.detailLabel}>Speed</dt>
              <dd>Walk {subrace.speed.walk}</dd>
            </div>
          )}
        </dl>
      )}
      {subrace.traits.length > 0 && (
        <div className="mt-1 space-y-1 text-sm">
          {subrace.traits.map((t, i) => (
            <p key={i}>
              <span className={cardStyles.entryName}>{t.name}.</span> {t.description}
            </p>
          ))}
        </div>
      )}
    </Subcard>
  )
}

// Expanded mode fetches full Subrace records (not the {id,name} index the
// List mode's linked list uses) so each one can render as a full nested
// Subcard — see §3 of the handoff doc.
function RaceSubracesExpanded({ raceId }: { raceId: string }) {
  const { data } = useQuery({
    queryKey: ['subraces-of-race-full', raceId],
    queryFn: async (): Promise<SubraceRow[]> => {
      const res = await apiFetch(`/api/subraces?raceId=${raceId}`)
      if (!res.ok) throw new Error('Failed to load subraces')
      const body = (await res.json()) as { data: SubraceRow[] }
      return body.data
    },
  })

  if (!data || data.length === 0) return null

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {data.map((s) => (
        <SubraceSubcard key={s.id} subrace={s} />
      ))}
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
  /** List (`.page`) is the default DetailScreen view; Expanded (`.document`)
   *  nests full Subrace cards via Subcard instead of a linked list. */
  mode?: 'list' | 'expanded'
}

export function RaceCard({ race, id, mode = 'list' }: RaceCardProps) {
  const extra = (race.extraData ?? {}) as RaceExtraData
  const hasAdvanced = extra.rawAbility || extra.creatureType || extra.rawProficiency || extra.rawResist || extra.rawWeapons

  return (
    <Shell mode={mode === 'expanded' ? 'document' : 'page'} frameClassName="space-y-3">
      <div>
        <h2 className={cardStyles.cardHeading}>{race.name}</h2>
        <div className="mt-2">
          <SourceBadge sourceId={race.sourceId} />
        </div>
      </div>

      <Divider variant="major" />

      <dl className={cardStyles.detailGrid}>
        <div className={cardStyles.detailRow}>
          <dt className={cardStyles.detailLabel}>Size</dt>
          <dd>{race.size.join(', ')}</dd>
        </div>
        <div className={cardStyles.detailRow}>
          <dt className={cardStyles.detailLabel}>Speed</dt>
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
        <>
          <Divider variant="minor" />
          <div className="space-y-2 text-sm">
            <p className={cardStyles.sectionLabel}>Traits</p>
            {race.traits.map((t, i) => (
              <div key={i}>
                <p className={cardStyles.entryName}>
                  {t.name} <span className="font-normal dl-muted">(level {t.level})</span>
                </p>
                <p className="leading-relaxed">{t.description}</p>
              </div>
            ))}
          </div>
        </>
      )}

      <Divider variant="minor" />
      <div className={cardStyles.proseSection}>
        {race.description.split('\n').map((paragraph, i) => (
          <p key={i}>{paragraph}</p>
        ))}
      </div>

      <Divider variant="minor" />
      {mode === 'expanded' ? <RaceSubracesExpanded raceId={id} /> : <RaceSubracesList raceId={id} />}

      {hasAdvanced && (
        <>
          <Divider variant="minor" />
          <div className={cardStyles.additionalDetailsWrap}>
            <p className={cardStyles.sectionLabel}>Additional Details</p>
            <dl className={cardStyles.detailGrid}>
              {extra.creatureType && (
                <div className={cardStyles.detailRow}>
                  <dt className={cardStyles.detailLabel}>Creature Type</dt>
                  <dd>{extra.creatureType}</dd>
                </div>
              )}
              {extra.rawAbility && (
                <div className={cardStyles.detailRow}>
                  <dt className={cardStyles.detailLabel}>Ability (raw)</dt>
                  <dd>{extra.rawAbility}</dd>
                </div>
              )}
              {extra.rawProficiency && (
                <div className={cardStyles.detailRow}>
                  <dt className={cardStyles.detailLabel}>Proficiency (raw)</dt>
                  <dd>{extra.rawProficiency}</dd>
                </div>
              )}
              {extra.rawResist && (
                <div className={cardStyles.detailRow}>
                  <dt className={cardStyles.detailLabel}>Resistance (raw)</dt>
                  <dd>{extra.rawResist}</dd>
                </div>
              )}
              {extra.rawWeapons && (
                <div className={cardStyles.detailRow}>
                  <dt className={cardStyles.detailLabel}>Weapons (raw)</dt>
                  <dd>{extra.rawWeapons}</dd>
                </div>
              )}
            </dl>
          </div>
        </>
      )}
    </Shell>
  )
}
