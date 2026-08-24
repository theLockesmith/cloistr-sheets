import { describe, it, expect, vi } from 'vitest'
import {
  classifySignerError,
  isRetryableSignerError,
  withSignerRetry,
  retryDelay,
  signerFailureMessage,
  RETRYABLE_CODES,
  NEEDS_USER_CODES,
  TERMINAL_CODES,
} from './signerRetry.js'

// ─── classifySignerError ──────────────────────────────────────────────────────

describe('classifySignerError', () => {
  it('classifies each RETRYABLE code as retryable', () => {
    for (const code of RETRYABLE_CODES) {
      expect(classifySignerError({ code })).toBe('retryable')
    }
  })

  it('classifies each NEEDS_USER code as needs-user', () => {
    for (const code of NEEDS_USER_CODES) {
      expect(classifySignerError({ code })).toBe('needs-user')
    }
  })

  it('classifies each TERMINAL code as terminal', () => {
    for (const code of TERMINAL_CODES) {
      expect(classifySignerError({ code })).toBe('terminal')
    }
  })

  it('classifies an unknown code as terminal (unknown must not loop)', () => {
    expect(classifySignerError({ code: 'SOME_UNKNOWN' })).toBe('terminal')
  })

  it('classifies a plain Error as terminal', () => {
    expect(classifySignerError(new Error('oops'))).toBe('terminal')
  })

  it('classifies null as terminal', () => {
    expect(classifySignerError(null)).toBe('terminal')
  })

  it('classifies a string as terminal', () => {
    expect(classifySignerError('CONNECTION_FAILED')).toBe('terminal')
  })
})

// ─── isRetryableSignerError ───────────────────────────────────────────────────

describe('isRetryableSignerError', () => {
  it('returns true for a retryable code', () => {
    expect(isRetryableSignerError({ code: 'NO_RELAYS' })).toBe(true)
  })

  it('returns false for a denial', () => {
    expect(isRetryableSignerError({ code: 'CANCELLED' })).toBe(false)
  })

  it('returns false for a timeout', () => {
    expect(isRetryableSignerError({ code: 'TIMEOUT' })).toBe(false)
  })
})

// ─── retryDelay ──────────────────────────────────────────────────────────────

describe('retryDelay', () => {
  it('returns 0 when random is 0', () => {
    expect(retryDelay(1, 300, 4000, () => 0)).toBe(0)
  })

  it('returns ceiling when random is 1', () => {
    // attempt=1: ceiling = min(300 * 2^0, 4000) = 300
    expect(retryDelay(1, 300, 4000, () => 1)).toBe(300)
  })

  it('doubles the ceiling each attempt up to maxDelayMs', () => {
    const r = () => 1
    expect(retryDelay(1, 300, 4000, r)).toBe(300)
    expect(retryDelay(2, 300, 4000, r)).toBe(600)
    expect(retryDelay(3, 300, 4000, r)).toBe(1200)
    expect(retryDelay(4, 300, 4000, r)).toBe(2400)
    expect(retryDelay(5, 300, 4000, r)).toBe(4000)  // capped
    expect(retryDelay(6, 300, 4000, r)).toBe(4000)  // still capped
  })
})

// ─── withSignerRetry ──────────────────────────────────────────────────────────

describe('withSignerRetry', () => {
  const noSleep = async (_ms: number) => { /* no-op */ }

  it('returns the result on first success', async () => {
    const fn = vi.fn().mockResolvedValue('ok')
    const result = await withSignerRetry(fn, { sleep: noSleep })
    expect(result).toBe('ok')
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('retries a retryable failure and succeeds on the second attempt', async () => {
    const retryableError = { code: 'NO_RELAYS' }
    const fn = vi.fn()
      .mockRejectedValueOnce(retryableError)
      .mockResolvedValueOnce('ok')
    const result = await withSignerRetry(fn, { sleep: noSleep })
    expect(result).toBe('ok')
    expect(fn).toHaveBeenCalledTimes(2)
  })

  it('does NOT retry a terminal failure (denial must not be re-sent)', async () => {
    const denial = { code: 'CANCELLED' }
    const fn = vi.fn().mockRejectedValue(denial)
    await expect(withSignerRetry(fn, { sleep: noSleep })).rejects.toMatchObject(denial)
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('does NOT retry a needs-user failure (timeout needs a human decision)', async () => {
    const timeout = { code: 'TIMEOUT' }
    const fn = vi.fn().mockRejectedValue(timeout)
    await expect(withSignerRetry(fn, { sleep: noSleep })).rejects.toMatchObject(timeout)
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('exhausts all attempts on repeated retryable failures and rethrows the last', async () => {
    const err = { code: 'DISCONNECTED' }
    const fn = vi.fn().mockRejectedValue(err)
    await expect(withSignerRetry(fn, { attempts: 3, sleep: noSleep })).rejects.toMatchObject(err)
    expect(fn).toHaveBeenCalledTimes(3)
  })

  it('calls onRetry before each retry with attempt number and delay', async () => {
    const retries: Array<{ attempt: number; delay: number }> = []
    const err = { code: 'CONNECTION_FAILED' }
    const fn = vi.fn().mockRejectedValue(err)
    await expect(
      withSignerRetry(fn, {
        attempts: 3,
        sleep: noSleep,
        random: () => 1,
        onRetry: (attempt, delay) => { retries.push({ attempt, delay }) },
      })
    ).rejects.toMatchObject(err)
    // onRetry fires before attempt 2 and 3 (not after the final failed attempt)
    expect(retries).toHaveLength(2)
    expect(retries[0]?.attempt).toBe(1)
    expect(retries[1]?.attempt).toBe(2)
  })

  it('treats an unknown error as terminal and does not retry', async () => {
    const unknown = new Error('unexpected network error')
    const fn = vi.fn().mockRejectedValue(unknown)
    await expect(withSignerRetry(fn, { sleep: noSleep })).rejects.toThrow('unexpected network error')
    expect(fn).toHaveBeenCalledTimes(1)
  })
})

// ─── signerFailureMessage ────────────────────────────────────────────────────

describe('signerFailureMessage', () => {
  it('returns a connection-problem message for retryable errors', () => {
    const { title, detail } = signerFailureMessage({ code: 'NO_RELAYS' })
    expect(title).toMatch(/reach your signer/i)
    expect(detail).toMatch(/not a sign-in problem/i)
  })

  it('returns a waiting-on-device message for needs-user errors', () => {
    const { title } = signerFailureMessage({ code: 'TIMEOUT' })
    expect(title).toMatch(/no response/i)
  })

  it('returns a declined message for terminal errors', () => {
    const { title } = signerFailureMessage({ code: 'CANCELLED' })
    expect(title).toMatch(/declined/i)
  })
})
