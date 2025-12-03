import { useState } from 'react'
import './DeckBuilder.css'

function DeckListInput() {
  const [deckList, setDeckList] = useState('')
  const [searchResults, setSearchResults] = useState([])
  const [loading, setLoading] = useState(false)
  const [selectedVersions, setSelectedVersions] = useState({})

  const handleParse = async () => {
    // Split deck list by lines
    const lines = deckList.split('\n').filter(line => line.trim() !== '')
    
    // Parse each line
    const parsedCards = lines.map(line => {
      const match = line.match(/^(\d+)?\s*[x×]?\s*(.+)$/i)
      
      if (match) {
        const quantity = match[1] ? parseInt(match[1]) : 1
        const cardName = match[2].trim()
        
        return { quantity, cardName }
      }
      return null
    }).filter(card => card !== null)
    
    console.log('Parsed cards:', parsedCards)
    
    // Now search for each card
    setLoading(true)
    const results = []
    
    for (const card of parsedCards) {
      try {
       const response = await fetch(
  `https://db.ygoprodeck.com/api/v7/cardinfo.php?fname=${encodeURIComponent(card.cardName)}`
)
        const data = await response.json()
        
        if (data.data && data.data.length > 0) {
          results.push({
            ...card,
            cardData: data.data[0] // Get first matching card
          })
        }
      } catch (error) {
        console.error(`Error fetching ${card.cardName}:`, error)
      }
    }
    
    setSearchResults(results)

    // Auto-select cheapest version for each card (ignore $0 prices)
    const autoSelected = {}
    results.forEach((result, index) => {
      if (result.cardData.card_sets && result.cardData.card_sets.length > 0) {
        // Find cheapest set (ignore $0 prices)
        const cheapest = result.cardData.card_sets.reduce((min, set) => {
          const price = parseFloat(set.set_price) || 0
          const minPrice = parseFloat(min.set_price) || 0
          
          // Skip if price is 0 (likely not available)
          if (price === 0) return min
          
          // If min is 0, use current set
          if (minPrice === 0) return set
          
          // Otherwise, return cheaper option
          return price < minPrice ? set : min
        })
        autoSelected[index] = cheapest
      }
    })
    setSelectedVersions(autoSelected)

    setLoading(false)
    console.log('Search results:', results)
    console.log('Auto-selected versions:', autoSelected)
  }

  const selectVersion = (resultIndex, set) => {
    setSelectedVersions(prev => ({
      ...prev,
      [resultIndex]: set
    }))
  }

  const calculateTotal = () => {
    let total = 0
    searchResults.forEach((result, index) => {
      const selected = selectedVersions[index]
      if (selected) {
        const price = parseFloat(selected.set_price) || 0
        total += price * result.quantity
      }
    })
    return total.toFixed(2)
  }

  const handleClear = () => {
    setDeckList('')
    setSearchResults([])
    setSelectedVersions({})
  }

  const loadExampleDeck = () => {
    setDeckList("3x Blue-Eyes White Dragon\n2x Dark Magician\n1x Red-Eyes Black Dragon\n1x Kuriboh")
  }

  return (
    <div className="deck-builder-container">
      <div className="input-section">
        <h2>Paste Your Deck List</h2>
        <textarea
          className="deck-textarea"
          value={deckList}
          onChange={(e) => setDeckList(e.target.value)}
          placeholder="Example:
3x Blue-Eyes White Dragon
2x Dark Magician
1x Red-Eyes Black Dragon"
          rows={10}
        />
        
        <div className="button-group">
          <button 
            className="search-button"
            onClick={handleParse}
          >
            Search Cards
          </button>

          <button 
            className="clear-button"
            onClick={handleClear}
          >
            Clear
          </button>
        </div>

        <div style={{ marginTop: '15px', color: '#666' }}>
          <span style={{ marginRight: '10px' }}>Quick test:</span>
          <button 
            className="example-button"
            onClick={loadExampleDeck}
          >
            Load Example Deck
          </button>
        </div>
      </div>

      {loading && <p className="loading-message">Searching for cards...</p>}

      {searchResults.length > 0 && (
        <div className="results-container">
          <h3 className="results-header">Found {searchResults.length} cards:</h3>
          {searchResults.map((result, index) => {
            const selectedVersion = selectedVersions[index]
            
            return (
              <div key={index} className="card-result">
                <div className="card-content">
                  {/* Card Image */}
                  {result.cardData.card_images && (
                    <img 
                      className="card-image"
                      src={result.cardData.card_images[0].image_url} 
                      alt={result.cardData.name}
                    />
                  )}
                  
                  {/* Card Info */}
                  <div className="card-info">
                    <h3 className="card-title">
                      {result.quantity}x {result.cardData.name}
                    </h3>
                    
                    {/* Selected Version */}
                    {selectedVersion && (
                      <div className="selected-version">
                        <div><strong>✓ SELECTED:</strong> {selectedVersion.set_name}</div>
                        <div>Rarity: {selectedVersion.set_rarity} | Price: ${selectedVersion.set_price} each</div>
                        <div className="subtotal">
                          Subtotal: ${(parseFloat(selectedVersion.set_price) * result.quantity).toFixed(2)}
                        </div>
                      </div>
                    )}
                    
                    {/* Available Sets/Printings */}
                    {result.cardData.card_sets && result.cardData.card_sets.length > 1 && (
                      <div className="other-versions">
                        <div className="other-versions-title">Other Available Versions:</div>
                        <div className="versions-list">
                          {result.cardData.card_sets
                            .filter(set => set.set_code !== selectedVersion?.set_code)
                            .map((set, setIndex) => (
                              <div 
                                key={setIndex} 
                                className="version-option"
                                onClick={() => selectVersion(index, set)}
                              >
                                <div className="version-name">{set.set_name}</div>
                                <div className="version-details">
                                  Code: {set.set_code} | Rarity: {set.set_rarity}
                                </div>
                                <div className="version-price">
                                  Price: ${set.set_price || 'N/A'} each
                                </div>
                              </div>
                            ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )
          })}

          {/* Total Price */}
          <div className="total-price">
            TOTAL DECK PRICE: ${calculateTotal()}
          </div>
        </div>
      )}
    </div>
  )
}

export default DeckListInput