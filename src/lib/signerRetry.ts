/**
 * Signing-failure classification and retry policy for Cloistr Sheets.
 *
 * WHY THIS IS LOCAL
 *
 * The canonical implementation lives in @cloistr/ui as dist/lib/signerRetry.js
 * and is tested there. It is not in the package's public `exports` map
 * (only `.`, `./auth`, `./components`, and `./styles` are exposed), so it
 * cannot be imported without a deep-path reference that TypeScript's
 * moduleResolution:NodeNext rejects.
 *
 * Rather than a build-breaking deep import, the logic is vendored here at the
 * same semantics. If @cloistr/ui gains a public `./lib` export the import can
 * be replaced with the canonical one and this file deleted.
 *
 * RULES (same as the upstream)
 *
 *   retryable   relay unreachable / socket closed — nobody made a decision,
 *               safe to retry automatically.
 *   needs-user  request reached the signer but no approval came back in time —
 *               offer a retry, never fire one silently.
 *   terminal    signer said NO, or request is malformed — retrying cannot
 *               change the answer.
 *
 * Nothing in this file touches session state. That is the point.
 */

/** What a caller should do about a failed signing attempt. */
export type SignerFailureKind = 'retryable' | 'needs-user' | 'terminal'

/** Could not reach the signer. No decision was made, so retrying is safe. */
export const RETRYABLE_CODES = ['NO_RELAYS', 'CONNECTION_FAILED', 'DISCONNECTED'] as const

/** Reached the signer, but no answer arrived. Ask before retrying. */
export const NEEDS_USER_CODES = ['TIMEOUT'] as const

/**
 * A decision was made, or the request cannot succeed as formed.
 *
 * CANCELLED and REMOTE_ERROR are the important entries: they mean the signer
 * said no. Auto-retrying those would re-prompt a user who already declined.
 */
export const TERMINAL_CODES = [
  'CANCELLED',
  'REMOTE_ERROR',
  'INVALID_BUNKER_URL',
  'GET_PUBKEY_FAILED',
  'ENCRYPT_FAILED',
  'DECRYPT_FAILED',
] as const

function codeOf(err: unknown): string {
  if (typeof err !== 'object' || err === null) return ''
  const code = (err as Record<string, unknown>)['code']
  return typeof code === 'string' ? code : ''
}

/**
 * Decide what to do about a signing failure.
 *
 * Unknown and code-less errors are TERMINAL on purpose. Defaulting unknown
 * failures to "retryable" would silently hammer the signer for causes we do not
 * understand — a bug should surface, not loop.
 */
export function classifySignerError(err: unknown): SignerFailureKind {
  const code = codeOf(err)
  if ((RETRYABLE_CODES as readonly string[]).includes(code)) return 'retryable'
  if ((NEEDS_USER_CODES as readonly string[]).includes(code)) return 'needs-user'
  return 'terminal'
}

/** True when another automatic attempt is worth making. */
export function isRetryableSignerError(err: unknown): boolean {
  return classifySignerError(err) === 'retryable'
}

export interface SignerRetryOptions {
  /** Total attempts including the first. Default 3. */
  attempts?: number
  /** Delay before the FIRST retry, doubling thereafter. Default 300ms. */
  baseDelayMs?: number
  /** Upper bound on any single delay. Default 4000ms. */
  maxDelayMs?: number
  /** Injectable for tests; defaults to setTimeout. */
  sleep?: (ms: number) => Promise<void>
  /** Injectable for tests; defaults to Math.random. */
  random?: () => number
  /** Called before each retry, for logging or UI. */
  onRetry?: (attempt: number, delayMs: number, err: unknown) => void
}

const defaultSleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * Delay for a given retry, exponential with FULL jitter.
 *
 * Every open tab wakes at the same moment when a phone comes back from the
 * background, and a fixed backoff would send them all to the relay in lockstep.
 * Full jitter spreads them out.
 */
export function retryDelay(
  attempt: number,
  baseDelayMs: number,
  maxDelayMs: number,
  random: () => number = Math.random,
): number {
  const ceiling = Math.min(baseDelayMs * 2 ** (attempt - 1), maxDelayMs)
  return Math.round(random() * ceiling)
}

/**
 * Run a signing operation, retrying ONLY failures that a retry can fix.
 *
 * Rethrows the last error when attempts run out, so the caller still decides
 * what to show. Never swallows a failure and never touches session state.
 */
export async function withSignerRetry<T>(
  fn: () => Promise<T>,
  options: SignerRetryOptions = {},
): Promise<T> {
  const {
    attempts = 3,
    baseDelayMs = 300,
    maxDelayMs = 4000,
    sleep = defaultSleep,
    random = Math.random,
    onRetry,
  } = options

  let lastError: unknown
  for (let attempt = 1; attempt <= Math.max(1, attempts); attempt++) {
    try {
      return await fn()
    } catch (err) {
      lastError = err
      // A refusal or an unanswered approval must not be retried behind the
      // user's back, however many attempts remain.
      if (classifySignerError(err) !== 'retryable') throw err
      if (attempt >= attempts) break
      const delay = retryDelay(attempt, baseDelayMs, maxDelayMs, random)
      onRetry?.(attempt, delay, err)
      await sleep(delay)
    }
  }
  throw lastError
}

/** Human-facing copy for a failure, for the recovery UI. */
export function signerFailureMessage(err: unknown): { title: string; detail: string } {
  switch (classifySignerError(err)) {
    case 'retryable':
      return {
        title: 'Could not reach your signer',
        detail:
          'We could not connect to a relay to reach your signing device. Your session is still valid — this is a connection problem, not a sign-in problem.',
      }
    case 'needs-user':
      return {
        title: 'No response from your signer',
        detail:
          'The request was sent but no approval came back. Check your signing device — there may be a prompt waiting for you.',
      }
    default:
      return {
        title: 'Signing was declined',
        detail:
          'Your signer did not approve this request. You are still signed in; you can go back and try something else.',
      }
  }
}
