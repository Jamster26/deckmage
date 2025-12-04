import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'
import './index.css'  // ← Add this line


createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)