import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { supabase } from '../supabaseClient'

function ShopifyCallback() {
  const [searchParams] = useSearchParams()
  const [status, setStatus] = useState('Processing...')
  const navigate = useNavigate()

  useEffect(() => {
  const handleCallback = async () => {
    try {
      const code = searchParams.get('code')
      const shop = searchParams.get('shop')
      const state = searchParams.get('state')

      // Verify state matches
      const savedState = sessionStorage.getItem('shopify_oauth_state')
      if (state !== savedState) {
        throw new Error('Invalid state parameter')
      }

      setStatus('Exchanging authorization code...')

      // Call our Netlify function
      const response = await fetch('/.netlify/functions/shopify-oauth', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          code: code,
          shop: shop,
        }),
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Failed to get access token')
      }

      const data = await response.json()
      const accessToken = data.access_token

      setStatus('Saving store connection...')

      // Get current user
      const { data: { user } } = await supabase.auth.getUser()

      if (!user) {
        throw new Error('Not authenticated')
      }

      // Save store connection to Supabase
      const { data: storeData, error } = await supabase
        .from('connected_stores')
        .upsert({
          user_id: user.id,
          shop_domain: shop,
          access_token: accessToken,
          scopes: import.meta.env.VITE_SHOPIFY_SCOPES,
          updated_at: new Date().toISOString(),
        }, {
          onConflict: 'shop_domain',
          returning: 'representation'  // Get the inserted/updated row
        })
        .select()
        .single()

      if (error) throw error

      // 🆕 NEW: AUTO-SYNC PRODUCTS IMMEDIATELY
      setStatus('Syncing your products...')
      
      try {
        console.log('🔄 Starting auto-sync...')
        
        const syncResponse = await fetch('/.netlify/functions/sync-shopify-products', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            storeId: storeData.id,
            accessToken: accessToken,
            shopDomain: shop,
          }),
        })

        if (!syncResponse.ok) {
          console.error('Sync failed (non-critical):', await syncResponse.text())
          // Don't throw - allow user to manually sync later
        } else {
          const syncData = await syncResponse.json()
          console.log('✅ Auto-sync complete:', syncData)
          setStatus(`Success! Synced ${syncData.productsCount} products.`)
        }
        
      } catch (syncError) {
        console.error('⚠️ Auto-sync failed (non-critical):', syncError)
        // Don't block the OAuth flow if sync fails
        setStatus('Connected! Click "Sync Products" to import your inventory.')
      }

      // Clean up
      sessionStorage.removeItem('shopify_oauth_state')

      // Redirect to dashboard with success flag
      setTimeout(() => {
        navigate('/dashboard?connected=true&synced=true')
      }, 2000)

    } catch (error) {
      console.error('OAuth error:', error)
      setStatus(`Error: ${error.message}`)
      setTimeout(() => {
        navigate('/dashboard')
      }, 3000)
    }
  }

  handleCallback()
}, [searchParams, navigate])

  return (
    <div style={{ 
      minHeight: '100vh', 
      display: 'flex', 
      alignItems: 'center', 
      justifyContent: 'center',
      flexDirection: 'column',
      gap: '20px',
      background: '#0a0a1f',
      color: '#fff'
    }}>
      <div style={{ fontSize: '3rem' }}>🔄</div>
      <h2 style={{ fontSize: '1.5rem', fontWeight: 'bold' }}>{status}</h2>
    </div>
  )
}

export default ShopifyCallback