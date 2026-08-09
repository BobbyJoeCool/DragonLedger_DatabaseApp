import type { Background } from '@dragonledger/content-types'
import { SourceBadge } from '@/components/browse/SourceBadge'

function grantShapeToText(fixed: unknown, choices: { type: string }[]): string {
  const fixedText = Array.isArray(fixed)
    ? fixed.map((e) => (typeof e === 'string' ? e : (e as { name: string }).name)).join(', ')
    : Object.entries(fixed as Record<string, number>)
        .map(([k, v]) => `${k} +${v}`)
        .join(', ')
  const parts = [fixedText].filter(Boolean)
  if (choices.length > 0) parts.push(`+ ${choices.length} choice${choices.length > 1 ? 's' : ''}`)
  return parts.join(' ') || '—'
}

interface BackgroundExtraData {
  grantedFeat?: { name: string }
  equipment?: string
  unrecognizedTraits?: { name: string; description: string }[]
}

interface BackgroundCardProps {
  background: Background
}

export function BackgroundCard({ background }: BackgroundCardProps) {
  const extra = (background.extraData ?? {}) as BackgroundExtraData

  return (
    <div className="space-y-4 rounded-md border p-6 print:border-none">
      <div>
        <h2 className="text-2xl font-semibold">{background.name}</h2>
        <div className="mt-2">
          <SourceBadge sourceId={background.sourceId} />
        </div>
      </div>

      <dl className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1 text-sm">
        <div className="contents">
          <dt className="text-muted-foreground">Proficiencies</dt>
          <dd>{grantShapeToText(background.proficiencies.fixed, background.proficiencies.choices)}</dd>
        </div>
        <div className="contents">
          <dt className="text-muted-foreground">Ability Bonuses</dt>
          <dd>{grantShapeToText(background.abilityBonuses.fixed, background.abilityBonuses.choices)}</dd>
        </div>
        {extra.grantedFeat && (
          <div className="contents">
            <dt className="text-muted-foreground">Feat</dt>
            <dd>{extra.grantedFeat.name} (see Feat entry)</dd>
          </div>
        )}
        {extra.equipment && (
          <div className="contents">
            <dt className="text-muted-foreground">Equipment</dt>
            <dd>{extra.equipment}</dd>
          </div>
        )}
      </dl>

      {background.feature.length > 0 && (
        <div className="space-y-2 text-sm">
          <p className="font-medium">Feature</p>
          {background.feature.map((f, i) => (
            <div key={i}>
              <p className="font-medium">{f.name}</p>
              <p className="leading-relaxed">{f.description}</p>
            </div>
          ))}
        </div>
      )}

      <div className="space-y-2 text-sm leading-relaxed">
        {background.description.split('\n').map((paragraph, i) => (
          <p key={i}>{paragraph}</p>
        ))}
      </div>

      {extra.unrecognizedTraits && extra.unrecognizedTraits.length > 0 && (
        <div className="space-y-2 border-t pt-3 text-sm">
          <p className="font-medium">Additional Details</p>
          {extra.unrecognizedTraits.map((t, i) => (
            <div key={i}>
              <p className="font-medium">{t.name}</p>
              <p className="leading-relaxed whitespace-pre-line">{t.description}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
