import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

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
