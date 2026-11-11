import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import { App } from './App'
import { actions, getState } from './store'

// debug seam for Playwright-style probes and bug triage
declare global {
  interface Window {
    __forge?: { actions: typeof actions; getState: typeof getState }
  }
}
window.__forge = { actions, getState }

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
