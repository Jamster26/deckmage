import { BrowserRouter, Routes, Route } from 'react-router-dom'
import DeckListInput from './DeckListInput'
import Login from './pages/login'
import Signup from './pages/signup'
import Dashboard from './pages/dashboard'
import { useEffect, useState } from 'react'

// Your existing deck builder component
function DeckBuilder() {
  const [config, setConfig] = useState({
    embed: false,
    size: 'square',
    theme: 'light',
    primaryColor: '#2a9d8f',
    backgroundColor: '#ffffff',
    textColor: '#1a1a2e',
    fontFamily: 'inherit'
  })

  useEffect(() => {
    // Read URL parameters
    const params = new URLSearchParams(window.location.search)
    
    const newConfig = {
      embed: params.get('embed') === 'true',
      size: params.get('size') || 'square',
      theme: params.get('theme') || 'light',
      primaryColor: params.get('primary') ? `#${params.get('primary')}` : '#2a9d8f',
      backgroundColor: params.get('background') ? `#${params.get('background')}` : (params.get('theme') === 'dark' ? '#0a0a1f' : '#ffffff'),
      textColor: params.get('text') ? `#${params.get('text')}` : (params.get('theme') === 'dark' ? '#ffffff' : '#1a1a2e'),
      fontFamily: params.get('font') || 'inherit'
    }
    
    setConfig(newConfig)

    // Apply CSS variables for theming
    document.documentElement.style.setProperty('--primary-color', newConfig.primaryColor)
    
    // Apply theme to body if in embed mode
    if (newConfig.embed) {
      document.body.style.margin = '0'
      document.body.style.padding = '0'
    }
  }, [])

  // Theme configurations
  const themes = {
    light: {
      background: config.backgroundColor,
      text: config.textColor,
      cardBg: '#ffffff',
      border: '#dee2e6',
      inputBg: '#f8f9fa',
      inputText: '#212529'
    },
    dark: {
      background: config.backgroundColor,
      text: config.textColor,
      cardBg: '#1a1a2e',
      border: '#2d2d44',
      inputBg: '#16162e',
      inputText: '#ffffff'
    }
  }

  const currentTheme = themes[config.theme]

  // Layout configurations
  const layouts = {
    square: {
      maxWidth: '800px',
      padding: '20px'
    },
    wide: {
      maxWidth: '100%',
      padding: '20px 40px'
    },
    full: {
      maxWidth: '100%',
      padding: '40px'
    },
    sidebar: {
      maxWidth: '380px',
      padding: '12px'
    }
  }

  const currentLayout = layouts[config.size]

  return (
    <div style={{
      background: currentTheme.background,
      color: currentTheme.text,
      fontFamily: config.fontFamily,
      minHeight: '100vh',
      overflowY: 'auto',
      overflowX: 'hidden'
    }}>
      {/* Only show header if NOT embedded */}
      {!config.embed && (
        <>
          <h1 style={{ 
            textAlign: 'center', 
            padding: '20px', 
            color: currentTheme.text,
            margin: '0 0 20px 0'
          }}>
            YuGiOh Deck Builder
          </h1>
          <p style={{ 
            textAlign: 'center', 
            color: currentTheme.text,
            opacity: 0.7,
            fontSize: '0.9rem',
            maxWidth: '800px',
            margin: '0 auto 30px auto'
          }}>
            Yu-Gi-Oh! © Konami. Card data provided by{' '}
            <a 
              href="https://ygoprodeck.com" 
              target="_blank" 
              rel="noopener noreferrer" 
              style={{ color: config.primaryColor }}
            >
              YGOPRODeck API
            </a>
            . This tool is unofficial and not affiliated with or endorsed by Konami.
          </p>
        </>
      )}
      
      <DeckListInput 
        theme={{ ...currentTheme, theme: config.theme }}
        layout={currentLayout}
        primaryColor={config.primaryColor}
        size={config.size}
      />
    </div>
  )
}

// Main App with routing
function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<DeckBuilder />} />
        <Route path="/login" element={<Login />} />
        <Route path="/signup" element={<Signup />} />
        <Route path="/dashboard" element={<Dashboard />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App