import { getServiceConfig, type ServiceConfig } from '@cloistr/collab-common/config'

/**
 * Where this app's services live.
 *
 * Resolution order, highest first: configuration the container wrote at
 * startup, then the value compiled in at build time, then the shared default.
 * With no runtime configuration this returns exactly what the build args set,
 * which is why adopting this changed nothing for production.
 *
 * Why this thin function exists rather than calling the shared reader directly
 * at each use site: it gives the decision ONE named home in this app, and that
 * home has a test. Before this, the relay was decided in App.tsx and the file
 * host in Sheet.tsx, neither of which could be asserted about without
 * rendering the app, which is a large part of why both drifted to literals and
 * stayed that way. Anyone who changes this now has a test to break.
 */
export function resolveServiceAddresses(): ServiceConfig {
  return getServiceConfig()
}
