import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'
import { useNavigate } from 'react-router-dom'
import MatchModal from '../components/MatchModal'  // ← Added this (real component now)


function Products() {
  const [user, setUser] = useState(null)
  const [products, setProducts] = useState([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [filterStatus, setFilterStatus] = useState('all') // all, matched, unmatched
  const [selectedProduct, setSelectedProduct] = useState(null)
  const [matchModalOpen, setMatchModalOpen] = useState(false)
  const navigate = useNavigate()

  useEffect(() => {
    checkUser()
  }, [])

  async function checkUser() {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) {
      navigate('/login')
      return
    }
    setUser(session.user)
    fetchProducts(session.user.id)
  }

  async function fetchProducts(userId) {
  setLoading(true)
  
  // First get the connected store
  const { data: store } = await supabase
    .from('connected_stores')
    .select('id')
    .eq('user_id', userId)
    .single()

  if (!store) {
    setProducts([])
    setLoading(false)
    return
  }

  // Then get products using store_id
  const { data, error } = await supabase
    .from('products')
    .select('*')
    .eq('store_id', store.id)  // ← Use store.id, not userId
    .order('title', { ascending: true })

  if (error) {
    console.error('Error fetching products:', error)
  } else {
    setProducts(data || [])
  }
  setLoading(false)
}

  function openMatchModal(product) {
    setSelectedProduct(product)
    setMatchModalOpen(true)
  }

  // Filter products
  const filteredProducts = products.filter(product => {
    const matchesSearch = product.title.toLowerCase().includes(searchQuery.toLowerCase())
    
    if (filterStatus === 'matched') {
      return matchesSearch && product.matched_card_name
    } else if (filterStatus === 'unmatched') {
      return matchesSearch && !product.matched_card_name
    }
    return matchesSearch
  })

  const matchedCount = products.filter(p => p.matched_card_name).length
  const unmatchedCount = products.length - matchedCount

  if (loading) {
    return (
      <div style={{
        minHeight: '100vh',
        background: 'linear-gradient(135deg, #0a0a1f 0%, #1a1a2e 100%)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: '#fff'
      }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '3rem', marginBottom: '20px' }}>Card</div>
          <p>Loading products...</p>
        </div>
      </div>
    )
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #0a0a1f 0%, #1a1a2e 100%)',
      padding: '40px 20px'
    }}>
      <div style={{ maxWidth: '1400px', margin: '0 auto' }}>
        
        {/* Header */}
        <div style={{ marginBottom: '40px' }}>
          <button
            onClick={() => navigate('/dashboard')}
            style={{
              background: 'transparent',
              border: '1px solid #2d2d44',
              color: '#00ff9d',
              padding: '8px 16px',
              borderRadius: '8px',
              cursor: 'pointer',
              marginBottom: '20px',
              fontSize: '0.9rem'
            }}
          >
            ← Back to Dashboard
          </button>
          
          <h1 style={{ fontSize: '2.5rem', fontWeight: 'bold', color: '#fff', marginBottom: '10px' }}>
            Product Matching
          </h1>
          <p style={{ color: '#888', fontSize: '1.1rem' }}>
            Link your Shopify products to Yu-Gi-Oh! cards for deck building
          </p>
        </div>

        {/* Stats */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: '20px',
          marginBottom: '30px'
        }}>
          <div style={{
            background: '#1a1a2e',
            border: '1px solid #2d2d44',
            borderRadius: '12px',
            padding: '20px'
          }}>
            <div style={{ fontSize: '2rem', fontWeight: 'bold', color: '#00ff9d' }}>
              {products.length}
            </div>
            <div style={{ color: '#888', fontSize: '0.9rem' }}>Total Products</div>
          </div>
          
          <div style={{
            background: '#1a1a2e',
            border: '1px solid #2d2d44',
            borderRadius: '12px',
            padding: '20px'
          }}>
            <div style={{ fontSize: '2rem', fontWeight: 'bold', color: '#00ff9d' }}>
              {matchedCount}
            </div>
            <div style={{ color: '#888', fontSize: '0.9rem' }}>Matched</div>
          </div>
          
          <div style={{
            background: '#1a1a2e',
            border: '1px solid #2d2d44',
            borderRadius: '12px',
            padding: '20px'
          }}>
            <div style={{ fontSize: '2rem', fontWeight: 'bold', color: '#ffd700' }}>
              {unmatchedCount}
            </div>
            <div style={{ color: '#888', fontSize: '0.9rem' }}>Needs Matching</div>
          </div>
        </div>

        {/* Filters */}
        <div style={{
          background: '#1a1a2e',
          border: '1px solid #2d2d44',
          borderRadius: '12px',
          padding: '20px',
          marginBottom: '30px'
        }}>
          <div style={{
            display: 'flex',
            gap: '20px',
            flexWrap: 'wrap',
            alignItems: 'center'
          }}>
            {/* Search */}
            <input
              type="text"
              placeholder="Search products..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                flex: '1',
                minWidth: '250px',
                padding: '12px',
                background: '#0a0a1f',
                border: '1px solid #2d2d44',
                borderRadius: '8px',
                color: '#fff',
                fontSize: '1rem'
              }}
            />

            {/* Filter Buttons */}
            <div style={{ display: 'flex', gap: '10px' }}>
              <button
                onClick={() => setFilterStatus('all')}
                style={{
                  padding: '10px 20px',
                  borderRadius: '8px',
                  border: filterStatus === 'all' ? '2px solid #00ff9d' : '1px solid #2d2d44',
                  background: filterStatus === 'all' ? '#00ff9d22' : '#0a0a1f',
                  color: filterStatus === 'all' ? '#00ff9d' : '#888',
                  cursor: 'pointer',
                  fontSize: '0.9rem',
                  fontWeight: filterStatus === 'all' ? 'bold' : 'normal'
                }}
              >
                All ({products.length})
              </button>
              
              <button
                onClick={() => setFilterStatus('matched')}
                style={{
                  padding: '10px 20px',
                  borderRadius: '8px',
                  border: filterStatus === 'matched' ? '2px solid #00ff9d' : '1px solid #2d2d44',
                  background: filterStatus === 'matched' ? '#00ff9d22' : '#0a0a1f',
                  color: filterStatus === 'matched' ? '#00ff9d' : '#888',
                  cursor: 'pointer',
                  fontSize: '0.9rem',
                  fontWeight: filterStatus === 'matched' ? 'bold' : 'normal'
                }}
              >
                Matched ({matchedCount})
              </button>
              
              <button
                onClick={() => setFilterStatus('unmatched')}
                style={{
                  padding: '10px 20px',
                  borderRadius: '8px',
                  border: filterStatus === 'unmatched' ? '2px solid #ffd700' : '1px solid #2d2d44',
                  background: filterStatus === 'unmatched' ? '#ffd70022' : '#0a0a1f',
                  color: filterStatus === 'unmatched' ? '#ffd700' : '#888',
                  cursor: 'pointer',
                  fontSize: '0.9rem',
                  fontWeight: filterStatus === 'unmatched' ? 'bold' : 'normal'
                }}
              >
                Unmatched ({unmatchedCount})
              </button>
            </div>
          </div>
        </div>

        {/* Products Table */}
        <div style={{
          background: '#1a1a2e',
          border: '1px solid #2d2d44',
          borderRadius: '12px',
          overflow: 'hidden'
        }}>
          {filteredProducts.length === 0 ? (
            <div style={{
              padding: '60px',
              textAlign: 'center',
              color: '#888'
            }}>
              <div style={{ fontSize: '3rem', marginBottom: '20px' }}>Search</div>
              <p>No products found</p>
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{
                  background: '#0a0a1f',
                  borderBottom: '1px solid #2d2d44'
                }}>
                  <th style={{ padding: '16px', textAlign: 'left', color: '#888', fontSize: '0.85rem', fontWeight: '600' }}>
                    PRODUCT
                  </th>
                  <th style={{ padding: '16px', textAlign: 'left', color: '#888', fontSize: '0.85rem', fontWeight: '600' }}>
                    MATCHED CARD
                  </th>
                  <th style={{ padding: '16px', textAlign: 'left', color: '#888', fontSize: '0.85rem', fontWeight: '600' }}>
                    SET / RARITY
                  </th>
                  <th style={{ padding: '16px', textAlign: 'center', color: '#888', fontSize: '0.85rem', fontWeight: '600' }}>
                    STATUS
                  </th>
                  <th style={{ padding: '16px', textAlign: 'right', color: '#888', fontSize: '0.85rem', fontWeight: '600' }}>
                    ACTION
                  </th>
                </tr>
              </thead>
              <tbody>
                {filteredProducts.map(product => {
                  const prices = product.variants?.map(v => parseFloat(v.price)) || []
                  const price = prices.length > 0 ? Math.min(...prices) : null

                  return (
                    <tr
                      key={product.id}
                      style={{
                        borderBottom: '1px solid #2d2d44',
                        transition: 'background 0.2s'
                      }}
                      onMouseEnter={(e) => e.currentTarget.style.background = '#0a0a1f'}
                      onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                    >
                      {/* Product Info */}
                      <td style={{ padding: '16px' }}>
                        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                          {product.images && product.images[0] ? (
                            <img
                              src={product.images[0].src}
                              alt={product.title}
                              style={{
                                width: '50px',
                                height: '50px',
                                objectFit: 'cover',
                                borderRadius: '8px',
                                border: '1px solid #2d2d44'
                              }}
                            />
                          ) : (
                            <div style={{
                              width: '50px',
                              height: '50px',
                              background: '#0a0a1f',
                              borderRadius: '8px',
                              border: '1px solid #2d2d44',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              fontSize: '1.5rem'
                            }}>
                              Card
                            </div>
                          )}
                          <div>
                            <div style={{ color: '#fff', fontWeight: '500', marginBottom: '4px' }}>
                              {product.title}
                            </div>
                            {price && (
                              <div style={{ color: '#00ff9d', fontSize: '0.9rem' }}>
                                ${price.toFixed(2)}
                              </div>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* Matched Card */}
                      <td style={{ padding: '16px' }}>
                        {product.matched_card_name ? (
                          <div style={{ color: '#fff' }}>
                            {product.matched_card_name}
                          </div>
                        ) : (
                          <div style={{ color: '#555', fontStyle: 'italic' }}>
                            Not matched
                          </div>
                        )}
                      </td>

                      {/* Set / Rarity */}
                      <td style={{ padding: '16px' }}>
                        {product.set_code || product.rarity ? (
                          <div>
                            {product.set_code && (
                              <div style={{ color: '#888', fontSize: '0.9rem' }}>
                                {product.set_code}
                              </div>
                            )}
                            {product.rarity && (
                              <div style={{ color: '#888', fontSize: '0.85rem' }}>
                                {product.rarity}
                              </div>
                            )}
                          </div>
                        ) : (
                          <div style={{ color: '#555' }}>—</div>
                        )}
                      </td>

                      {/* Status Badge */}
                      <td style={{ padding: '16px', textAlign: 'center' }}>
                        {product.matched_card_name ? (
                          <span style={{
                            display: 'inline-block',
                            padding: '4px 12px',
                            borderRadius: '6px',
                            fontSize: '0.85rem',
                            background: '#00ff9d22',
                            border: '1px solid #00ff9d',
                            color: '#00ff9d'
                          }}>
                            Matched
                          </span>
                        ) : (
                          <span style={{
                            display: 'inline-block',
                            padding: '4px 12px',
                            borderRadius: '6px',
                            fontSize: '0.85rem',
                            background: '#ffd70022',
                            border: '1px solid #ffd700',
                            color: '#ffd700'
                          }}>
                            Unmatched
                          </span>
                        )}
                      </td>

                      {/* Action Button */}
                      <td style={{ padding: '16px', textAlign: 'right' }}>
                        <button
                          onClick={() => openMatchModal(product)}
                          style={{
                            padding: '8px 16px',
                            borderRadius: '8px',
                            border: '1px solid #2d2d44',
                            background: '#0a0a1f',
                            color: '#00ff9d',
                            cursor: 'pointer',
                            fontSize: '0.9rem',
                            transition: 'all 0.2s'
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.background = '#00ff9d'
                            e.currentTarget.style.color = '#0a0a1f'
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.background = '#0a0a1f'
                            e.currentTarget.style.color = '#00ff9d'
                          }}
                        >
                          {product.matched_card_name ? 'Edit Match' : 'Match Card'}
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>

      </div>

      {/* Real MatchModal imported from components folder */}
      {matchModalOpen && selectedProduct && (
        <MatchModal
          product={selectedProduct}
          onClose={() => {
            setMatchModalOpen(false)
            setSelectedProduct(null)
          }}
          onSave={() => {
            fetchProducts(user.id)
            setMatchModalOpen(false)
            setSelectedProduct(null)
          }}
        />
      )}
    </div>
  )
}

export default Products