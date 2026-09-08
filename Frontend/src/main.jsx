import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import axios from 'axios'
import './i18n/index.js'   // initialise i18next before anything else renders
import './index.css'
import App from './App.jsx'

const apiBase = import.meta.env.VITE_API_URL || ''
if (apiBase) {
  axios.defaults.baseURL = apiBase
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
