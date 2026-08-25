import { useState, useEffect, useRef } from 'react'
import { Sheet } from './components/Sheet.js'
import { useNostrAuth } from '@cloistr/auth'
import { Header, Footer, SharedAuthProvider, ToastProvider, ThemeProvider, SignerRecovery, useSharedSession } from '@cloistr/ui/components'
import '@cloistr/ui/styles'

// Default relay for Yjs sync
const DEFAULT_RELAY_URL = import.meta.env.VITE_RELAY_URL || 'wss://relay.cloistr.xyz'

/**
 * Get or generate document ID.
 * Uses URL parameter if provided, otherwise generates a new one.
 * Format: {type}-{timestamp}-{random} (e.g., sheet-1711392000-a1b2c3)
 */
function getDocumentId(): string {
  const params = new URLSearchParams(window.location.search)
  const urlDocId = params.get('docId')

  if (urlDocId) {
    return urlDocId
  }

  // Generate a new document ID and update URL
  const newDocId = `sheet-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`
  const newUrl = new URL(window.location.href)
  newUrl.searchParams.set('docId', newDocId)
  window.history.replaceState({}, '', newUrl.toString())

  return newDocId
}

/**
 * Main content - shows loading, signer recovery, or the sheet based on auth state.
 *
 * SIGNER-RESILIENCE: session and signer reachability are separated here.
 *
 *   session            = who you are (backend JWT + shared SSO).
 *                        Only a genuine expiry requires re-authentication.
 *   signer reachability = can we reach your bunker over relays right now.
 *                        Transient. Retry.
 *
 * A NIP-46 approval timeout or relay hiccup is the SECOND thing. Treating it
 * as the first is why a relay blip would send the user to the login screen —
 * a session that was never invalid, presented as "you need to sign in again".
 *
 * This component therefore:
 *   1. Tracks a connectFailed state that fires when a connecting→failed
 *      transition is observed while this component is mounted.
 *   2. Also shows SignerRecovery when authState.error is set on mount,
 *      covering the case where the gate (AuthRestoreGate) hid the failure
 *      before this component first rendered.
 *   3. On visibilitychange, if the user tabs back while in the failed state,
 *      reload to let the auth system retry (Part 4 of the signer-resilience
 *      design). The session is untouched; only the signer channel is reset.
 *
 * The login prompt is shown ONLY when there is genuinely no session at all.
 */
function AppContent() {
  const { authState, signer } = useNostrAuth()
  const [documentId] = useState(getDocumentId)

  // isResolving = SharedAuthProvider is restoring a known SSO session.
  // isConnecting = NIP-46 signer handshake is in progress.
  // Both gate the UI while active. Including isResolving in the combined
  // flag prevents the login prompt from flickering during the SSO restore
  // window — same rationale as the comment in the upstream stash app.
  const { isResolving } = useSharedSession()
  const isConnecting = !!authState.isConnecting || isResolving

  // connectFailed tracks the connecting→failed transition for cases where
  // this component was mounted during the connecting window (i.e., the
  // SharedAuthProvider gate was NOT active). A failed handshake must show
  // SignerRecovery, not the login prompt.
  const [connectFailed, setConnectFailed] = useState(false)
  const wasConnecting = useRef(false)

  useEffect(() => {
    if (isConnecting) {
      wasConnecting.current = true
      setConnectFailed(false)
      return
    }
    if (wasConnecting.current && !authState.isConnected) {
      wasConnecting.current = false
      setConnectFailed(true)
    }
  }, [isConnecting, authState.isConnected])

  // Part 4: visibilitychange reconnect.
  //
  // When the user tabs back to a sheet that is in the signer-failed state,
  // reload so the auth system gets a fresh attempt. The session (SSO cookie,
  // backend JWT) is intact; only the signer relay channel needs re-opening.
  //
  // Using reload rather than a synthetic retry keeps the NIP-46 handshake
  // code path identical to a normal page load and avoids the risk of a
  // double-connect with a stale provider still in memory.
  const isSignerFailed = connectFailed || !!authState.error
  useEffect(() => {
    function handleVisible() {
      if (document.visibilityState !== 'visible') return
      if (isSignerFailed) {
        setConnectFailed(false)
        window.location.reload()
      }
    }
    document.addEventListener('visibilitychange', handleVisible)
    return () => document.removeEventListener('visibilitychange', handleVisible)
  }, [isSignerFailed])

  return (
    <div className="app" style={{ width: '100vw', height: '100dvh', display: 'flex', flexDirection: 'column' }}>
      <Header activeServiceId="sheets" />

      {/* role="main" instead of <main>: AppShell renders its own <main> inside
          Sheet, and nested <main> elements are invalid HTML. */}
      <div role="main" style={{ flex: 1, overflow: 'hidden' }}>
        {authState.isConnected && signer && authState.pubkey ? (
          <Sheet
            documentId={documentId}
            signer={signer}
            publicKey={authState.pubkey}
            relayUrl={DEFAULT_RELAY_URL}
          />
        ) : isConnecting ? (
          // Auth flash fix: while the NIP-46 signer is establishing its
          // connection (isConnecting), show a neutral loading state instead
          // of the sign-in prompt. Without this, the prompt renders for ~3
          // seconds on every page load while the signer handshake completes,
          // then is replaced by the sheet — a jarring flash confirmed by
          // Playwright (first capture: sign-in screen, second at +3s: sheet).
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', minHeight: 0 }}>
            <div style={{ textAlign: 'center', color: 'var(--cloistr-text-muted)' }}>
              <p>Connecting…</p>
            </div>
          </div>
        ) : isSignerFailed ? (
          // Signer failure: the session is valid, but we could not reach the
          // bunker. NEVER show a credential prompt here. The session is NOT
          // expired — the signer relay is unreachable or timed out.
          //
          // Part 1 (never destroy session state on signing failure) and
          // Part 2 (uh-oh recovery screen) of the signer-resilience design
          // are both expressed here.
          <SignerRecovery
            error={authState.error ?? { code: 'CONNECTION_FAILED' }}
            retrying={isConnecting}
            onRetry={() => {
              setConnectFailed(false)
              window.location.reload()
            }}
            onGoBack={() => setConnectFailed(false)}
          />
        ) : (
          // Genuine "not signed in" state: no session at all. The login
          // prompt only reaches the screen when there is no active session
          // AND no evidence of a connection failure.
          <div className="login-prompt" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', minHeight: 0 }}>
            <div style={{ textAlign: 'center' }}>
              <h2>Welcome to Cloistr Sheets</h2>
              <p>Collaborative spreadsheets powered by Nostr</p>
              <p>Sign in to create or edit spreadsheets.</p>
            </div>
          </div>
        )}
      </div>

      <Footer />
    </div>
  )
}

function App() {
  return (
    <ThemeProvider>
      <ToastProvider>
        <SharedAuthProvider>
          <AppContent />
        </SharedAuthProvider>
      </ToastProvider>
    </ThemeProvider>
  )
}

export default App
