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
        const hmac = searchParams.get('hmac')

        // Verify state matches
        const savedState = sessionStorage.getItem('shopify_oauth_state')
        if (state !== savedState) {
          throw new Error('Invalid state parameter')
        }

        setStatus('Exchanging authorization code...')

        // Exchange code for the access token
        const response = await fetch(`https://${shop}/admin/oauth/access_token`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            client_id: import.meta.env.VITE_SHOPIFY_CLIENT_ID,
            client_secret: import.meta.env.VITE_SHOPIFY_CLIENT_SECRET,
            code: code,
          }),
        })

        if (!response.ok) {
          throw new Error('Failed to get access token')
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
        const { error } = await supabase
          .from('connected_stores')
          .upsert({
            user_id: user.id,
            shop_domain: shop,
            access_token: accessToken,
            scopes: import.meta.env.VITE_SHOPIFY_SCOPES,
            updated_at: new Date().toISOString(),
          })

        if (error) throw error

        setStatus('Success! Redirecting...')
        
        // Clean up
        sessionStorage.removeItem('shopify_oauth_state')

        // Redirect to THE dashboard
        setTimeout(() => {
          navigate('/dashboard')
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