import DeckListInput from './DeckListInput'

function App() {
  return (
    <div>
      <h1 style={{ textAlign: 'center', padding: '20px', color: '#1a1a2e' }}>
        YuGiOh Deck Builder
      </h1>
      <p style={{ 
        textAlign: 'center', 
        color: '#666', 
        fontSize: '0.9rem',
        maxWidth: '800px',
        margin: '0 auto 30px auto'
      }}>
        Yu-Gi-Oh! © Konami. Card data provided by{' '}
        <a href="https://ygoprodeck.com" target="_blank" rel="noopener noreferrer" style={{ color: '#2a9d8f' }}>
          YGOPRODeck API
        </a>
        . This tool is unofficial and not affiliated with or endorsed by Konami.
      </p>
      <DeckListInput />
    </div>
  )
}

export default App