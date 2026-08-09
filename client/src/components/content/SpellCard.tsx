import type { Spell } from '@dragonledger/content-types'
import { SourceBadge } from '@/components/browse/SourceBadge'

// Full-content, printable card (Documentation/card-design-spec.md) for a
// single Spell — SpellForm (Phase 7 §1.6) mirrors this exact field order.
// A separate component from SpellForm, not a shared toggle-to-edit one.

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
    <div className="contents">
      <dt className="text-muted-foreground">{label}</dt>
      <dd>{value}</dd>
    </div>
  )
}

interface SpellCardProps {
  spell: Spell
}

export function SpellCard({ spell }: SpellCardProps) {
  const extra = (spell.extraData ?? {}) as SpellExtraData
  const hasAdvancedDetails =
    extra.damageRoll ||
    extra.damageTypes ||
    extra.savingThrow ||
    extra.attackRoll ||
    extra.targetType ||
    extra.shapeType ||
    extra.reactionCondition ||
    extra.materialCost ||
    extra.materialConsumed ||
    (extra.scaling && extra.scaling.length > 0)

  return (
    <div className="space-y-4 rounded-md border p-6 print:border-none">
      <div>
        <h2 className="text-2xl font-semibold">
          {spell.name}
          {spell.ritual ? <span className="ml-2 text-base font-normal text-muted-foreground">(ritual)</span> : null}
        </h2>
        <p className="italic text-muted-foreground">{levelSchoolLine(spell)}</p>
        <div className="mt-2">
          <SourceBadge sourceId={spell.sourceId} />
        </div>
      </div>

      <dl className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1 text-sm">
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

      <div className="space-y-2 text-sm leading-relaxed">
        {spell.description.split('\n').map((paragraph, i) => (
          <p key={i}>{paragraph}</p>
        ))}
      </div>

      {spell.higherLevels && (
        <div className="text-sm leading-relaxed">
          <p className="font-medium">At Higher Levels</p>
          <p>{spell.higherLevels}</p>
        </div>
      )}

      {hasAdvancedDetails && (
        <div className="space-y-1 border-t pt-3 text-sm">
          <p className="font-medium">Additional Details</p>
          <dl className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1">
            {extra.damageRoll && (
              <DetailRow
                label="Damage"
                value={`${extra.damageRoll}${extra.damageTypes ? ` ${extra.damageTypes.join('/')}` : ''}`}
              />
            )}
            {extra.savingThrow && <DetailRow label="Saving Throw" value={extra.savingThrow} />}
            {extra.attackRoll && <DetailRow label="Attack Roll" value="Yes" />}
            {extra.targetType && (
              <DetailRow
                label="Target"
                value={`${extra.targetCount ?? ''} ${extra.targetType}`.trim()}
              />
            )}
            {extra.shapeType && (
              <DetailRow
                label="Area"
                value={`${extra.shapeSize ?? ''} ${extra.shapeSizeUnit ?? ''} ${extra.shapeType}`.trim()}
              />
            )}
            {extra.reactionCondition && <DetailRow label="Reaction Trigger" value={extra.reactionCondition} />}
            {extra.materialCost && <DetailRow label="Material Cost" value={extra.materialCost} />}
            {extra.materialConsumed && <DetailRow label="Material Consumed" value="Yes" />}
          </dl>
          {extra.scaling && extra.scaling.length > 0 && (
            <div>
              <p className="mt-2 font-medium">Scaling</p>
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
      )}
    </div>
  )
}
