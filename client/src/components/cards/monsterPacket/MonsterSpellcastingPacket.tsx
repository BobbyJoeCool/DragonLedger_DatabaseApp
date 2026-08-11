import type { Monster } from '@dragonledger/content-types'
import { MonsterCard } from '@/components/content/MonsterCard'
import { Divider, Subcard, cardStyles, spellLevelSchoolLine } from '@/components/cards/shared'
import { resolveSpellName, useSpellNameIndex, type SpellIndexEntry } from '@/hooks/useSpellNameIndex'

interface MonsterSpellcasting {
  ability?: string
  saveDC?: number
  atWill?: string[]
  cantrips?: string[]
  limitedUse?: { frequency: string; spells: string[] }[]
  slots?: Record<string, string[]>
}

interface MonsterExtraData {
  spellcasting?: MonsterSpellcasting
}

interface SpellGroup {
  label: string
  names: string[]
}

function buildSpellGroups(spellcasting: MonsterSpellcasting): SpellGroup[] {
  const groups: SpellGroup[] = []
  if (spellcasting.cantrips && spellcasting.cantrips.length > 0) {
    groups.push({ label: 'Cantrips', names: spellcasting.cantrips })
  }
  if (spellcasting.atWill && spellcasting.atWill.length > 0) {
    groups.push({ label: 'At Will', names: spellcasting.atWill })
  }
  for (const lu of spellcasting.limitedUse ?? []) {
    groups.push({ label: lu.frequency, names: lu.spells })
  }
  if (spellcasting.slots) {
    const levels = Object.keys(spellcasting.slots).sort((a, b) => Number(a) - Number(b))
    for (const level of levels) {
      groups.push({ label: `Level ${level}`, names: spellcasting.slots[level] ?? [] })
    }
  }
  return groups
}

function ResolvedSpellSubcard({ name, spell }: { name: string; spell: SpellIndexEntry | null }) {
  return (
    <Subcard tabLabel="Spell">
      <p className={cardStyles.entryName}>{spell?.name ?? name}</p>
      {spell ? (
        <>
          <p className={cardStyles.subheading}>{spellLevelSchoolLine(spell.level, spell.school)}</p>
          <p className="text-sm leading-relaxed">{spell.description}</p>
        </>
      ) : (
        <p className="text-sm dl-muted italic">Not found in your content library.</p>
      )}
    </Subcard>
  )
}

interface MonsterSpellcastingPacketProps {
  monster: Monster
}

/**
 * Monster+Spellcasting packet — §3/§5. `.document` mode: the monster
 * keeps its own independent fit-to-page scaling (MonsterCard's existing
 * useFitToPage) at the top of one shared flowing container, and the
 * appendix begins in normal flow right after — no special layout logic
 * needed to make it land same-page or next-page, per the decision log.
 * Spell names (plain strings on the monster row) are matched against real
 * ContentSpell records via useSpellNameIndex; unresolved names render as
 * plain text rather than being dropped.
 */
export function MonsterSpellcastingPacket({ monster }: MonsterSpellcastingPacketProps) {
  const extra = (monster.extraData ?? {}) as MonsterExtraData
  const { data: spellIndex } = useSpellNameIndex()

  if (!extra.spellcasting) return null
  const groups = buildSpellGroups(extra.spellcasting)

  return (
    // Plain flowing container, not a Shell/.dl-frame — the monster block
    // below already brings its own frame + fit-to-page scaling, and each
    // appendix entry is its own bordered Subcard; a second outer frame
    // around the whole packet would just nest redundantly.
    <div className="dl-shell-document space-y-6">
      <MonsterCard monster={monster} />

      <div className="space-y-4">
        <div>
          <h3 className={cardStyles.cardHeading}>Spellcasting Appendix</h3>
          {extra.spellcasting.ability && (
            <p className={cardStyles.subheading}>
              {extra.spellcasting.ability}
              {extra.spellcasting.saveDC ? `, save DC ${extra.spellcasting.saveDC}` : ''}
            </p>
          )}
        </div>
        <Divider variant="major" />
        {groups.map((group) => (
          <div key={group.label} className="space-y-2 break-inside-avoid">
            <p className={cardStyles.sectionLabel}>{group.label}</p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {group.names.map((name, i) => (
                <ResolvedSpellSubcard key={`${group.label}-${i}`} name={name} spell={resolveSpellName(spellIndex, name)} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
