import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import './styles.css'
import './controls.css'
import './settings.css'

const root = document.getElementById('root')
if (!root) {
  throw new Error('AgentMaxx: #root element missing from index.html')
}

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>
)
