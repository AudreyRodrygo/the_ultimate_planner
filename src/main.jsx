import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import StudyDashboard from './study-plan.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <StudyDashboard />
  </StrictMode>
)
