import { useState, useEffect } from 'react'
import { supabase } from '../supabaseClient'
import { searchYGOCards, extractCardName } from '../utils/ygoprodeck'

function MatchModal({ product, onClose, onSave }) {
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState([])
  const [selectedCard, setSelectedCard] = useState(null)
  const [searching, setSearching] = useState(false)
  const [saving, setSaving] = useState(false)

  // Auto-suggest on mount
  useEffect(() => {
    const suggestedName = extractCardName(product.title)
    if (suggestedName) {
      setSearchQuery(suggestedName)
      handleSearch(suggestedName)
    }
  }, [product.title])
  
  // ESC key listener
  useEffect(() => {
    function handleEscKey(event) {
      if (event.key === 'Escape') {
        onClose()
      }
    }

    document.addEventListener('keydown', handleEscKey)
    
    // Cleanup
    return () => {
      document.removeEventListener('keydown', handleEscKey)
    }
  }, [onClose])

  async function handleSearch(query = searchQuery) {
    if (!query.trim()) return
    
    setSearching(true)
    const results = await searchYGOCards(query)
    setSearchResults(results)
    setSearching(false)
  }

async function handleSave() {
  if (!selectedCard) return
  
  setSaving(true)
  
  try {
    console.log('Saving match for product:', product.id)
    console.log('Selected card:', selectedCard.name)
    
    // Update - use matched_card_id instead of card_id
    const { data: updateData, error } = await supabase
      .from('products')
      .update({
        matched_card_name: selectedCard.name,
        matched_card_id: selectedCard.id.toString()  // ← Changed from card_id
      })
      .eq('id', product.id)
      .select()
    
    console.log('Update result:', { updateData, error })
    
    if (error) {
      console.error('Error saving match:', error)
      alert('Failed to save match: ' + error.message)
      setSaving(false)
      return
    }
    
    // Verify the save
    const { data: verified } = await supabase
      .from('products')
      .select('id, title, matched_card_name, matched_card_id')
      .eq('id', product.id)
      .single()
    
    console.log('Verified data after save:', verified)
    
    console.log('Match saved successfully!')
    setSaving(false)
    onSave()
    
  } catch (error) {
    console.error('Error saving match:', error)
    alert('Failed to save match')
    setSaving(false)
  }
}

  async function handleUnmatch() {
    setSaving(true)
    
    const { error } = await supabase
      .from('products')
      .update({
        matched_card_name: null,
        card_id: null
      })
      .eq('id', product.id)
    
    if (error) {
      console.error('Error unmatching:', error)
      alert('Failed to unmatch')
    } else {
      onSave()
    }
    
    setSaving(false)
  }

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      background: 'rgba(0,0,0,0.85)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1000,
      padding: '20px',
      overflowY: 'auto'
    }}>
      <div style={{
        background: '#1a1a2e',
        border: '1px solid #2d2d44',
        borderRadius: '16px',
        maxWidth: '900px',
        width: '100%',
        maxHeight: '90vh',
        overflow: 'auto',
        padding: '30px'
      }}>
        
        {/* Header */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          marginBottom: '30px'
        }}>
          <div>
            <h2 style={{ color: '#fff', fontSize: '1.8rem', marginBottom: '10px' }}>
              Match Product to Card
            </h2>
            <p style={{ color: '#888', fontSize: '0.95rem' }}>
              Link this product to a Yu-Gi-Oh! card for better search visibility
            </p>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#888',
              fontSize: '2rem',
              cursor: 'pointer',
              padding: '0',
              width: '40px',
              height: '40px'
            }}
          >
            ×
          </button>
        </div>

        {/* Product Info */}
        <div style={{
          background: '#0a0a1f',
          border: '1px solid #2d2d44',
          borderRadius: '12px',
          padding: '20px',
          marginBottom: '30px',
          display: 'flex',
          gap: '20px'
        }}>
          {product.images?.[0] && (
            <img
              src={product.images[0].src}
              alt={product.title}
              style={{
                width: '100px',
                height: '100px',
                objectFit: 'cover',
                borderRadius: '8px',
                border: '1px solid #2d2d44'
              }}
            />
          )}
          <div style={{ flex: 1 }}>
            <div style={{ color: '#fff', fontSize: '1.1rem', fontWeight: '600', marginBottom: '8px' }}>
              {product.title}
            </div>
            <div style={{ color: '#888', fontSize: '0.9rem', marginBottom: '4px' }}>
              {product.vendor && `by ${product.vendor}`}
            </div>
            {product.variants?.[0] && (
              <div style={{ color: '#00ff9d', fontSize: '1rem', marginTop: '8px' }}>
                ${parseFloat(product.variants[0].price).toFixed(2)}
              </div>
            )}
          </div>
        </div>

        {/* Search Section */}
        <div style={{ marginBottom: '30px' }}>
          <label style={{ display: 'block', color: '#888', marginBottom: '8px', fontSize: '0.9rem' }}>
            Search for Yu-Gi-Oh! Card
          </label>
          <div style={{ display: 'flex', gap: '10px' }}>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              placeholder="Enter card name..."
              style={{
                flex: 1,
                padding: '12px',
                background: '#0a0a1f',
                border: '1px solid #2d2d44',
                borderRadius: '8px',
                color: '#fff',
                fontSize: '1rem'
              }}
            />
            <button
              onClick={() => handleSearch()}
              disabled={searching}
              style={{
                padding: '12px 24px',
                background: searching ? '#555' : 'linear-gradient(135deg, #00ff9d, #2a9d8f)',
                border: 'none',
                borderRadius: '8px',
                color: '#0a0a1f',
                cursor: searching ? 'not-allowed' : 'pointer',
                fontWeight: '600',
                fontSize: '1rem',
                whiteSpace: 'nowrap'
              }}
            >
              {searching ? 'Searching...' : 'Search'}
            </button>
          </div>
        </div>

        {/* Search Results */}
        {searchResults.length > 0 && (
          <div style={{ marginBottom: '30px' }}>
            <label style={{ display: 'block', color: '#888', marginBottom: '12px', fontSize: '0.9rem' }}>
              Select Matching Card ({searchResults.length} results)
            </label>
            <div style={{
              maxHeight: '400px',
              overflowY: 'auto',
              border: '1px solid #2d2d44',
              borderRadius: '8px'
            }}>
              {searchResults.map((card) => (
                <div
                  key={card.id}
                  onClick={() => setSelectedCard(card)}
                  style={{
                    padding: '16px',
                    borderBottom: '1px solid #2d2d44',
                    cursor: 'pointer',
                    background: selectedCard?.id === card.id ? '#00ff9d22' : 'transparent',
                    display: 'flex',
                    gap: '16px',
                    alignItems: 'center',
                    transition: 'all 0.2s'
                  }}
                  onMouseEnter={(e) => {
                    if (selectedCard?.id !== card.id) {
                      e.currentTarget.style.background = '#0a0a1f'
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (selectedCard?.id !== card.id) {
                      e.currentTarget.style.background = 'transparent'
                    }
                  }}
                >
                  {card.card_images?.[0] && (
                    <img
                      src={card.card_images[0].image_url_small}
                      alt={card.name}
                      style={{
                        width: '60px',
                        height: '87px',
                        objectFit: 'cover',
                        borderRadius: '4px',
                        border: '1px solid #2d2d44'
                      }}
                    />
                  )}
                  <div style={{ flex: 1 }}>
                    <div style={{ color: '#fff', fontSize: '1rem', fontWeight: '600', marginBottom: '4px' }}>
                      {card.name}
                    </div>
                    <div style={{ color: '#888', fontSize: '0.85rem' }}>
                      {card.type} • {card.race}
                    </div>
                    {card.atk !== undefined && (
                      <div style={{ color: '#00ff9d', fontSize: '0.85rem', marginTop: '4px' }}>
                        ATK {card.atk} / DEF {card.def}
                      </div>
                    )}
                  </div>
                  {selectedCard?.id === card.id && (
                    <div style={{
                      color: '#00ff9d',
                      fontSize: '1.5rem',
                      fontWeight: 'bold'
                    }}>
                      ✓
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {searchResults.length === 0 && searchQuery && !searching && (
          <div style={{
            padding: '40px',
            textAlign: 'center',
            color: '#888',
            fontSize: '0.95rem'
          }}>
            No cards found. Try a different search term.
          </div>
        )}

        {/* Action Buttons */}
        <div style={{
          display: 'flex',
          gap: '12px',
          justifyContent: 'flex-end',
          paddingTop: '20px',
          borderTop: '1px solid #2d2d44'
        }}>
          {product.matched_card_name && (
            <button
              onClick={handleUnmatch}
              disabled={saving}
              style={{
                padding: '12px 24px',
                background: 'transparent',
                border: '1px solid #ff4444',
                borderRadius: '8px',
                color: '#ff4444',
                cursor: saving ? 'not-allowed' : 'pointer',
                fontWeight: '600',
                fontSize: '1rem'
              }}
            >
              {saving ? 'Unmatching...' : 'Unmatch'}
            </button>
          )}
          
          <button
            onClick={onClose}
            style={{
              padding: '12px 24px',
              background: 'transparent',
              border: '1px solid #2d2d44',
              borderRadius: '8px',
              color: '#888',
              cursor: 'pointer',
              fontWeight: '600',
              fontSize: '1rem'
            }}
          >
            Cancel
          </button>
          
          <button
            onClick={handleSave}
            disabled={!selectedCard || saving}
            style={{
              padding: '12px 24px',
              background: (!selectedCard || saving) ? '#555' : 'linear-gradient(135deg, #00ff9d, #2a9d8f)',
              border: 'none',
              borderRadius: '8px',
              color: '#0a0a1f',
              cursor: (!selectedCard || saving) ? 'not-allowed' : 'pointer',
              fontWeight: '600',
              fontSize: '1rem',
              opacity: (!selectedCard || saving) ? 0.6 : 1
            }}
          >
            {saving ? 'Saving...' : 'Save Match'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default MatchModal