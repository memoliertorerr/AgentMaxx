import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

const root = document.getElementById('root')
if (!root) {
  throw new Error('UsageMaxx: #root element missing from index.html')
}

createRoot(root).render(
  <StrictMode>
    <p>UsageMaxx</p>
  </StrictMode>
)
