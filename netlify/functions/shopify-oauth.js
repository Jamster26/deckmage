export const handler = async (event) => {
  // Only allow POST requests
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: 'Method not allowed' })
    }
  }

  try {
    const { code, shop } = JSON.parse(event.body)

    // Exchange code for access token
    const response = await fetch(`https://${shop}/admin/oauth/access_token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        client_id: process.env.VITE_SHOPIFY_CLIENT_ID,
        client_secret: process.env.VITE_SHOPIFY_CLIENT_SECRET,
        code: code,
      }),
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`Shopify API error: ${errorText}`)
    }

    const data = await response.json()

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data)
    }

  } catch (error) {
    console.error('OAuth exchange error:', error)
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message })
    }
  }
}