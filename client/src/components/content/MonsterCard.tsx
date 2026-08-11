import { useRef, useLayoutEffect } from 'react'
import type { Monster, MonsterAction, ResistanceEntry } from '@dragonledger/content-types'
import { SourceBadge } from '@/components/browse/SourceBadge'
import { Divider, Shell, cardStyles, suppressEdgeDividers, useFitToPage } from '@/components/cards/shared'

interface MonsterExtraData {
  armorClassDetail?: string
  lairActions?: string[]
  traits?: { name: string; description: string }[]
  spellcasting?: {
    ability?: string
    saveDC?: number
    atWill?: string[]
    cantrips?: string[]
    limitedUse?: { frequency: string; spells: string[] }[]
    slots?: Record<string, string[]>
  }
  proficiencyBonus?: number
  // A count (uses per day), not descriptive text — real data confirms this
  // (e.g. 0 or 3), and 0 is a meaningful value here, not "absent."
  legendaryResistances?: number
  category?: string
  subcategory?: string
}

function resistanceLine(entries: ResistanceEntry[]): string {
  return entries
    .map((e) => {
      const types = e.types.join(', ')
      if (e.nonmagical) {
        return `${types} from nonmagical attacks${e.bypassedBy ? ` (unless ${e.bypassedBy})` : ''}`
      }
      return types
    })
    .join('; ')
}

function ActionBlock({ action }: { action: MonsterAction }) {
  return (
    <div className="break-inside-avoid">
      <p className={cardStyles.sectionLabel}>
        <span className={cardStyles.entryName}>{action.name}</span>
        {action.toHitMod !== undefined && action.toHitMod !== null ? ` (+${action.toHitMod} to hit)` : ''}
      </p>
      <p className="leading-relaxed">{action.description}</p>
      {action.damage && <p className="dl-muted">{action.damage}</p>}
    </div>
  )
}

interface MonsterCardProps {
  monster: Monster
}

// Monster is the one type with its own width/scale logic (useFitToPage's
// `monster` mode) and per-section independent multi-column layout — §3/§5
// of the handoff doc are explicit that this is NOT one shared multi-column
// flow (a real cross-browser bug during the demo phase), so each section
// below (Stat Block, Traits, Actions, Legendary, Lair) gets its own
// `.dl-section-cols` container.
export function MonsterCard({ monster }: MonsterCardProps) {
  const extra = (monster.extraData ?? {}) as MonsterExtraData
  const speed = monster.speed as Record<string, unknown>
  const speedEntries = Object.entries(speed).filter(([k, v]) => k !== 'unit' && typeof v === 'number' && v > 0)

  const contentRef = useRef<HTMLDivElement>(null)
  const fit = useFitToPage(contentRef, 'monster')
  const columnClass = fit.width === 'half' ? 'dl-cols-1' : 'dl-cols-2'

  useLayoutEffect(() => {
    if (contentRef.current && fit.settled) {
      for (const section of contentRef.current.querySelectorAll<HTMLElement>('.dl-section-cols')) {
        suppressEdgeDividers(section)
      }
    }
  }, [fit.settled, fit.width, fit.scale])

  const frameStyle = fit.scale !== 1 ? { transform: `scale(${fit.scale})`, transformOrigin: 'top left' } : undefined

  return (
    <Shell mode="page" frameClassName={fit.widthClassName} frameStyle={frameStyle}>
      <div ref={contentRef} className="space-y-3">
        <div>
          <h2 className={cardStyles.cardHeading}>{monster.name}</h2>
          <p className={cardStyles.subheading}>
            {monster.size} {monster.monsterType}, {monster.alignment}
          </p>
          <div className="mt-2">
            <SourceBadge sourceId={monster.sourceId} />
          </div>
        </div>

        <Divider variant="major" />

        <div className={'dl-section-cols ' + columnClass}>
          <dl className={cardStyles.detailGrid}>
            <div className={cardStyles.detailRow}>
              <dt className={cardStyles.detailLabel}>Armor Class</dt>
              <dd>
                {monster.armorClass}
                {extra.armorClassDetail ? ` (${extra.armorClassDetail})` : ''}
              </dd>
            </div>
            <div className={cardStyles.detailRow}>
              <dt className={cardStyles.detailLabel}>Hit Points</dt>
              <dd>
                {monster.hitPoints} ({monster.hitDice})
              </dd>
            </div>
            <div className={cardStyles.detailRow}>
              <dt className={cardStyles.detailLabel}>Speed</dt>
              <dd>
                {speedEntries.map(([k, v]) => `${k} ${v}`).join(', ')} {String(speed.unit ?? 'feet')}
              </dd>
            </div>
            <div className={cardStyles.detailRow}>
              <dt className={cardStyles.detailLabel}>Challenge Rating</dt>
              <dd>
                {monster.challengeRating} ({monster.experiencePoints} XP)
              </dd>
            </div>
          </dl>

          <Divider variant="major" />

          <div className="grid grid-cols-6 gap-2 text-center text-sm break-inside-avoid">
            {Object.entries(monster.abilityScores).map(([ability, score]) => (
              <div key={ability}>
                <p className="dl-muted">{ability.slice(0, 3).toUpperCase()}</p>
                <p className="font-medium">{score}</p>
              </div>
            ))}
          </div>

          {/* Forced column break here, deliberately no divider — the
              column gap itself is the separator (decision log). */}
          <dl className={cardStyles.detailGrid + ' dl-column-break'}>
            {monster.savingThrows && Object.keys(monster.savingThrows).length > 0 && (
              <div className={cardStyles.detailRow}>
                <dt className={cardStyles.detailLabel}>Saving Throws</dt>
                <dd>{Object.entries(monster.savingThrows).map(([k, v]) => `${k} +${v}`).join(', ')}</dd>
              </div>
            )}
            {monster.skills && Object.keys(monster.skills).length > 0 && (
              <div className={cardStyles.detailRow}>
                <dt className={cardStyles.detailLabel}>Skills</dt>
                <dd>{Object.entries(monster.skills).map(([k, v]) => `${k} +${v}`).join(', ')}</dd>
              </div>
            )}
            {monster.damageVulnerabilities && monster.damageVulnerabilities.length > 0 && (
              <div className={cardStyles.detailRow}>
                <dt className={cardStyles.detailLabel}>Vulnerabilities</dt>
                <dd>{resistanceLine(monster.damageVulnerabilities)}</dd>
              </div>
            )}
            {monster.damageResistances && monster.damageResistances.length > 0 && (
              <div className={cardStyles.detailRow}>
                <dt className={cardStyles.detailLabel}>Resistances</dt>
                <dd>{resistanceLine(monster.damageResistances)}</dd>
              </div>
            )}
            {monster.damageImmunities && monster.damageImmunities.length > 0 && (
              <div className={cardStyles.detailRow}>
                <dt className={cardStyles.detailLabel}>Damage Immunities</dt>
                <dd>{resistanceLine(monster.damageImmunities)}</dd>
              </div>
            )}
            {monster.conditionImmunities && monster.conditionImmunities.length > 0 && (
              <div className={cardStyles.detailRow}>
                <dt className={cardStyles.detailLabel}>Condition Immunities</dt>
                <dd>{resistanceLine(monster.conditionImmunities)}</dd>
              </div>
            )}
            {monster.senses && (
              <div className={cardStyles.detailRow}>
                <dt className={cardStyles.detailLabel}>Senses</dt>
                <dd>{monster.senses}</dd>
              </div>
            )}
            {monster.languages && (
              <div className={cardStyles.detailRow}>
                <dt className={cardStyles.detailLabel}>Languages</dt>
                <dd>{monster.languages}</dd>
              </div>
            )}
          </dl>
        </div>

        {extra.traits && extra.traits.length > 0 && (
          <>
            <Divider variant="minor" />
            <div className={'dl-section-cols space-y-2 text-sm ' + columnClass}>
              <p className={cardStyles.sectionLabel + ' dl-column-span'}>Traits</p>
              {extra.traits.map((t, i) => (
                <div key={i} className="break-inside-avoid">
                  <p className={cardStyles.entryName}>{t.name}</p>
                  <p className="leading-relaxed">{t.description}</p>
                </div>
              ))}
            </div>
          </>
        )}

        {monster.actions.length > 0 && (
          <>
            <Divider variant="minor" />
            <div className={'dl-section-cols space-y-2 text-sm ' + columnClass}>
              <p className={cardStyles.sectionLabel + ' dl-column-span'}>Actions</p>
              {monster.actions.map((a, i) => (
                <ActionBlock key={i} action={a} />
              ))}
            </div>
          </>
        )}

        {monster.legendaryActions && monster.legendaryActions.length > 0 && (
          <>
            <Divider variant="minor" />
            <div className={'dl-section-cols space-y-2 text-sm ' + columnClass}>
              <p className={cardStyles.sectionLabel + ' dl-column-span'}>Legendary Actions</p>
              {monster.legendaryActions.map((a, i) => (
                <ActionBlock key={i} action={a} />
              ))}
            </div>
          </>
        )}

        {extra.lairActions && extra.lairActions.length > 0 && (
          <>
            <Divider variant="minor" />
            <div className={'dl-section-cols space-y-1 text-sm ' + columnClass}>
              <p className={cardStyles.sectionLabel + ' dl-column-span'}>Lair Actions</p>
              <ul className="list-inside list-disc">
                {extra.lairActions.map((a, i) => (
                  <li key={i} className="break-inside-avoid">
                    {a}
                  </li>
                ))}
              </ul>
            </div>
          </>
        )}

        {extra.spellcasting && (
          <>
            <Divider variant="minor" />
            <div className="space-y-1 text-sm">
              <p className={cardStyles.sectionLabel}>Spellcasting</p>
              {extra.spellcasting.ability && (
                <p>
                  {extra.spellcasting.ability}
                  {extra.spellcasting.saveDC ? `, save DC ${extra.spellcasting.saveDC}` : ''}
                </p>
              )}
              {extra.spellcasting.cantrips && extra.spellcasting.cantrips.length > 0 && (
                <p>Cantrips: {extra.spellcasting.cantrips.join(', ')}</p>
              )}
              {extra.spellcasting.atWill && extra.spellcasting.atWill.length > 0 && (
                <p>At will: {extra.spellcasting.atWill.join(', ')}</p>
              )}
              {extra.spellcasting.limitedUse?.map((lu, i) => (
                <p key={i}>
                  {lu.frequency}: {lu.spells.join(', ')}
                </p>
              ))}
              {extra.spellcasting.slots &&
                Object.entries(extra.spellcasting.slots).map(([level, spells]) => (
                  <p key={level}>
                    Level {level}: {spells.join(', ')}
                  </p>
                ))}
            </div>
          </>
        )}

        {monster.description && (
          <>
            <Divider variant="minor" />
            <div className={cardStyles.proseSection}>
              {monster.description.split('\n').map((paragraph, i) => (
                <p key={i}>{paragraph}</p>
              ))}
            </div>
          </>
        )}

        {(extra.category ||
          extra.subcategory ||
          extra.proficiencyBonus != null ||
          extra.legendaryResistances != null) && (
          <>
            <Divider variant="minor" />
            <div className={cardStyles.additionalDetailsWrap}>
              <p className={cardStyles.sectionLabel}>Additional Details</p>
              <dl className={cardStyles.detailGrid}>
                {extra.proficiencyBonus != null && (
                  <div className={cardStyles.detailRow}>
                    <dt className={cardStyles.detailLabel}>Proficiency Bonus</dt>
                    <dd>+{extra.proficiencyBonus}</dd>
                  </div>
                )}
                {extra.legendaryResistances != null && (
                  <div className={cardStyles.detailRow}>
                    <dt className={cardStyles.detailLabel}>Legendary Resistances</dt>
                    <dd>{extra.legendaryResistances}/Day</dd>
                  </div>
                )}
                {extra.category && (
                  <div className={cardStyles.detailRow}>
                    <dt className={cardStyles.detailLabel}>Category</dt>
                    <dd>{extra.category}</dd>
                  </div>
                )}
                {extra.subcategory && (
                  <div className={cardStyles.detailRow}>
                    <dt className={cardStyles.detailLabel}>Subcategory</dt>
                    <dd>{extra.subcategory}</dd>
                  </div>
                )}
              </dl>
            </div>
          </>
        )}
      </div>
    </Shell>
  )
}
