import { describe, expect, it } from 'vitest'
import { parseNameTags } from '../../importers/compendium/nameTags.js'

describe('parseNameTags', () => {
  it('strips a single edition tag', () => {
    expect(parseNameTags('Wizard [5.5e]')).toEqual({
      name: 'Wizard',
      edition: '2024',
      homebrew: false,
      thirdParty: false,
      unearthedArcana: false,
      otherTags: [],
    })
  })

  it('strips stacked tags in any order, recognized and unrecognized', () => {
    const result = parseNameTags('Blood Hunter (Alt. LaserLlama) [5.5e]')
    expect(result.name).toBe('Blood Hunter')
    expect(result.edition).toBe('2024')
    expect(result.otherTags).toEqual(['Alt. LaserLlama'])
  })

  it('recognizes (Legacy) as 2014 edition', () => {
    expect(parseNameTags('School of Necromancy (Legacy)').edition).toBe('2014')
  })

  it('recognizes (HB), (TP), (UA) independently of edition', () => {
    const hb = parseNameTags('Hearth Domain (HB)')
    expect(hb.homebrew).toBe(true)
    const tp = parseNameTags('The Mind Domain (TP) (Legacy)')
    expect(tp.thirdParty).toBe(true)
    expect(tp.edition).toBe('2014')
    const ua = parseNameTags('Knowledge Domain (UA)')
    expect(ua.unearthedArcana).toBe(true)
  })

  it('preserves an unrecognized qualifier as otherTags rather than dropping it', () => {
    const result = parseNameTags('Shadow Domain (Book of Ebon Tides) (TP) (Legacy)')
    expect(result.name).toBe('Shadow Domain')
    expect(result.otherTags).toEqual(['Book of Ebon Tides'])
    expect(result.thirdParty).toBe(true)
    expect(result.edition).toBe('2014')
  })

  it('returns an empty name when nothing survives tag-stripping (real, malformed source data)', () => {
    expect(parseNameTags(' (Legacy)').name).toBe('')
  })
})
