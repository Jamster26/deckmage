// src/App.jsx
import { useSearchParams } from 'react-router-dom';
import DeckListInput from './DeckListInput';
import './App.css';

function App() {
  const [searchParams] = useSearchParams();
  const isEmbed = searchParams.get('embed') === 'true';

  return (
    <>
      {!isEmbed && (
        <div className="header">
          <h1>Yu-Gi-Oh! Deck Builder</h1>
          <p className="disclaimer">
            Yu-Gi-Oh! © Konami • Card data by{' '}
            <a href="https://ygoprodeck.com" target="_blank" rel="noreferrer">
              YGOPRODeck
            </a>{' '}
            • Unofficial tool
          </p>
        </div>
      )}

      <div className={isEmbed ? 'embed-mode' : ''}>
        <DeckListInput />
      </div>
    </>
  );
}

export default App;