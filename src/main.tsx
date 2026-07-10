import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import './index.css'

// @univerjs/engine-render's font loader calls
// navigator.permissions.query({name:'local-fonts'}) (a Chromium-only Local Font
// Access API). Firefox rejects unknown permission names with a TypeError that
// surfaces as an uncaught promise rejection on every page load. Shim query() to
// resolve 'denied' for names the browser doesn't support, so it degrades quietly
// (Univer falls back to system fonts). Original behavior preserved for all else.
if (typeof navigator !== 'undefined' && navigator.permissions?.query) {
  const orig = navigator.permissions.query.bind(navigator.permissions)
  navigator.permissions.query = ((desc: PermissionDescriptor) =>
    orig(desc).catch((err) => {
      if (desc && (desc as { name?: string }).name === 'local-fonts') {
        return { state: 'denied', onchange: null } as unknown as PermissionStatus
      }
      throw err
    })) as typeof navigator.permissions.query
}

const container = document.getElementById('root')
if (!container) {
  throw new Error('Root element not found')
}

ReactDOM.createRoot(container).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)