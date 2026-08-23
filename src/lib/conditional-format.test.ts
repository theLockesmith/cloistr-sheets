/**
 * Tests for conditional-format.ts
 *
 * Source-level unit tests — no DOM, no Univer instance.
 * A fake services object captures the syncExecuteCommand calls.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { applyConditionalFormat, clearConditionalFormat } from './conditional-format.js'
import type { SortFilterServices } from './sort-filter.js'
import type { ConditionalRule } from './conditional-format.js'

type CommandCall = { id: string; params: any }

function fakeServices(cellData: Record<number, Record<number, any>> = {}) {
  const calls: CommandCall[] = []

  const commandService = {
    syncExecuteCommand(id: string, params: any) {
      calls.push({ id, params })
    },
  }

  const sheet = {
    getConfig: () => ({ cellData }),
  }

  const workbook = {
    getSheetBySheetId: () => sheet,
    getActiveSheet: () => sheet,
  }

  return { services: { commandService, workbook } as SortFilterServices, calls }
}

const UNIT = 'u1'
const SHEET = 's1'

describe('applyConditionalFormat — gt (>)', () => {
  let calls: CommandCall[]
  let services: SortFilterServices

  beforeEach(() => {
    const f = fakeServices({
      0: { 0: { v: 'Label' }, 1: { v: 5 }, 2: { v: 15 } },
      1: { 0: { v: 'Row2' }, 1: { v: 3 }, 2: { v: 12 } },
    })
    calls = f.calls
    services = f.services
  })

  it('calls set-range-values for matching cells', () => {
    const rule: ConditionalRule = { op: 'gt', value: '10', color: '#ff0000' }
    applyConditionalFormat(services, rule, UNIT, SHEET, 0, 1, 0, 2)
    expect(calls).toHaveLength(1)
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    expect(calls[0]!.id).toBe('sheet.mutation.set-range-values')
  })

  it('highlights cells where value > threshold', () => {
    const rule: ConditionalRule = { op: 'gt', value: '10', color: '#ff0000' }
    applyConditionalFormat(services, rule, UNIT, SHEET, 0, 1, 0, 2)
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const cv = calls[0]!.params.cellValue
    // col 2 row 0 = 15 > 10 → highlighted
    expect(cv[0]?.[2]?.s?.bg?.rgb).toBe('#ff0000')
    // col 1 row 0 = 5 < 10 → not highlighted
    expect(cv[0]?.[1]).toBeUndefined()
    // col 2 row 1 = 12 > 10 → highlighted
    expect(cv[1]?.[2]?.s?.bg?.rgb).toBe('#ff0000')
  })

  it('makes no call when no cells match', () => {
    const rule: ConditionalRule = { op: 'gt', value: '100', color: '#ff0000' }
    applyConditionalFormat(services, rule, UNIT, SHEET, 0, 1, 0, 2)
    expect(calls).toHaveLength(0)
  })
})

describe('applyConditionalFormat — contains', () => {
  it('matches substring case-insensitively', () => {
    const { services, calls } = fakeServices({
      0: { 0: { v: 'Hello World' } },
      1: { 0: { v: 'Goodbye' } },
    })
    const rule: ConditionalRule = { op: 'contains', value: 'hello', color: '#00ff00' }
    applyConditionalFormat(services, rule, UNIT, SHEET, 0, 1, 0, 0)
    expect(calls).toHaveLength(1)
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const cv = calls[0]!.params.cellValue
    expect(cv[0]?.[0]?.s?.bg?.rgb).toBe('#00ff00')
    expect(cv[1]).toBeUndefined()
  })
})

describe('applyConditionalFormat — not_empty', () => {
  it('highlights non-blank cells', () => {
    const { services, calls } = fakeServices({
      0: { 0: { v: 'x' } },
      1: {},            // empty row
      2: { 0: { v: '' } }, // blank value
    })
    const rule: ConditionalRule = { op: 'not_empty', value: '', color: '#0000ff' }
    applyConditionalFormat(services, rule, UNIT, SHEET, 0, 2, 0, 0)
    const cv = (calls[0]?.params?.cellValue ?? {}) as Record<number, Record<number, any>>
    expect(cv[0]?.[0]?.s?.bg?.rgb).toBe('#0000ff')
    expect(cv[1]).toBeUndefined()
    expect(cv[2]).toBeUndefined()
  })
})

describe('applyConditionalFormat — eq', () => {
  it('matches exact numeric equality', () => {
    const { services, calls } = fakeServices({
      0: { 0: { v: 42 } },
      1: { 0: { v: 43 } },
    })
    const rule: ConditionalRule = { op: 'eq', value: '42', color: '#abcdef' }
    applyConditionalFormat(services, rule, UNIT, SHEET, 0, 1, 0, 0)
    const cv = (calls[0]?.params?.cellValue ?? {}) as Record<number, Record<number, any>>
    expect(cv[0]?.[0]?.s?.bg?.rgb).toBe('#abcdef')
    expect(cv[1]).toBeUndefined()
  })
})

describe('clearConditionalFormat', () => {
  it('removes bg style from cells that have it', () => {
    const { services, calls } = fakeServices({
      0: { 0: { v: 'x', s: { bg: { rgb: '#ff0000' }, bold: true } } },
      1: { 0: { v: 'y' } }, // no bg — should be skipped
    })
    clearConditionalFormat(services, UNIT, SHEET, 0, 1, 0, 0)
    expect(calls).toHaveLength(1)
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const cv = calls[0]!.params.cellValue as Record<number, Record<number, any>>
    // bg removed, but bold preserved
    expect(cv[0]?.[0]?.s?.bg).toBeUndefined()
    expect(cv[0]?.[0]?.s?.bold).toBe(true)
    // row 1 had no bg — not included in the command
    expect(cv[1]).toBeUndefined()
  })

  it('makes no call when no cells have bg', () => {
    const { services, calls } = fakeServices({
      0: { 0: { v: 'plain' } },
    })
    clearConditionalFormat(services, UNIT, SHEET, 0, 0, 0, 0)
    expect(calls).toHaveLength(0)
  })
})
