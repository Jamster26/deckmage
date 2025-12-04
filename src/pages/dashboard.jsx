import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'
import { useNavigate } from 'react-router-dom'
import { initiateShopifyOAuth } from '../utils/shopify'

function Dashboard() {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const [shopDomain, setShopDomain] = useState('')
  const [showShopInput, setShowShopInput] = useState(false)
  const [connectedStore, setConnectedStore] = useState(null)
  const [products, setProducts] = useState([])  // ✅ Add this
  const navigate = useNavigate()
  const [syncing, setSyncing] = useState(false)
const [productCount, setProductCount] = useState(0)
  

  useEffect(() => {
    // Check if user is logged in
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        setUser(session.user)
        loadConnectedStore(session.user.id)
      } else {
        navigate('/login')
      }
      setLoading(false)
    })
  }, [navigate])

  const loadConnectedStore = async (userId) => {
  const { data, error } = await supabase
    .from('connected_stores')
    .select('*')
    .eq('user_id', userId)
    .single()

  if (data && !error) {
    setConnectedStore(data)
loadProducts(data.id)
  }
}

  const loadProducts = async (storeId) => {
  // Get count
  const { count } = await supabase
    .from('products')
    .select('*', { count: 'exact', head: true })
    .eq('store_id', storeId)

  setProductCount(count || 0)

  // Get actual products
  const { data, error } = await supabase
    .from('products')
    .select('*')
    .eq('store_id', storeId)
    .order('created_at', { ascending: false })

  if (data && !error) {
    setProducts(data)
  }
}

  const handleLogout = async () => {
    await supabase.auth.signOut()
    navigate('/login')
  }

  const handleConnectShopify = () => {
    if (!shopDomain) {
      alert('Please enter your shop domain')
      return
    }
    
    let cleanDomain = shopDomain.toLowerCase().trim()
    cleanDomain = cleanDomain.replace('https://', '').replace('http://', '')
    
    if (!cleanDomain.includes('.myshopify.com')) {
      cleanDomain = `${cleanDomain}.myshopify.com`
    }
    
    initiateShopifyOAuth(cleanDomain)
  }

  const handleDisconnect = async () => {
    if (!confirm('Are you sure you want to disconnect your Shopify store?')) {
      return
    }

    const { error } = await supabase
      .from('connected_stores')
      .delete()
      .eq('id', connectedStore.id)

    if (!error) {
      setConnectedStore(null)
      alert('Store disconnected successfully')
    }
  }

  const handleSyncProducts = async () => {
  setSyncing(true)
  
  try {
    const response = await fetch('/.netlify/functions/sync-shopify-products', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        storeId: connectedStore.id,
        accessToken: connectedStore.access_token,
        shopDomain: connectedStore.shop_domain,
      }),
    })

    if (!response.ok) {
      const errorData = await response.json()
      throw new Error(errorData.error || 'Failed to sync products')
    }

    const data = await response.json()
    
    alert(`✅ Successfully synced ${data.productsCount} products!`)
    
    // Reload product count
    loadProducts(connectedStore.id)
    
  } catch (error) {
    console.error('Sync error:', error)
    alert(`❌ Error syncing products: ${error.message}`)
  } finally {
    setSyncing(false)
  }
}

  if (loading) {
    return (
      <div style={{ 
        minHeight: '100vh', 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'center',
        background: '#0a0a1f',
        color: '#fff'
      }}>
        Loading...
      </div>
    )
  }

  return (
    <div style={{ 
      minHeight: '100vh',
      background: '#0a0a1f',
      color: '#fff'
    }}>
      {/* Header */}
      <nav style={{
        background: '#1a1a2e',
        borderBottom: '2px solid #00ff9d',
        padding: '20px 40px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center'
      }}>
        <div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#00ff9d' }}>
            🃏 DeckMage
          </h1>
        </div>
        <div style={{ display: 'flex', gap: '20px', alignItems: 'center' }}>
          <span style={{ color: '#888', fontSize: '14px' }}>{user?.email}</span>
          <button
            onClick={handleLogout}
            style={{
              padding: '8px 16px',
              background: 'transparent',
              border: '1px solid #2d2d44',
              borderRadius: '8px',
              color: '#fff',
              cursor: 'pointer',
              fontSize: '14px'
            }}
          >
            Logout
          </button>
        </div>
      </nav>

      {/* Main Content */}
      <div style={{ padding: '40px', maxWidth: '1200px', margin: '0 auto' }}>
        <h2 style={{ fontSize: '2rem', fontWeight: 'bold', marginBottom: '10px' }}>
          Welcome to DeckMage! 🎉
        </h2>
        <p style={{ color: '#888', marginBottom: '40px' }}>
          Your professional deck builder dashboard
        </p>

        {/* Connected Store Banner */}
        {connectedStore && (
          <div style={{
            background: 'linear-gradient(135deg, #00ff9d22, #2a9d8f22)',
            border: '2px solid #00ff9d',
            borderRadius: '16px',
            padding: '24px',
            marginBottom: '40px'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h3 style={{ fontSize: '1.2rem', fontWeight: 'bold', color: '#00ff9d', marginBottom: '8px' }}>
                  ✅ Store Connected
                </h3>
                <p style={{ color: '#fff', fontSize: '1rem' }}>
                  {connectedStore.shop_domain}
                </p>
                <p style={{ color: '#888', fontSize: '0.85rem', marginTop: '4px' }}>
                  Connected on {new Date(connectedStore.created_at).toLocaleDateString()}
                </p>
              </div>
              <button
                onClick={handleDisconnect}
                style={{
                  padding: '10px 20px',
                  background: 'transparent',
                  border: '1px solid #e63946',
                  borderRadius: '8px',
                  color: '#e63946',
                  cursor: 'pointer',
                  fontSize: '14px'
                }}
              >
                Disconnect
              </button>
            </div>
          </div>
        )}

        {/* Stats Grid */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
          gap: '20px',
          marginBottom: '40px'
        }}>
          <div style={{
            background: '#1a1a2e',
            border: '1px solid #2d2d44',
            borderRadius: '16px',
            padding: '24px'
          }}>
            <div style={{ fontSize: '2.5rem', marginBottom: '8px' }}>📊</div>
            <h3 style={{ fontSize: '1.2rem', fontWeight: 'bold', marginBottom: '4px' }}>
  {productCount}
</h3>
            <p style={{ color: '#888', fontSize: '14px' }}>Total Products</p>
          </div>

          <div style={{
            background: '#1a1a2e',
            border: '1px solid #2d2d44',
            borderRadius: '16px',
            padding: '24px'
          }}>
            <div style={{ fontSize: '2.5rem', marginBottom: '8px' }}>🛒</div>
            <h3 style={{ fontSize: '1.2rem', fontWeight: 'bold', marginBottom: '4px' }}>
              0
            </h3>
            <p style={{ color: '#888', fontSize: '14px' }}>Deck Builds</p>
          </div>

          <div style={{
            background: '#1a1a2e',
            border: '1px solid #2d2d44',
            borderRadius: '16px',
            padding: '24px'
          }}>
            <div style={{ fontSize: '2.5rem', marginBottom: '8px' }}>💰</div>
            <h3 style={{ fontSize: '1.2rem', fontWeight: 'bold', marginBottom: '4px' }}>
              $0.00
            </h3>
            <p style={{ color: '#888', fontSize: '14px' }}>Revenue</p>
          </div>
        </div>

        {/* Quick Actions */}
        <div style={{
          background: '#1a1a2e',
          border: '1px solid #2d2d44',
          borderRadius: '16px',
          padding: '32px'
        }}>
          <h3 style={{ fontSize: '1.5rem', fontWeight: 'bold', marginBottom: '20px' }}>
            Quick Actions
          </h3>
          
          {!connectedStore && !showShopInput && (
            <button 
              onClick={() => setShowShopInput(true)}
              style={{
                padding: '12px 24px',
                background: 'linear-gradient(135deg, #00ff9d, #2a9d8f)',
                border: 'none',
                borderRadius: '8px',
                color: '#0a0a1f',
                fontWeight: 'bold',
                cursor: 'pointer'
              }}
            >
              Connect Shopify Store
            </button>
          )}

          {!connectedStore && showShopInput && (
            <div>
              <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px' }}>
                Enter your Shopify store domain:
              </label>
              <input
                type="text"
                value={shopDomain}
                onChange={(e) => setShopDomain(e.target.value)}
                placeholder="your-store.myshopify.com"
                style={{
                  width: '100%',
                  padding: '12px',
                  background: '#0a0a1f',
                  border: '1px solid #2d2d44',
                  borderRadius: '8px',
                  color: '#fff',
                  fontSize: '14px',
                  marginBottom: '12px'
                }}
              />
              <div style={{ display: 'flex', gap: '12px' }}>
                <button
                  onClick={handleConnectShopify}
                  style={{
                    padding: '12px 24px',
                    background: 'linear-gradient(135deg, #00ff9d, #2a9d8f)',
                    border: 'none',
                    borderRadius: '8px',
                    color: '#0a0a1f',
                    fontWeight: 'bold',
                    cursor: 'pointer'
                  }}
                >
                  Connect
                </button>
                <button
                  onClick={() => setShowShopInput(false)}
                  style={{
                    padding: '12px 24px',
                    background: 'transparent',
                    border: '1px solid #2d2d44',
                    borderRadius: '8px',
                    color: '#fff',
                    cursor: 'pointer'
                  }}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
          
          {connectedStore && (
            <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
            <button 
  onClick={handleSyncProducts}
  disabled={syncing}
  style={{
    padding: '12px 24px',
    background: syncing ? '#555' : 'linear-gradient(135deg, #00ff9d, #2a9d8f)',
    border: 'none',
    borderRadius: '8px',
    color: '#0a0a1f',
    fontWeight: 'bold',
    cursor: syncing ? 'not-allowed' : 'pointer',
    opacity: syncing ? 0.6 : 1
  }}
>
  {syncing ? 'Syncing...' : 'Sync Products'}
</button>
              <button style={{
                padding: '12px 24px',
                background: 'transparent',
                border: '1px solid #2d2d44',
                borderRadius: '8px',
                color: '#fff',
                cursor: 'pointer'
              }}>
                View Analytics
              </button>
              <button style={{
                padding: '12px 24px',
                background: 'transparent',
                border: '1px solid #2d2d44',
                borderRadius: '8px',
                color: '#fff',
                cursor: 'pointer'
              }}>
                Get Embed Code
              </button>
            </div>
          )}
        </div>
     

    {/* 🟢 PASTE THE ENTIRE PRODUCTS LIST CODE RIGHT HERE 🟢 */}
        {connectedStore && products.length > 0 && (
          <div style={{
            background: '#1a1a2e',
            border: '1px solid #2d2d44',
            borderRadius: '16px',
            padding: '32px',
            marginTop: '40px'
          }}>
            <h3 style={{ fontSize: '1.5rem', fontWeight: 'bold', marginBottom: '20px' }}>
              Your Products ({productCount})
            </h3>
            
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
              gap: '20px'
            }}>
             {products.slice(0, 12).map(product => {
  // Calculate price range from variants
  const prices = product.variants?.map(v => parseFloat(v.price)) || []
  const minPrice = prices.length > 0 ? Math.min(...prices) : null
  const maxPrice = prices.length > 0 ? Math.max(...prices) : null
  
  const priceDisplay = minPrice && maxPrice
    ? minPrice === maxPrice
      ? `$${minPrice.toFixed(2)}`
      : `$${minPrice.toFixed(2)} - $${maxPrice.toFixed(2)}`
    : 'No price set'

  // Check stock status
  const totalInventory = product.variants?.reduce((sum, v) => 
    sum + (v.inventory_quantity || 0), 0
  ) || 0
  
  const stockStatus = totalInventory > 10 ? 'in-stock' 
    : totalInventory > 0 ? 'low-stock' 
    : 'out-of-stock'
  
  const stockColor = stockStatus === 'in-stock' ? '#00ff9d' 
    : stockStatus === 'low-stock' ? '#ffd700' 
    : '#e63946'

  return (
    <div key={product.id} style={{
      background: '#0a0a1f',
      border: '1px solid #2d2d44',
      borderRadius: '12px',
      padding: '16px',
      display: 'flex',
      flexDirection: 'column',
      gap: '12px',
      position: 'relative'
    }}>
      {/* Stock Status Dot */}
      <div style={{
        position: 'absolute',
        top: '12px',
        right: '12px',
        width: '12px',
        height: '12px',
        borderRadius: '50%',
        background: stockColor,
        boxShadow: `0 0 8px ${stockColor}`
      }} title={stockStatus.replace('-', ' ')} />

      {/* Product Image */}
      {product.images && product.images[0] ? (
        <img 
          src={product.images[0].src} 
          alt={product.title}
          style={{
            width: '100%',
            height: '200px',
            objectFit: 'cover',
            borderRadius: '8px'
          }}
        />
      ) : (
        <div style={{
          width: '100%',
          height: '200px',
          background: '#1a1a2e',
          borderRadius: '8px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#555',
          fontSize: '3rem'
        }}>
          🃏
        </div>
      )}

      {/* Product Info */}
      <div>
        <h4 style={{ 
          fontSize: '1rem', 
          fontWeight: 'bold',
          marginBottom: '4px',
          color: '#fff',
          lineHeight: '1.3'
        }}>
          {product.title}
        </h4>
        {product.vendor && (
          <p style={{ fontSize: '0.85rem', color: '#888', marginBottom: '2px' }}>
            by {product.vendor}
          </p>
        )}
        {product.product_type && (
          <p style={{ fontSize: '0.85rem', color: '#888' }}>
            {product.product_type}
          </p>
        )}
      </div>

      {/* Price */}
      <div style={{
        fontSize: '1.1rem',
        fontWeight: 'bold',
        color: '#00ff9d'
      }}>
        {priceDisplay}
      </div>

      {/* Match Status Badge */}
      <div style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '6px',
        padding: '6px 12px',
        borderRadius: '6px',
        fontSize: '0.85rem',
        background: product.matched_card_id ? '#00ff9d22' : '#88888822',
        border: `1px solid ${product.matched_card_id ? '#00ff9d' : '#555'}`,
        color: product.matched_card_id ? '#00ff9d' : '#888',
        width: 'fit-content'
      }}>
        <span>{product.matched_card_id ? '✅' : '⚠️'}</span>
        <span>{product.matched_card_id ? 'Matched' : 'Needs Matching'}</span>
      </div>

      {/* Variants Info */}
      <div style={{ 
        borderTop: '1px solid #2d2d44',
        paddingTop: '12px',
        marginTop: 'auto',
        fontSize: '0.85rem',
        color: '#888'
      }}>
        {product.variants?.length || 0} variant(s) • {totalInventory} in stock
      </div>
    </div>
  )
})}
               
            </div>

           <div style={{
  display: 'flex',
  justifyContent: 'center',
  alignItems: 'center',
  gap: '20px',
  marginTop: '20px',
  paddingTop: '20px',
  borderTop: '1px solid #2d2d44'
}}>
  <p style={{ color: '#888', fontSize: '0.9rem' }}>
    Showing {Math.min(12, products.length)} of {productCount} products
  </p>
  <button
    onClick={() => navigate('/products')}
    style={{
      padding: '10px 20px',
      background: 'transparent',
      border: '1px solid #00ff9d',
      borderRadius: '8px',
      color: '#00ff9d',
      cursor: 'pointer',
      fontSize: '0.9rem',
      fontWeight: '500',
      transition: 'all 0.2s'
    }}
    onMouseEnter={(e) => {
      e.currentTarget.style.background = '#00ff9d'
      e.currentTarget.style.color = '#0a0a1f'
    }}
    onMouseLeave={(e) => {
      e.currentTarget.style.background = 'transparent'
      e.currentTarget.style.color = '#00ff9d'
    }}
  >
    Manage All Products →
  </button>
</div>
          </div>
        )}

      </div>        // ← Main Content closes here
    </div>          // ← Outer container closes here
  )
}

export default Dashboard