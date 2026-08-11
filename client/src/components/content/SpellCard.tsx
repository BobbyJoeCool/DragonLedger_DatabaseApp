import type { Spell } from '@dragonledger/content-types'
import { SourceBadge } from '@/components/browse/SourceBadge'
import { Divider, Shell, cardStyles, spellFooterFromExtraData } from '@/components/cards/shared'

// Full-content, printable card (Documentation/card-design-spec.md) for a
// single Spell — SpellForm (Phase 7 §1.6) mirrors this exact field order.
// A separate component from SpellForm, not a shared toggle-to-edit one.
// List mode only (`.page`) — the 2.5x3.5in trading-card render target from
// §3 of the card-theming handoff is a separate, not-yet-built UI surface
// (its own greedy-pagination sheet view, not a DetailScreen replacement).

function ordinal(n: number): string {
  const suffixes: Record<number, string> = { 1: 'st', 2: 'nd', 3: 'rd' }
  const suffix = n % 100 >= 11 && n % 100 <= 13 ? 'th' : (suffixes[n % 10] ?? 'th')
  return `${n}${suffix}`
}

function levelSchoolLine(spell: Spell): string {
  const school = spell.school || 'unknown school'
  return spell.level === 0 ? `${school} cantrip` : `${ordinal(spell.level)}-level ${school}`
}

interface SpellExtraData {
  damageRoll?: string
  damageTypes?: string[]
  savingThrow?: string
  attackRoll?: boolean
  targetType?: string
  targetCount?: number
  shapeType?: string
  shapeSize?: number
  shapeSizeUnit?: string
  reactionCondition?: string
  materialCost?: string
  materialConsumed?: boolean
  scaling?: { trigger: string; triggerValue: number | null; dice: string; description: string | null }[]
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className={cardStyles.detailRow}>
      <dt className={cardStyles.detailLabel}>{label}</dt>
      <dd>{value}</dd>
    </div>
  )
}

interface SpellCardProps {
  spell: Spell
}

export function SpellCard({ spell }: SpellCardProps) {
  const extra = (spell.extraData ?? {}) as SpellExtraData
  const footer = spellFooterFromExtraData(spell.extraData)
  const hasAdvancedDetails =
    footer.damage ||
    footer.save ||
    footer.area ||
    extra.attackRoll ||
    extra.targetType ||
    extra.reactionCondition ||
    extra.materialCost ||
    extra.materialConsumed ||
    (extra.scaling && extra.scaling.length > 0)

  return (
    <Shell mode="page" frameClassName="space-y-3">
      <div>
        <h2 className={cardStyles.cardHeading}>
          {spell.name}
          {spell.ritual ? <span className="ml-2 text-base font-normal dl-muted">(ritual)</span> : null}
        </h2>
        <p className={cardStyles.subheading}>{levelSchoolLine(spell)}</p>
        <div className="mt-2">
          <SourceBadge sourceId={spell.sourceId} />
        </div>
      </div>

      <Divider variant="major" />

      <dl className={cardStyles.detailGrid}>
        <DetailRow label="Casting Time" value={spell.castingTime} />
        <DetailRow label="Range" value={spell.range} />
        <DetailRow
          label="Components"
          value={spell.material ? `${spell.components} (${spell.material})` : spell.components}
        />
        <DetailRow
          label="Duration"
          value={spell.concentration ? `${spell.duration} (Concentration)` : spell.duration}
        />
        <DetailRow label="Classes" value={spell.classes.join(', ') || '—'} />
      </dl>

      <Divider variant="minor" />

      <div className={cardStyles.proseSection}>
        {spell.description.split('\n').map((paragraph, i) => (
          <p key={i}>{paragraph}</p>
        ))}
      </div>

      {spell.higherLevels && (
        <div className="text-sm leading-relaxed">
          <p className={cardStyles.sectionLabel}>At Higher Levels</p>
          <p>{spell.higherLevels}</p>
        </div>
      )}

      {hasAdvancedDetails && (
        <>
          <Divider variant="minor" />
          <div className={cardStyles.additionalDetailsWrap}>
            <p className={cardStyles.sectionLabel}>Additional Details</p>
            <dl className={cardStyles.detailGrid}>
              {footer.damage && (
                <DetailRow label="Damage" value={`${footer.damage.roll} ${footer.damage.types.join('/')}`} />
              )}
              {footer.save && <DetailRow label="Saving Throw" value={footer.save} />}
              {extra.attackRoll && <DetailRow label="Attack Roll" value="Yes" />}
              {extra.targetType && (
                <DetailRow label="Target" value={`${extra.targetCount ?? ''} ${extra.targetType}`.trim()} />
              )}
              {footer.area && (
                <DetailRow
                  label="Area"
                  value={`${footer.area.shapeSize} ${footer.area.shapeSizeUnit ?? ''} ${footer.area.shapeType}`.trim()}
                />
              )}
              {extra.reactionCondition && <DetailRow label="Reaction Trigger" value={extra.reactionCondition} />}
              {extra.materialCost && <DetailRow label="Material Cost" value={extra.materialCost} />}
              {extra.materialConsumed && <DetailRow label="Material Consumed" value="Yes" />}
            </dl>
            {extra.scaling && extra.scaling.length > 0 && (
              <div>
                <p className={'mt-2 ' + cardStyles.sectionLabel}>Scaling</p>
                <ul className="list-inside list-disc">
                  {extra.scaling.map((entry, i) => (
                    <li key={i}>
                      {entry.trigger === 'character_level' ? 'Character level' : 'Slot level'}{' '}
                      {entry.triggerValue ?? '?'}: {entry.dice}
                      {entry.description ? ` — ${entry.description}` : ''}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </>
      )}
    </Shell>
  )
}
