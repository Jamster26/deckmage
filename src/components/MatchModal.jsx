import { useState, useEffect } from 'react'
import { supabase } from '../supabaseClient'

// Normalize card name helper
function normalizeCardName(name) {
  if (!name) return '';
  return name
    .toLowerCase()
    .replace(/[''"]/g, '')
    .replace(/[-–—∙•·]/g, ' ')
    .replace(/[^\w\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// Extract clean card name from product title
function extractCardName(title) {
  if (!title) return '';
  
  // Remove common suffixes
  return title
    .replace(/\([^)]*\)/g, '') // Remove parentheses
    .replace(/\[[^\]]*\]/g, '') // Remove brackets
    .replace(/\s*-\s*\w+\d+\s*$/i, '') // Remove set codes
    .replace(/\s*(Near Mint|LP|MP|HP|Damaged|1st Edition|Unlimited|Limited)\s*/gi, '') // Remove conditions
    .trim();
}

// Search Yu-Gi-Oh cards in local database
async function searchYGOCards(query) {
  if (!query || query.trim().length < 3) return [];
  
  try {
    // Step 1: Try exact match first (fastest)
    const { data: exactMatch } = await supabase
      .from('yugioh_cards')
      .select('*')
      .eq('name', query)
      .limit(5)
    
    if (exactMatch && exactMatch.length > 0) {
      return exactMatch;
    }
    
    // Step 2: Try case-insensitive search
    const { data: fuzzyMatch } = await supabase
      .from('yugioh_cards')
      .select('*')
      .ilike('name', `%${query}%`)
      .limit(20)
    
    if (fuzzyMatch && fuzzyMatch.length > 0) {
      return fuzzyMatch;
    }
    
    // Step 3: Try normalized search
    const normalized = normalizeCardName(query)
    const { data: normalizedMatch } = await supabase
      .from('yugioh_cards')
      .select('*')
      .ilike('name', `%${normalized}%`)
      .limit(20)
    
    return normalizedMatch || [];
    
  } catch (error) {
    console.error('Search error:', error)
    return [];
  }
}

function MatchModal({ product, onClose, onSave }) {
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState([])
  const [selectedCard, setSelectedCard] = useState(null)
  const [searching, setSearching] = useState(false)
  const [saving, setSaving] = useState(false)

  // Initialize with suggested card name
  useEffect(() => {
    setSelectedCard(null)
    setSearchResults([])
    
    const suggested = extractCardName(product.title)
    if (suggested) {
      setSearchQuery(suggested)
      handleSearch(suggested)
    } else {
      setSearchQuery('')
    }
  }, [product.id])

  // Live search as user types (debounced)
  useEffect(() => {
    if (searchQuery.trim().length < 3) {
      setSearchResults([])
      setSearching(false)
      return
    }

    setSearching(true)
    const timer = setTimeout(() => {
      handleSearch(searchQuery)
    }, 350)

    return () => clearTimeout(timer)
  }, [searchQuery])

  // ESC key to close
  useEffect(() => {
    function handleEscKey(event) {
      if (event.key === 'Escape') {
        onClose()
      }
    }

    document.addEventListener('keydown', handleEscKey)
    return () => document.removeEventListener('keydown', handleEscKey)
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
      
      const { data: updateData, error } = await supabase
        .from('products')
        .update({
          matched_card_name: selectedCard.name,
          matched_card_id: selectedCard.id.toString(),
          normalized_card_name: normalizeCardName(selectedCard.name)
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
      
      setSaving(false)
      onSave() // Trigger parent refresh
      
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
        matched_card_id: null,
        normalized_card_name: null
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
              Link this product to a Yu-Gi-Oh! card for deck building
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
            {product.matched_card_name && (
              <div style={{ color: '#00ff9d', fontSize: '0.9rem', marginBottom: '4px' }}>
                Currently matched to: {product.matched_card_name}
              </div>
            )}
            {product.price && (
              <div style={{ color: '#00ff9d', fontSize: '1rem', marginTop: '8px' }}>
                ${parseFloat(product.price).toFixed(2)}
              </div>
            )}
          </div>
        </div>

        {/* Search Section */}
        <div style={{ marginBottom: '30px' }}>
          <label style={{ display: 'block', color: '#888', marginBottom: '8px', fontSize: '0.9rem' }}>
            Search for Yu-Gi-Oh! Card (type at least 3 characters)
          </label>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            placeholder="e.g. Dark Magician, Blue-Eyes, Exodia..."
            autoFocus
            style={{
              width: '100%',
              padding: '12px',
              background: '#0a0a1f',
              border: '1px solid #2d2d44',
              borderRadius: '8px',
              color: '#fff',
              fontSize: '1rem'
            }}
          />
          {searching && (
            <div style={{ color: '#888', fontSize: '0.9rem', marginTop: '8px' }}>
              🔍 Searching...
            </div>
          )}
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
                  {card.image_url_small && (
                    <img
                      src={card.image_url_small}
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
                      {card.type} {card.race && `• ${card.race}`}
                    </div>
                    {card.atk !== undefined && card.atk !== null && (
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

        {searchResults.length === 0 && searchQuery.length >= 3 && !searching && (
          <div style={{
            padding: '40px',
            textAlign: 'center',
            color: '#888',
            fontSize: '0.95rem'
          }}>
            No cards found for "{searchQuery}". Try a different search term.
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