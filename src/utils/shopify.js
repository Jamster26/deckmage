export const initiateShopifyOAuth = (shopDomain) => {
  const clientId = import.meta.env.VITE_SHOPIFY_CLIENT_ID
  const scopes = import.meta.env.VITE_SHOPIFY_SCOPES
  const redirectUri = import.meta.env.VITE_SHOPIFY_REDIRECT_URI
  
  // Generate random state for security
  const state = Math.random().toString(36).substring(7)
  sessionStorage.setItem('shopify_oauth_state', state)
  
  // Build OAuth URL
  const authUrl = `https://${shopDomain}/admin/oauth/authorize?client_id=${clientId}&scope=${scopes}&redirect_uri=${redirectUri}&state=${state}`
  
  // Redirect to Shopify
  window.location.href = authUrl
}