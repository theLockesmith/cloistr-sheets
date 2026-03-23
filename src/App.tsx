import { useState, useEffect, createContext, useContext, type ReactNode } from 'react'
import { Sheet } from './components/Sheet.js'
import { generateSecretKey, getPublicKey, finalizeEvent, nip19 } from 'nostr-tools'
import type { SignerInterface } from '@cloistr/collab-common'
import type { Event, UnsignedEvent } from 'nostr-tools'

// Auth context providing signer and relay config
interface AuthContextType {
  signer: SignerInterface
  publicKey: string
  relayUrl: string
}

const AuthContext = createContext<AuthContextType | null>(null)

interface AuthProviderProps {
  children: ReactNode
  relayUrl: string
  signer: SignerInterface
  publicKey: string
}

function AuthProvider({ children, relayUrl, signer, publicKey }: AuthProviderProps) {
  return (
    <AuthContext.Provider value={{ signer, publicKey, relayUrl }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useNostrAuth() {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useNostrAuth must be used within AuthProvider')
  }
  return context
}

/**
 * Create a SignerInterface from a private key
 * In production, this would be replaced with NIP-46 or NIP-07 signer
 */
function createLocalSigner(privateKey: Uint8Array): SignerInterface {
  const pubkey = getPublicKey(privateKey)

  return {
    async getPublicKey(): Promise<string> {
      return pubkey
    },
    async signEvent(event: UnsignedEvent): Promise<Event> {
      return finalizeEvent(event, privateKey)
    },
    async encrypt(_pubkey: string, _plaintext: string): Promise<string> {
      throw new Error('Encryption not implemented for local signer')
    },
    async decrypt(_pubkey: string, _ciphertext: string): Promise<string> {
      throw new Error('Decryption not implemented for local signer')
    },
  }
}

function App() {
  const [authConfig, setAuthConfig] = useState<{
    relayUrl: string
    signer: SignerInterface
    publicKey: string
  } | null>(null)

  useEffect(() => {
    // Generate a session key for demo purposes
    // In production, this would connect to coldforge-signer via NIP-46
    const privateKey = generateSecretKey()
    const publicKey = getPublicKey(privateKey)
    const signer = createLocalSigner(privateKey)

    setAuthConfig({
      relayUrl: 'wss://nos.lol', // Public relay for demo
      signer,
      publicKey
    })
  }, [])

  if (!authConfig) {
    return <div>Loading...</div>
  }

  return (
    <AuthProvider
      relayUrl={authConfig.relayUrl}
      signer={authConfig.signer}
      publicKey={authConfig.publicKey}
    >
      <div className="app" style={{ width: '100vw', height: '100vh', display: 'flex', flexDirection: 'column' }}>
        <header style={{ padding: '0.5rem 1rem', backgroundColor: '#f5f5f5', borderBottom: '1px solid #e0e0e0' }}>
          <h1 style={{ margin: 0, fontSize: '1.25rem', display: 'inline' }}>Cloistr Sheets</h1>
          <span style={{ marginLeft: '1rem', fontSize: '0.75rem', color: '#666' }}>
            {nip19.npubEncode(authConfig.publicKey).slice(0, 20)}...
          </span>
        </header>
        <main style={{ flex: 1, overflow: 'hidden' }}>
          <Sheet documentId="demo-sheet" />
        </main>
      </div>
    </AuthProvider>
  )
}

export default App
