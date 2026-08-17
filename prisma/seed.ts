import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

const SRD_SOURCE_ID = 'open5e-srd-2024'

interface ConditionSeed {
  slug: string
  name: string
  description: string
  effects: string | null
  extraData: string
}

const CONDITIONS_5E: ConditionSeed[] = [
  {
    slug: 'blinded-5e',
    name: 'Blinded',
    description:
      "A blinded creature can't see and automatically fails any ability check that requires sight. Attack rolls against the creature have advantage, and the creature's attack rolls have disadvantage.",
    effects: null,
    extraData: JSON.stringify({ edition: '5e' }),
  },
  {
    slug: 'charmed-5e',
    name: 'Charmed',
    description:
      "A charmed creature can't attack the charmer or target the charmer with harmful abilities or magical effects. The charmer has advantage on any ability check to interact socially with the creature.",
    effects: null,
    extraData: JSON.stringify({ edition: '5e' }),
  },
  {
    slug: 'deafened-5e',
    name: 'Deafened',
    description:
      "A deafened creature can't hear and automatically fails any ability check that requires hearing.",
    effects: null,
    extraData: JSON.stringify({ edition: '5e' }),
  },
  {
    slug: 'exhaustion-5e',
    name: 'Exhaustion',
    description:
      'Some special abilities and environmental hazards lead to exhaustion. Exhaustion is measured in six levels, each stacking with previous levels.',
    effects:
      'Level 1: Disadvantage on ability checks\nLevel 2: Speed halved\nLevel 3: Disadvantage on attack rolls and saving throws\nLevel 4: Hit point maximum halved\nLevel 5: Speed reduced to 0\nLevel 6: Death',
    extraData: JSON.stringify({ edition: '5e' }),
  },
  {
    slug: 'frightened-5e',
    name: 'Frightened',
    description:
      "A frightened creature has disadvantage on ability checks and attack rolls while the source of its fear is within line of sight. The creature can't willingly move closer to the source of its fear.",
    effects: null,
    extraData: JSON.stringify({ edition: '5e' }),
  },
  {
    slug: 'grappled-5e',
    name: 'Grappled',
    description:
      "A grappled creature's speed becomes 0, and it can't benefit from any bonus to its speed. The condition ends if the grappler is incapacitated. The condition also ends if an effect removes the grappled creature from the reach of the grappler or grappling effect.",
    effects: null,
    extraData: JSON.stringify({ edition: '5e' }),
  },
  {
    slug: 'incapacitated-5e',
    name: 'Incapacitated',
    description: "An incapacitated creature can't take actions or reactions.",
    effects: null,
    extraData: JSON.stringify({ edition: '5e' }),
  },
  {
    slug: 'invisible-5e',
    name: 'Invisible',
    description:
      "An invisible creature is impossible to see without the aid of magic or a special sense. The creature is heavily obscured for purposes of hiding. The creature's location can be detected by noise it makes or tracks it leaves. Attack rolls against the creature have disadvantage, and the creature's attack rolls have advantage.",
    effects: null,
    extraData: JSON.stringify({ edition: '5e' }),
  },
  {
    slug: 'paralyzed-5e',
    name: 'Paralyzed',
    description:
      "A paralyzed creature is incapacitated and can't move or speak. The creature automatically fails Strength and Dexterity saving throws. Attack rolls against the creature have advantage. Any attack that hits the creature is a critical hit if the attacker is within 5 feet of the creature.",
    effects: null,
    extraData: JSON.stringify({ edition: '5e' }),
  },
  {
    slug: 'petrified-5e',
    name: 'Petrified',
    description:
      'A petrified creature is transformed, along with any nonmagical object it is wearing or carrying, into a solid inanimate substance. Its weight increases by a factor of ten, and it ceases aging. The creature is incapacitated, can\'t move or speak, and is unaware of its surroundings.',
    effects:
      'Attack rolls against the creature have advantage. The creature automatically fails Strength and Dexterity saving throws. Resistance to all damage. Immune to poison and disease (existing effects are suspended, not neutralized).',
    extraData: JSON.stringify({ edition: '5e' }),
  },
  {
    slug: 'poisoned-5e',
    name: 'Poisoned',
    description: 'A poisoned creature has disadvantage on attack rolls and ability checks.',
    effects: null,
    extraData: JSON.stringify({ edition: '5e' }),
  },
  {
    slug: 'prone-5e',
    name: 'Prone',
    description:
      "A prone creature's only movement option is to crawl, unless it stands up and thereby ends the condition. The creature has disadvantage on attack rolls. An attack roll against the creature has advantage if the attacker is within 5 feet; otherwise, the attack roll has disadvantage.",
    effects: null,
    extraData: JSON.stringify({ edition: '5e' }),
  },
  {
    slug: 'restrained-5e',
    name: 'Restrained',
    description:
      "A restrained creature's speed becomes 0, and it can't benefit from any bonus to its speed. Attack rolls against the creature have advantage, and the creature's attack rolls have disadvantage. The creature has disadvantage on Dexterity saving throws.",
    effects: null,
    extraData: JSON.stringify({ edition: '5e' }),
  },
  {
    slug: 'stunned-5e',
    name: 'Stunned',
    description:
      "A stunned creature is incapacitated, can't move, and can speak only falteringly. The creature automatically fails Strength and Dexterity saving throws. Attack rolls against the creature have advantage.",
    effects: null,
    extraData: JSON.stringify({ edition: '5e' }),
  },
  {
    slug: 'unconscious-5e',
    name: 'Unconscious',
    description:
      "An unconscious creature is incapacitated, can't move or speak, and is unaware of its surroundings. The creature drops whatever it's holding and falls prone. The creature automatically fails Strength and Dexterity saving throws. Attack rolls against the creature have advantage. Any attack that hits the creature is a critical hit if the attacker is within 5 feet.",
    effects: null,
    extraData: JSON.stringify({ edition: '5e' }),
  },
]

const CONDITIONS_5_5E: ConditionSeed[] = [
  {
    slug: 'blinded-2024',
    name: 'Blinded',
    description:
      "A blinded creature can't see and automatically fails any ability check that requires sight. Attack rolls against the creature have advantage, and the creature's attack rolls have disadvantage.",
    effects: null,
    extraData: JSON.stringify({ edition: '5.5e' }),
  },
  {
    slug: 'charmed-2024',
    name: 'Charmed',
    description:
      "A charmed creature can't attack the charmer or target the charmer with damaging abilities or magical effects. The charmer has advantage on any ability check to interact socially with the creature.",
    effects: null,
    extraData: JSON.stringify({ edition: '5.5e' }),
  },
  {
    slug: 'deafened-2024',
    name: 'Deafened',
    description:
      "A deafened creature can't hear and automatically fails any ability check that requires hearing.",
    effects: null,
    extraData: JSON.stringify({ edition: '5.5e' }),
  },
  {
    slug: 'exhaustion-2024',
    name: 'Exhaustion',
    description:
      "While you have the Exhaustion condition, you experience the following effects. Exhaustion levels stack; each time you receive this condition, your exhaustion level increases by 1. You die if your exhaustion level is 10.",
    effects:
      "Each level of Exhaustion reduces all d20 Test rolls by 2. Your Speed is reduced by a number of feet equal to 5 times your Exhaustion level. At Exhaustion level 10, you die.",
    extraData: JSON.stringify({ edition: '5.5e' }),
  },
  {
    slug: 'frightened-2024',
    name: 'Frightened',
    description:
      "A frightened creature has disadvantage on ability checks and attack rolls while the source of its fear is within line of sight. The creature can't willingly move closer to the source of its fear.",
    effects: null,
    extraData: JSON.stringify({ edition: '5.5e' }),
  },
  {
    slug: 'grappled-2024',
    name: 'Grappled',
    description:
      "A grappled creature's speed becomes 0, and it can't benefit from any bonus to its speed. The condition ends if the grappler is incapacitated or if an effect moves the grappled creature outside the grappler's reach.",
    effects: null,
    extraData: JSON.stringify({ edition: '5.5e' }),
  },
  {
    slug: 'incapacitated-2024',
    name: 'Incapacitated',
    description:
      "An incapacitated creature can't take actions, bonus actions, or reactions.",
    effects: null,
    extraData: JSON.stringify({ edition: '5.5e' }),
  },
  {
    slug: 'invisible-2024',
    name: 'Invisible',
    description:
      "An invisible creature is impossible to see without the aid of magic or a special sense. The creature is heavily obscured for purposes of hiding. The creature's location can be detected by noise it makes or tracks it leaves. Attack rolls against the creature have disadvantage, and the creature's attack rolls have advantage.",
    effects: null,
    extraData: JSON.stringify({ edition: '5.5e' }),
  },
  {
    slug: 'paralyzed-2024',
    name: 'Paralyzed',
    description:
      "A paralyzed creature is incapacitated and can't move or speak. The creature automatically fails Strength and Dexterity saving throws. Attack rolls against the creature have advantage. Any attack that hits the creature is a critical hit if the attacker is within 5 feet of the creature.",
    effects: null,
    extraData: JSON.stringify({ edition: '5.5e' }),
  },
  {
    slug: 'petrified-2024',
    name: 'Petrified',
    description:
      'A petrified creature is transformed, along with any nonmagical object it is wearing or carrying, into a solid inanimate substance. Its weight increases by a factor of ten, and it ceases aging. The creature is incapacitated, can\'t move or speak, and is unaware of its surroundings.',
    effects:
      'Attack rolls against the creature have advantage. The creature automatically fails Strength and Dexterity saving throws. Resistance to all damage. Immune to poison and disease (existing effects are suspended, not neutralized).',
    extraData: JSON.stringify({ edition: '5.5e' }),
  },
  {
    slug: 'poisoned-2024',
    name: 'Poisoned',
    description: 'A poisoned creature has disadvantage on attack rolls and ability checks.',
    effects: null,
    extraData: JSON.stringify({ edition: '5.5e' }),
  },
  {
    slug: 'prone-2024',
    name: 'Prone',
    description:
      "A prone creature's only movement option is to crawl, unless it stands up and thereby ends the condition. The creature has disadvantage on attack rolls. An attack roll against the creature has advantage if the attacker is within 5 feet; otherwise, the attack roll has disadvantage.",
    effects: null,
    extraData: JSON.stringify({ edition: '5.5e' }),
  },
  {
    slug: 'restrained-2024',
    name: 'Restrained',
    description:
      "A restrained creature's speed becomes 0, and it can't benefit from any bonus to its speed. Attack rolls against the creature have advantage, and the creature's attack rolls have disadvantage. The creature has disadvantage on Dexterity saving throws.",
    effects: null,
    extraData: JSON.stringify({ edition: '5.5e' }),
  },
  {
    slug: 'stunned-2024',
    name: 'Stunned',
    description:
      "A stunned creature is incapacitated, can't move, and can speak only falteringly. The creature automatically fails Strength and Dexterity saving throws. Attack rolls against the creature have advantage.",
    effects: null,
    extraData: JSON.stringify({ edition: '5.5e' }),
  },
  {
    slug: 'unconscious-2024',
    name: 'Unconscious',
    description:
      "An unconscious creature is incapacitated, can't move or speak, and is unaware of its surroundings. The creature drops whatever it's holding and falls prone. The creature automatically fails Strength and Dexterity saving throws. Attack rolls against the creature have advantage. Any attack that hits the creature is a critical hit if the attacker is within 5 feet.",
    effects: null,
    extraData: JSON.stringify({ edition: '5.5e' }),
  },
]

const LANGUAGES: { name: string; category: 'common' | 'exotic' | 'secret' }[] = [
  { name: 'Common', category: 'common' },
  { name: 'Dwarvish', category: 'common' },
  { name: 'Elvish', category: 'common' },
  { name: 'Giant', category: 'common' },
  { name: 'Gnomish', category: 'common' },
  { name: 'Goblin', category: 'common' },
  { name: 'Halfling', category: 'common' },
  { name: 'Orc', category: 'common' },
  { name: 'Abyssal', category: 'exotic' },
  { name: 'Celestial', category: 'exotic' },
  { name: 'Deep Speech', category: 'exotic' },
  { name: 'Draconic', category: 'exotic' },
  { name: 'Infernal', category: 'exotic' },
  { name: 'Primordial', category: 'exotic' },
  { name: 'Aquan', category: 'exotic' },
  { name: 'Auran', category: 'exotic' },
  { name: 'Ignan', category: 'exotic' },
  { name: 'Terran', category: 'exotic' },
  { name: 'Sylvan', category: 'exotic' },
  { name: 'Undercommon', category: 'exotic' },
  { name: 'Druidic', category: 'secret' },
  { name: "Thieves' Cant", category: 'secret' },
]

async function main() {
  await prisma.source.upsert({
    where: { id: 'homebrew' },
    update: {},
    create: {
      id: 'homebrew',
      name: 'Homebrew',
      type: 'MANUAL',
      description: 'User-created content not tied to an external source.',
      lastUpdated: new Date(),
      isDeletable: false,
    },
  })

  for (const language of LANGUAGES) {
    await prisma.language.upsert({
      where: { name: language.name },
      update: { category: language.category },
      create: language,
    })
  }

  const allConditions = [...CONDITIONS_5E, ...CONDITIONS_5_5E]
  for (const condition of allConditions) {
    await prisma.contentCondition.upsert({
      where: {
        sourceId_slug: { sourceId: SRD_SOURCE_ID, slug: condition.slug },
      },
      update: {
        name: condition.name,
        description: condition.description,
        effects: condition.effects,
        extraData: condition.extraData,
      },
      create: {
        slug: condition.slug,
        sourceId: SRD_SOURCE_ID,
        name: condition.name,
        description: condition.description,
        effects: condition.effects,
        extraData: condition.extraData,
      },
    })
  }
  console.log(`Seeded ${allConditions.length} conditions`)
}

main()
  .then(async () => {
    await prisma.$disconnect()
  })
  .catch(async (err) => {
    console.error(err)
    await prisma.$disconnect()
    process.exit(1)
  })
