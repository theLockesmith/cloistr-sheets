# Runtime service configuration in this app — tasks

- [x] Test the service-address resolution first, red before green. (verified: 10 tests red before the module existed, green after)
- [x] One service-address module, delegating to the shared reader. (verified: src/lib/serviceAddresses.ts)
- [x] Relay read from it instead of a literal. (verified: App.tsx diff)
- [x] File host read from it instead of a literal. (verified: Sheet.tsx diff)
- [x] Signer passed explicitly to the shared auth provider. (verified: App.tsx diff)
- [x] Shared package dependency raised to the version carrying the runtime tier. (verified: collab-common 0.4.0, plus auth ^1.4.1 and ui 0.42.2, which it needs; clean npm ci exit 0)
- [x] Serving config becomes a template, with an exact-match configuration
      location that forbids caching. (verified: config.js served no-store in the staging container)
- [x] Entry page loads the configuration before the bundle. (verified: built dist/index.html keeps the config.js tag)
- [x] Serving stage carries production defaults and restricts the substitution
      filter. (verified: no-env container served production values)
- [x] Build the image. (verified: docker build exit 0, local image sha256:119ae412edd7)
- [x] No-environment run reports production hosts. (verified: browser check PASS)
- [x] Staging run reports staging hosts and makes NO request to a production
      host, observed in a real browser. (verified: browser check PASS, zero production requests or sockets)
- [ ] Record the image digest for whoever stands this up in staging.
