import type { Monster, MonsterAction, ResistanceEntry } from '@dragonledger/content-types'
import { SourceBadge } from '@/components/browse/SourceBadge'

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
    <div>
      <p className="font-medium">
        {action.name}
        {action.toHitMod !== undefined && action.toHitMod !== null ? ` (+${action.toHitMod} to hit)` : ''}
      </p>
      <p className="leading-relaxed">{action.description}</p>
      {action.damage && <p className="text-muted-foreground">{action.damage}</p>}
    </div>
  )
}

interface MonsterCardProps {
  monster: Monster
}

export function MonsterCard({ monster }: MonsterCardProps) {
  const extra = (monster.extraData ?? {}) as MonsterExtraData
  const speed = monster.speed as Record<string, unknown>
  const speedEntries = Object.entries(speed).filter(([k, v]) => k !== 'unit' && typeof v === 'number' && v > 0)

  return (
    <div className="space-y-4 rounded-md border p-6 print:border-none">
      <div>
        <h2 className="text-2xl font-semibold">{monster.name}</h2>
        <p className="italic text-muted-foreground">
          {monster.size} {monster.monsterType}, {monster.alignment}
        </p>
        <div className="mt-2">
          <SourceBadge sourceId={monster.sourceId} />
        </div>
      </div>

      <dl className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1 text-sm">
        <div className="contents">
          <dt className="text-muted-foreground">Armor Class</dt>
          <dd>
            {monster.armorClass}
            {extra.armorClassDetail ? ` (${extra.armorClassDetail})` : ''}
          </dd>
        </div>
        <div className="contents">
          <dt className="text-muted-foreground">Hit Points</dt>
          <dd>
            {monster.hitPoints} ({monster.hitDice})
          </dd>
        </div>
        <div className="contents">
          <dt className="text-muted-foreground">Speed</dt>
          <dd>
            {speedEntries.map(([k, v]) => `${k} ${v}`).join(', ')} {String(speed.unit ?? 'feet')}
          </dd>
        </div>
        <div className="contents">
          <dt className="text-muted-foreground">Challenge Rating</dt>
          <dd>
            {monster.challengeRating} ({monster.experiencePoints} XP)
          </dd>
        </div>
      </dl>

      <div className="grid grid-cols-6 gap-2 text-center text-sm">
        {Object.entries(monster.abilityScores).map(([ability, score]) => (
          <div key={ability}>
            <p className="text-muted-foreground">{ability.slice(0, 3).toUpperCase()}</p>
            <p className="font-medium">{score}</p>
          </div>
        ))}
      </div>

      <dl className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1 text-sm">
        {monster.savingThrows && Object.keys(monster.savingThrows).length > 0 && (
          <div className="contents">
            <dt className="text-muted-foreground">Saving Throws</dt>
            <dd>{Object.entries(monster.savingThrows).map(([k, v]) => `${k} +${v}`).join(', ')}</dd>
          </div>
        )}
        {monster.skills && Object.keys(monster.skills).length > 0 && (
          <div className="contents">
            <dt className="text-muted-foreground">Skills</dt>
            <dd>{Object.entries(monster.skills).map(([k, v]) => `${k} +${v}`).join(', ')}</dd>
          </div>
        )}
        {monster.damageVulnerabilities && monster.damageVulnerabilities.length > 0 && (
          <div className="contents">
            <dt className="text-muted-foreground">Vulnerabilities</dt>
            <dd>{resistanceLine(monster.damageVulnerabilities)}</dd>
          </div>
        )}
        {monster.damageResistances && monster.damageResistances.length > 0 && (
          <div className="contents">
            <dt className="text-muted-foreground">Resistances</dt>
            <dd>{resistanceLine(monster.damageResistances)}</dd>
          </div>
        )}
        {monster.damageImmunities && monster.damageImmunities.length > 0 && (
          <div className="contents">
            <dt className="text-muted-foreground">Damage Immunities</dt>
            <dd>{resistanceLine(monster.damageImmunities)}</dd>
          </div>
        )}
        {monster.conditionImmunities && monster.conditionImmunities.length > 0 && (
          <div className="contents">
            <dt className="text-muted-foreground">Condition Immunities</dt>
            <dd>{resistanceLine(monster.conditionImmunities)}</dd>
          </div>
        )}
        {monster.senses && (
          <div className="contents">
            <dt className="text-muted-foreground">Senses</dt>
            <dd>{monster.senses}</dd>
          </div>
        )}
        {monster.languages && (
          <div className="contents">
            <dt className="text-muted-foreground">Languages</dt>
            <dd>{monster.languages}</dd>
          </div>
        )}
      </dl>

      {extra.traits && extra.traits.length > 0 && (
        <div className="space-y-2 text-sm">
          <p className="font-medium">Traits</p>
          {extra.traits.map((t, i) => (
            <div key={i}>
              <p className="font-medium">{t.name}</p>
              <p className="leading-relaxed">{t.description}</p>
            </div>
          ))}
        </div>
      )}

      {monster.actions.length > 0 && (
        <div className="space-y-2 text-sm">
          <p className="font-medium">Actions</p>
          {monster.actions.map((a, i) => (
            <ActionBlock key={i} action={a} />
          ))}
        </div>
      )}

      {monster.legendaryActions && monster.legendaryActions.length > 0 && (
        <div className="space-y-2 text-sm">
          <p className="font-medium">Legendary Actions</p>
          {monster.legendaryActions.map((a, i) => (
            <ActionBlock key={i} action={a} />
          ))}
        </div>
      )}

      {extra.lairActions && extra.lairActions.length > 0 && (
        <div className="space-y-1 text-sm">
          <p className="font-medium">Lair Actions</p>
          <ul className="list-inside list-disc">
            {extra.lairActions.map((a, i) => (
              <li key={i}>{a}</li>
            ))}
          </ul>
        </div>
      )}

      {extra.spellcasting && (
        <div className="space-y-1 text-sm">
          <p className="font-medium">Spellcasting</p>
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
      )}

      {monster.description && (
        <div className="space-y-2 text-sm leading-relaxed">
          {monster.description.split('\n').map((paragraph, i) => (
            <p key={i}>{paragraph}</p>
          ))}
        </div>
      )}

      {(extra.category ||
        extra.subcategory ||
        extra.proficiencyBonus != null ||
        extra.legendaryResistances != null) && (
        <div className="space-y-1 border-t pt-3 text-sm">
          <p className="font-medium">Additional Details</p>
          <dl className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1">
            {extra.proficiencyBonus != null && (
              <div className="contents">
                <dt className="text-muted-foreground">Proficiency Bonus</dt>
                <dd>+{extra.proficiencyBonus}</dd>
              </div>
            )}
            {extra.legendaryResistances != null && (
              <div className="contents">
                <dt className="text-muted-foreground">Legendary Resistances</dt>
                <dd>{extra.legendaryResistances}/Day</dd>
              </div>
            )}
            {extra.category && (
              <div className="contents">
                <dt className="text-muted-foreground">Category</dt>
                <dd>{extra.category}</dd>
              </div>
            )}
            {extra.subcategory && (
              <div className="contents">
                <dt className="text-muted-foreground">Subcategory</dt>
                <dd>{extra.subcategory}</dd>
              </div>
            )}
          </dl>
        </div>
      )}
    </div>
  )
}
