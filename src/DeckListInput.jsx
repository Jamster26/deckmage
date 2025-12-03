import { useState, useEffect } from 'react'
import './DeckBuilder.css'

function DeckListInput({ theme, layout, primaryColor, size }) {
    const [deckList, setDeckList] = useState('')
  const [searchResults, setSearchResults] = useState([])
  const [loading, setLoading] = useState(false)
  const [selectedVersions, setSelectedVersions] = useState({})

  // Helper function to darken color for gradients
  function adjustBrightness(color, percent) {
    const num = parseInt(color.replace('#', ''), 16)
    const amt = Math.round(2.55 * percent)
    const R = (num >> 16) + amt
    const G = (num >> 8 & 0x00FF) + amt
    const B = (num & 0x0000FF) + amt
    return '#' + (0x1000000 + (R<255?R<1?0:R:255)*0x10000 +
      (G<255?G<1?0:G:255)*0x100 +
      (B<255?B<1?0:B:255))
      .toString(16).slice(1)
  }

   // ADD THIS ENTIRE BLOCK — AUTO-RESIZES THE IFRAME WHEN EMBEDDED
  useEffect(() => {
    // Only run in embed mode (prevents errors on standalone page)
    const urlParams = new URLSearchParams(window.location.search)
    if (urlParams.get('embed') !== 'true') return

    const sendHeight = () => {
      const height = document.documentElement.scrollHeight + 100 // +100 for safety
      window.parent.postMessage(
        { type: 'deckmage-resize', height },
        '*' // In production change '*' → 'https://yoursite.com' for security
      )
    }

    // Send height immediately and on any change
    sendHeight()

    // Re-send when results change or window resizes
    const observer = new MutationObserver(sendHeight)
    observer.observe(document.body, { childList: true, subtree: true })
    window.addEventListener('resize', sendHeight)

    return () => {
      observer.disconnect()
      window.removeEventListener('resize', sendHeight)
    }
  }, [searchResults, selectedVersions]) // Re-run when results or selections change

 const handleParse = async () => {
  const lines = deckList.split('\n').filter(line => line.trim() !== '')
  
  const parsedCards = lines.map(line => {
  const match = line.match(/^(\d+)?\s*[x×]?\s*(.+)$/i)
  
  if (match) {
    const quantity = match[1] ? parseInt(match[1]) : 1
    let cardName = match[2].trim()
    
    // 👇 Convert ALL fancy apostrophes → straight apostrophe
    cardName = cardName.replace(/[\u2018\u2019\u201A\u201B\u2032\u2035''`´]/g, "'")
    
    return { quantity, cardName }
  }
  return null
}).filter(card => card !== null)
  
  console.log('Parsed cards:', parsedCards)
  
  setLoading(true)
  const results = []
  const notFound = []
  
  for (const card of parsedCards) {
    try {
      let cardData = null
      
    // CREATE SEARCH VARIATIONS (prioritize straight apostrophe!)
const searchVariations = [
  card.cardName,                                    // Original (whatever user typed)
  card.cardName.replace(/[''`´]/g, "'"),           // Convert ALL apostrophes → straight '
  card.cardName.replace(/['']/g, "'"),             // Fix curly ' → straight '
  card.cardName.replace(/['']/g, "'"),             // Fix curly ' → straight '
  `The ${card.cardName}`,                           // Add "The"
  `The ${card.cardName.replace(/[''`´]/g, "'")}`,  // "The" + straight apostrophe
]
      
      // TRY EXACT MATCH with all variations
      for (const variation of searchVariations) {
        if (cardData) break // Already found, stop searching
        
        try {
          const response = await fetch(
            `https://db.ygoprodeck.com/api/v7/cardinfo.php?name=${encodeURIComponent(variation)}`
          )
          const data = await response.json()
          
          if (data.data && data.data.length > 0) {
            cardData = data.data[0]
            console.log(`✅ Found (exact): ${card.cardName} → ${data.data[0].name}`)
            break
          }
        } catch (err) {
          // This variation didn't work, try next
          continue
        }
      }
      
      // TRY FUZZY as last resort
      if (!cardData) {
        try {
          const fuzzyResponse = await fetch(
            `https://db.ygoprodeck.com/api/v7/cardinfo.php?fname=${encodeURIComponent(card.cardName)}`
          )
          const fuzzyData = await fuzzyResponse.json()
          
          if (fuzzyData.data && fuzzyData.data.length > 0) {
            cardData = fuzzyData.data[0]
            console.log(`⚠️ Found (fuzzy): ${card.cardName} → ${fuzzyData.data[0].name}`)
          }
        } catch (err) {
          // All methods failed
        }
      }
      
      // Add to results or mark as not found
      if (cardData) {
        results.push({
          ...card,
          cardData: cardData
        })
      } else {
        console.warn(`❌ NOT FOUND: ${card.cardName}`)
        notFound.push(card.cardName)
      }
      
    } catch (error) {
      console.error(`❌ ERROR fetching ${card.cardName}:`, error)
      notFound.push(card.cardName)
    }
  }
  
  console.log(`Found ${results.length}/${parsedCards.length} cards`)
  if (notFound.length > 0) {
    console.warn('Cards not found:', notFound)
  }
  
  setSearchResults(results)

  // Auto-select cheapest version for each card (ignore $0 prices)
  const autoSelected = {}
  results.forEach((result, index) => {
    if (result.cardData.card_sets && result.cardData.card_sets.length > 0) {
      const cheapest = result.cardData.card_sets.reduce((min, set) => {
        const price = parseFloat(set.set_price) || 0
        const minPrice = parseFloat(min.set_price) || 0
        
        if (price === 0) return min
        if (minPrice === 0) return set
        
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
    <div className="deck-builder-container" style={{
      maxWidth: layout.maxWidth,
      margin: '0 auto',
      padding: layout.padding
    }}>
<div className="input-section" style={{
        background: theme.cardBg,
        borderColor: theme.border
      }}>
<h2 style={{ color: theme.text }}>Paste Your Deck List</h2>
      <textarea
          className="deck-textarea"
          style={{
            background: theme.inputBg,
            color: theme.inputText,
            borderColor: theme.border
          }}
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
            style={{
              background: `linear-gradient(135deg, ${primaryColor} 0%, ${adjustBrightness(primaryColor, -20)} 100%)`
            }}
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
<h3 className="results-header" style={{ color: theme.text }}>Found {searchResults.length} cards:</h3>
          {searchResults.map((result, index) => {
            const selectedVersion = selectedVersions[index]
            
            return (
<div key={index} className="card-result" style={{
                background: theme.cardBg,
                borderColor: theme.border
              }}>
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
<h3 className="card-title" style={{ color: theme.text }}>
                        {result.quantity}x {result.cardData.name}
                    </h3>
                    
                    {/* Selected Version */}
                    {selectedVersion && (
<div className="selected-version" style={{
                        background: `linear-gradient(135deg, ${primaryColor} 0%, ${adjustBrightness(primaryColor, -20)} 100%)`
                      }}>
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
<div className="other-versions-title" style={{ color: theme.text }}>Other Available Versions:</div>                        <div className="versions-list">
                          {result.cardData.card_sets
                            .filter(set => set.set_code !== selectedVersion?.set_code)
                            .map((set, setIndex) => (
                           <div 
                                key={setIndex} 
                                className="version-option"
                                onClick={() => selectVersion(index, set)}
                                style={{
                                  background: theme.inputBg,
                                  borderColor: theme.border,
                                  color: theme.text
                                }}
                              >
                                <div className="version-name">{set.set_name}</div>
                                <div className="version-details">
                                  Code: {set.set_code} | Rarity: {set.set_rarity}
                                </div>
<div className="version-price" style={{ color: primaryColor }}>
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
<div className="total-price" style={{
            background: `linear-gradient(135deg, ${adjustBrightness(theme.text, -40)} 0%, ${adjustBrightness(theme.text, -60)} 100%)`
          }}>
                        TOTAL DECK PRICE: ${calculateTotal()}
          </div>
        </div>
      )}
    </div>
  )
}

export default DeckListInput