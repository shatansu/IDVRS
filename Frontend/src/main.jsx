import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './i18n/index.js'   // initialise i18next before anything else renders
import './index.css'
import App from './App.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
