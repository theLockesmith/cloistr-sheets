import { Sheet } from './components/Sheet.js'

// TODO: Import AuthProvider from cloistr-collab-common once it's available
const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  return <>{children}</>
}

function App() {
  return (
    <AuthProvider>
      <div className="App" style={{ width: '100vw', height: '100vh' }}>
        <Sheet />
      </div>
    </AuthProvider>
  )
}

export default App