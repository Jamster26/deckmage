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
      
      // Convert fancy apostrophes → straight apostrophe
      cardName = cardName.replace(/[\u2018\u2019\u201A\u201B\u2032\u2035''`´]/g, "'")
      
      return { quantity, cardName }
    }
    return null
  }).filter(card => card !== null)
  
  console.log('Parsed cards:', parsedCards)
  
  setLoading(true)
  
  // Get shop ID from URL
  const urlParams = new URLSearchParams(window.location.search)
  const shopId = urlParams.get('shop')
  const isDemo = urlParams.get('demo') === 'true'
  
  if (isDemo || !shopId) {
    // Demo mode - use YGOProDeck (your existing code)
    await handleDemoMode(parsedCards)
  } else {
    // Real shop mode - use your API
    await handleRealShopMode(parsedCards, shopId)
  }
  
  setLoading(false)
}

// Update handleRealShopMode in DeckListInput.jsx
async function handleRealShopMode(parsedCards, shopId) {
  const cardNames = parsedCards.map(c => c.cardName)
  
  try {
    // Call YOUR API
    const response = await fetch('/.netlify/functions/search-inventory', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        shopId: shopId,
        cardNames: cardNames
      })
    })
    
    const data = await response.json()
    
    if (!data.success) {
      alert('Error searching shop inventory: ' + data.error)
      return
    }
    
    // Map results to deck builder format
    const results = []
    const notFound = []
    
    // NEW: Fetch card images from YGOProDeck in parallel
    for (const card of parsedCards) {
      const shopProducts = data.results[card.cardName]
      
      if (shopProducts && shopProducts.length > 0) {
        // Try to get card image from YGOProDeck API
        let cardImage = 'https://images.ygoprodeck.com/images/cards/back.jpg' // fallback
        
        try {
          const ygoproResponse = await fetch(
            `https://db.ygoprodeck.com/api/v7/cardinfo.php?name=${encodeURIComponent(card.cardName)}`
          )
          const ygoproData = await ygoproResponse.json()
          
          if (ygoproData.data && ygoproData.data[0]?.card_images?.[0]?.image_url) {
            cardImage = ygoproData.data[0].card_images[0].image_url
            console.log(`✅ Got image for ${card.cardName} from YGOProDeck`)
          }
        } catch (err) {
          console.warn(`⚠️ Could not fetch image for ${card.cardName}:`, err)
        }
        
        // Card found in shop inventory
        results.push({
          quantity: card.quantity,
          cardName: card.cardName,
          shopProducts: shopProducts,
          cardData: {
            name: card.cardName,
            card_images: [{ image_url: cardImage }],
            card_sets: shopProducts.map(p => ({
              set_name: `${p.setCode || 'Unknown'} - ${p.rarity || 'Unknown'} - ${p.condition || 'Near Mint'}`,
              set_code: p.setCode || 'N/A',
              set_rarity: p.rarity || 'Common',
              set_price: p.price?.toString() || '0.00',
              productId: p.productId,
              variantId: p.variantId,
              available: p.available,
              inventoryQuantity: p.inventoryQuantity
            }))
          }
        })
      } else {
        notFound.push(card.cardName)
      }
    }
    
    console.log(`Found ${results.length}/${parsedCards.length} cards in shop inventory`)
    if (notFound.length > 0) {
      console.warn('Cards not in inventory:', notFound)
      alert(`⚠️ ${notFound.length} cards not found in shop inventory:\n\n${notFound.join('\n')}\n\nThese cards are not available at this shop.`)
    }
    
    setSearchResults(results)
    
    // Auto-select cheapest version
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
    
  } catch (error) {
    console.error('Error fetching shop inventory:', error)
    alert('Failed to search shop inventory. Please try again.')
  }
}

// Demo mode - YGOProDeck search (your existing logic)
async function handleDemoMode(parsedCards) {
  const results = []
  const notFound = []
  
  for (const card of parsedCards) {
    try {
      let cardData = null
      
      const searchVariations = [
        card.cardName,
        card.cardName.replace(/[''`´]/g, "'"),
        card.cardName.replace(/['']/g, "'"),
        card.cardName.replace(/['']/g, "'"),
        `The ${card.cardName}`,
        `The ${card.cardName.replace(/[''`´]/g, "'")}`
      ]
      
      for (const variation of searchVariations) {
        if (cardData) break
        
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
          continue
        }
      }
      
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
    <div className="deck-builder-container" data-size={size} style={{
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
            style={{
              background: theme.theme === 'dark' 
                ? 'linear-gradient(135deg, #e63946 0%, #d62828 100%)'
                : 'linear-gradient(135deg, #6c757d 0%, #495057 100%)',
              color: 'white'
            }}
          >
            Clear
          </button>
        </div>

        <div style={{ marginTop: '15px', color: '#666' }}>
          <span style={{ marginRight: '10px' }}>Quick test:</span>
        <button 
            className="example-button"
            onClick={loadExampleDeck}
            style={{
              color: primaryColor,
              borderColor: primaryColor,
              background: theme.cardBg
            }}
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
                        background: theme.theme === 'dark' 
                          ? `linear-gradient(135deg, ${primaryColor} 0%, ${adjustBrightness(primaryColor, -20)} 100%)`
                          : 'linear-gradient(135deg, #2a9d8f 0%, #1d7a70 100%)'
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
<div className="version-price" style={{ 
                                  color: theme.theme === 'dark' ? '#ffd700' : '#2a9d8f',
                                  fontWeight: 'bold'
                                }}>
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

          {/* 🛒 ADD ALL TO BASKET BUTTON */}
          <div style={{ 
            marginTop: '25px', 
            textAlign: 'center',
            paddingBottom: '30px'
          }}>
            <button
              className="add-all-button"
               onClick={() => {
  const urlParams = new URLSearchParams(window.location.search)
  const shopId = urlParams.get('shop')

  // Build cart data in the format the demo shop expects
  const cartItems = searchResults.map((result, index) => {
    const selectedSet = selectedVersions[index]
    return {
      name: result.cardData.name,
      quantity: result.quantity,
      setName: selectedSet?.set_name || 'Unknown Set',
      setCode: selectedSet?.set_code || 'N/A',
      rarity: selectedSet?.set_rarity || 'Common',
      price: parseFloat(selectedSet?.set_price) || 0,
      image: result.cardData.card_images?.[0]?.image_url || ''
    }
  }).filter(item => item.setName)

  console.log('🛒 Adding to cart:', cartItems)

  if (shopId === 'deckmage-test.myshopify.com') {
    // Real shop mode - send to parent window
    window.parent.postMessage({
      type: 'DECKMAGE_ADD_TO_CART',
      items: cartItems,
      total: parseFloat(calculateTotal())
    }, '*')
    
    // Show success message
    alert(`✅ Added ${cartItems.length} cards to cart!\n\nTotal: $${calculateTotal()}\n\nCheck your cart to complete the order.`)
  } else {
    // Demo mode - just show alert
    alert(`✅ Demo Mode\n\n${cartItems.length} cards ready\nTotal: $${calculateTotal()}\n\n🔒 This is showing YGOProDeck prices.\n\nConnect your Shopify store to enable real cart integration!`)
  }
}}
style={{
  background: `linear-gradient(135deg, ${primaryColor} 0%, ${adjustBrightness(primaryColor, -20)} 100%)`,
  color: 'white',
  border: 'none',
  padding: '20px 60px',
  fontSize: '20px',
  fontWeight: 'bold',
  borderRadius: '12px',
  cursor: 'pointer',
  boxShadow: '0 4px 15px rgba(0,0,0,0.3)',
  transition: 'all 0.3s ease',
  display: 'inline-flex',
  alignItems: 'center',
  gap: '12px'
}}
onMouseEnter={(e) => {
  e.target.style.transform = 'translateY(-3px)'
  e.target.style.boxShadow = '0 8px 25px rgba(0,0,0,0.4)'
}}
onMouseLeave={(e) => {
  e.target.style.transform = 'translateY(0)'
  e.target.style.boxShadow = '0 4px 15px rgba(0,0,0,0.3)'
}}
>
  🛒 Add All to Basket — ${calculateTotal()}
</button>

<div style={{ 
  marginTop: '12px', 
  fontSize: '0.9rem', 
  color: theme.text,
  opacity: 0.7 
}}>
  {searchResults.length} cards • Total: ${calculateTotal()}
</div>
</div>

</div>
)}
</div>
)
}

export default DeckListInput