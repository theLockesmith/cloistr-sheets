import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { resolveServiceAddresses } from './serviceAddresses.js'

/**
 * Why this test exists.
 *
 * This app used to decide its relay from a literal in App.tsx and its file host
 * from a literal in Sheet.tsx. Both were frozen into the bundle at build time,
 * so a staging deployment of this image would have talked to the production
 * relay and the production file host, and a staging signup would have created a
 * real production account.
 *
 * resolveServiceAddresses is the single place that decision now happens, which
 * is what makes it testable at all. The assertions below are the app's half of
 * the done criteria: production unchanged, and a staging environment reaching
 * no production host.
 */
const GLOBAL = '__CLOISTR_CONFIG__'

const PRODUCTION_RELAY = 'wss://relay.cloistr.xyz'
const PRODUCTION_SIGNER = 'https://signer.cloistr.xyz'

function setRuntimeConfig(value: unknown): void {
  ;(globalThis as any).window = { [GLOBAL]: value }
}

beforeEach(() => {
  delete (globalThis as any).window
})

afterEach(() => {
  delete (globalThis as any).window
})

describe('with no runtime configuration, which is production', () => {
  it('still uses the production relay', () => {
    expect(resolveServiceAddresses().relayUrl).toBe(PRODUCTION_RELAY)
  })

  it('still uses the production signer', () => {
    // Previously this app passed no signerUrl at all and silently inherited the
    // shared library's hardcoded production default. It must now resolve the
    // same value explicitly, so that it can be redirected.
    expect(resolveServiceAddresses().signerUrl).toBe(PRODUCTION_SIGNER)
  })

  it('reports production as the environment', () => {
    expect(resolveServiceAddresses().environment).toBe('production')
  })
})

describe('with a staging runtime configuration', () => {
  const staging = {
    relayUrl: 'wss://relay.staging.cloistr.xyz',
    blossomUrl: 'https://files.staging.cloistr.xyz',
    signerUrl: 'https://signer.staging.cloistr.xyz',
    discoveryUrl: 'https://discover.staging.cloistr.xyz',
    environment: 'staging',
  }

  it('follows the relay it was given', () => {
    setRuntimeConfig(staging)
    expect(resolveServiceAddresses().relayUrl).toBe(staging.relayUrl)
  })

  it('follows the file host it was given', () => {
    setRuntimeConfig(staging)
    expect(resolveServiceAddresses().blossomUrl).toBe(staging.blossomUrl)
  })

  it('follows the signer it was given', () => {
    setRuntimeConfig(staging)
    expect(resolveServiceAddresses().signerUrl).toBe(staging.signerUrl)
  })

  it('reaches NO production host at all', () => {
    // The assertion that catches a half-converted app. Overriding the relay but
    // leaving the file host or signer on a literal would pass every test above
    // and still send a staging deployment to production.
    setRuntimeConfig(staging)
    const resolved = resolveServiceAddresses()

    const values = [
      resolved.relayUrl,
      resolved.blossomUrl,
      resolved.signerUrl,
      resolved.discoveryUrl,
    ]

    for (const value of values) {
      // "Production" means a cloistr.xyz host that is NOT under the staging
      // subdomain. Parse the host rather than matching a substring: the staging
      // hosts legitimately end with cloistr.xyz, which is precisely why the
      // session cookie scoped to that parent domain reaches both environments.
      // A substring test is the wrong instrument, and it failed this assertion
      // on correct values the first time it ran.
      const host = new URL(value).hostname
      const isProductionHost =
        host.endsWith('cloistr.xyz') && !host.endsWith('.staging.cloistr.xyz')
      expect(isProductionHost, `${value} resolves to a production host`).toBe(false)
    }
  })

  it('reports staging as the environment', () => {
    setRuntimeConfig(staging)
    expect(resolveServiceAddresses().environment).toBe('staging')
  })
})

describe('partial configuration', () => {
  it('overrides only what it names and leaves the rest at production', () => {
    setRuntimeConfig({ relayUrl: 'wss://relay.staging.cloistr.xyz' })
    const resolved = resolveServiceAddresses()
    expect(resolved.relayUrl).toBe('wss://relay.staging.cloistr.xyz')
    expect(resolved.signerUrl).toBe(PRODUCTION_SIGNER)
  })

  it('treats an empty value as absent, because unset variables substitute to empty strings', () => {
    setRuntimeConfig({ relayUrl: '', signerUrl: '' })
    const resolved = resolveServiceAddresses()
    expect(resolved.relayUrl).toBe(PRODUCTION_RELAY)
    expect(resolved.signerUrl).toBe(PRODUCTION_SIGNER)
  })
})
