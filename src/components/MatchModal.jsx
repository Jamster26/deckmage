import { useState, useEffect } from 'react'
import { supabase } from '../supabaseClient'
import { searchYGOCards, extractCardName } from '../utils/ygoprodeck'

function MatchModal({ product, onClose, onSave }) {
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState([])
  const [selectedCard, setSelectedCard] = useState(null)
  const [searching, setSearching] = useState(false)
  const [saving, setSaving] = useState(false)
  
  // Additional fields
  const [setCode, setSetCode] = useState(product.set_code || '')
  const [rarity, setRarity] = useState(product.rarity || '')
  const [condition, setCondition] = useState(product.condition || 'Near Mint')
  const [edition, setEdition] = useState(product.edition || '')

  // Auto-suggest on mount
  useEffect(() => {
    const suggestedName = extractCardName(product.title)
    if (suggestedName) {
      setSearchQuery(suggestedName)
      handleSearch(suggestedName)
    }
  }, [product.title])

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
    
    const { error } = await supabase
      .from('products')
      .update({
        matched_card_name: selectedCard.name,
        set_code: setCode,
        rarity: rarity,
        condition: condition,
        edition: edition
      })
      .eq('id', product.id)
    
    if (error) {
      console.error('Error saving match:', error)
      alert('Failed to save match')
    } else {
      onSave()
    }
    
    setSaving(false)
  }

  async function handleUnmatch() {
    setSaving(true)
    
    const { error } = await supabase
      .from('products')
      .update({
        matched_card_name: null,
        set_code: null,
        rarity: null,
        edition: null
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
              Link this product to a Yu-Gi-Oh! card from the database
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
              placeholder="e.g., Blue-Eyes White Dragon"
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
              disabled={searching || !searchQuery.trim()}
              style={{
                padding: '12px 24px',
                background: '#00ff9d',
                border: 'none',
                borderRadius: '8px',
                color: '#0a0a1f',
                cursor: searching ? 'not-allowed' : 'pointer',
                fontWeight: '600',
                opacity: searching || !searchQuery.trim() ? 0.5 : 1
              }}
            >
              {searching ? 'Searching...' : 'Search'}
            </button>
          </div>
          
          {searchQuery && (
            <div style={{ color: '#888', fontSize: '0.85rem', marginTop: '8px' }}>
              💡 Auto-detected from product title: "{extractCardName(product.title)}"
            </div>
          )}
        </div>

        {/* Search Results */}
        {searchResults.length > 0 && (
          <div style={{ marginBottom: '30px' }}>
            <div style={{ color: '#888', marginBottom: '12px', fontSize: '0.9rem' }}>
              Found {searchResults.length} card{searchResults.length !== 1 ? 's' : ''}
            </div>
            <div style={{
              display: 'grid',
              gap: '12px',
              maxHeight: '400px',
              overflowY: 'auto',
              padding: '2px'
            }}>
              {searchResults.map(card => (
                <div
                  key={card.id}
                  onClick={() => setSelectedCard(card)}
                  style={{
                    background: selectedCard?.id === card.id ? '#00ff9d22' : '#0a0a1f',
                    border: selectedCard?.id === card.id ? '2px solid #00ff9d' : '1px solid #2d2d44',
                    borderRadius: '12px',
                    padding: '16px',
                    cursor: 'pointer',
                    display: 'flex',
                    gap: '16px',
                    transition: 'all 0.2s'
                  }}
                  onMouseEnter={(e) => {
                    if (selectedCard?.id !== card.id) {
                      e.currentTarget.style.background = '#16162e'
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (selectedCard?.id !== card.id) {
                      e.currentTarget.style.background = '#0a0a1f'
                    }
                  }}
                >
                  <img
                    src={card.card_images[0].image_url_small}
                    alt={card.name}
                    style={{
                      width: '80px',
                      height: '116px',
                      objectFit: 'cover',
                      borderRadius: '6px'
                    }}
                  />
                  <div style={{ flex: 1 }}>
                    <div style={{
                      color: '#fff',
                      fontSize: '1.1rem',
                      fontWeight: '600',
                      marginBottom: '8px'
                    }}>
                      {card.name}
                    </div>
                    <div style={{ color: '#888', fontSize: '0.9rem', marginBottom: '4px' }}>
                      {card.type}
                      {card.race && ` | ${card.race}`}
                      {card.attribute && ` | ${card.attribute}`}
                    </div>
                    {card.atk !== undefined && (
                      <div style={{ color: '#888', fontSize: '0.9rem', marginBottom: '8px' }}>
                        {card.level && `Level ${card.level} | `}
                        ATK {card.atk} / DEF {card.def}
                      </div>
                    )}
                    <div style={{
                      color: '#666',
                      fontSize: '0.85rem',
                      maxHeight: '60px',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis'
                    }}>
                      {card.desc}
                    </div>
                  </div>
                  {selectedCard?.id === card.id && (
                    <div style={{
                      color: '#00ff9d',
                      fontSize: '1.5rem'
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
            textAlign: 'center',
            padding: '40px',
            color: '#888',
            background: '#0a0a1f',
            borderRadius: '12px',
            marginBottom: '30px'
          }}>
            <div style={{ fontSize: '2rem', marginBottom: '10px' }}>🔍</div>
            <div>No cards found for "{searchQuery}"</div>
            <div style={{ fontSize: '0.85rem', marginTop: '8px' }}>
              Try a different search term
            </div>
          </div>
        )}

        {/* Additional Details (when card selected) */}
        {selectedCard && (
          <div style={{
            background: '#0a0a1f',
            border: '1px solid #2d2d44',
            borderRadius: '12px',
            padding: '20px',
            marginBottom: '20px'
          }}>
            <div style={{ color: '#fff', fontSize: '1.1rem', fontWeight: '600', marginBottom: '16px' }}>
              Additional Details
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '16px' }}>
              <div>
                <label style={{ display: 'block', color: '#888', marginBottom: '6px', fontSize: '0.85rem' }}>
                  Set Code (e.g., LOB-001)
                </label>
                <input
                  type="text"
                  value={setCode}
                  onChange={(e) => setSetCode(e.target.value)}
                  placeholder="Optional"
                  style={{
                    width: '100%',
                    padding: '10px',
                    background: '#16162e',
                    border: '1px solid #2d2d44',
                    borderRadius: '6px',
                    color: '#fff',
                    fontSize: '0.95rem'
                  }}
                />
              </div>
              <div>
                <label style={{ display: 'block', color: '#888', marginBottom: '6px', fontSize: '0.85rem' }}>
                  Rarity
                </label>
                <select
                  value={rarity}
                  onChange={(e) => setRarity(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '10px',
                    background: '#16162e',
                    border: '1px solid #2d2d44',
                    borderRadius: '6px',
                    color: '#fff',
                    fontSize: '0.95rem'
                  }}
                >
                  <option value="">Select rarity</option>
                  <option value="Common">Common</option>
                  <option value="Rare">Rare</option>
                  <option value="Super Rare">Super Rare</option>
                  <option value="Ultra Rare">Ultra Rare</option>
                  <option value="Secret Rare">Secret Rare</option>
                  <option value="Ultimate Rare">Ultimate Rare</option>
                  <option value="Ghost Rare">Ghost Rare</option>
                  <option value="Starlight Rare">Starlight Rare</option>
                </select>
              </div>
              <div>
                <label style={{ display: 'block', color: '#888', marginBottom: '6px', fontSize: '0.85rem' }}>
                  Condition
                </label>
                <select
                  value={condition}
                  onChange={(e) => setCondition(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '10px',
                    background: '#16162e',
                    border: '1px solid #2d2d44',
                    borderRadius: '6px',
                    color: '#fff',
                    fontSize: '0.95rem'
                  }}
                >
                  <option value="Near Mint">Near Mint</option>
                  <option value="Lightly Played">Lightly Played</option>
                  <option value="Moderately Played">Moderately Played</option>
                  <option value="Heavily Played">Heavily Played</option>
                  <option value="Damaged">Damaged</option>
                </select>
              </div>
              <div>
                <label style={{ display: 'block', color: '#888', marginBottom: '6px', fontSize: '0.85rem' }}>
                  Edition
                </label>
                <select
                  value={edition}
                  onChange={(e) => setEdition(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '10px',
                    background: '#16162e',
                    border: '1px solid #2d2d44',
                    borderRadius: '6px',
                    color: '#fff',
                    fontSize: '0.95rem'
                  }}
                >
                  <option value="">Select edition</option>
                  <option value="1st Edition">1st Edition</option>
                  <option value="Unlimited">Unlimited</option>
                  <option value="Limited">Limited</option>
                </select>
              </div>
            </div>
          </div>
        )}

        {/* Actions */}
        <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
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
                opacity: saving ? 0.5 : 1
              }}
            >
              Unmatch
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
              fontWeight: '600'
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={!selectedCard || saving}
            style={{
              padding: '12px 24px',
              background: selectedCard && !saving ? '#00ff9d' : '#2d2d44',
              border: 'none',
              borderRadius: '8px',
              color: selectedCard && !saving ? '#0a0a1f' : '#666',
              cursor: selectedCard && !saving ? 'pointer' : 'not-allowed',
              fontWeight: '600'
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