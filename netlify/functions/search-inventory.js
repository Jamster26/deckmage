const { createClient } = require('@supabase/supabase-js')

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

// Add this helper function at the top of search-inventory.js
function normalizeCardName(name) {
  return name
    .toLowerCase()
    .replace(/[\s-]/g, '') // Remove spaces and hyphens
    .replace(/[^a-z0-9]/g, '') // Remove special characters
}

exports.handler = async (event) => {
  // Enable CORS
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Content-Type': 'application/json'
  }

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' }
  }

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: 'Method not allowed' })
    }
  }

  try {
    const { shopId, cardNames } = JSON.parse(event.body)

    if (!shopId || !cardNames || !Array.isArray(cardNames)) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Missing shopId or cardNames array' })
      }
    }

    console.log(`Searching inventory for shop: ${shopId}`)
    console.log(`Card names:`, cardNames)

    // Look up the store
    const { data: store, error: storeError } = await supabase
      .from('connected_stores')
      .select('id')
      .eq('shop_domain', shopId)
      .single()

    if (storeError || !store) {
      return {
        statusCode: 404,
        headers,
        body: JSON.stringify({ error: 'Shop not found' })
      }
    }

   // In netlify/functions/search-inventory.js

// Normalize the search terms
    const normalizedCardNames = cardNames.map(normalizeCardName)

    console.log('Normalized search terms:', normalizedCardNames)

    // Query using normalized column for fast lookup
    const { data: products, error: productsError } = await supabase
      .from('products')
      .select('*')
      .eq('store_id', store.id)
      .in('normalized_card_name', normalizedCardNames)

    if (productsError) {
      console.error('Products query error:', productsError)
      throw productsError
    }

    console.log(`Found ${products.length} matching products`)

    // Group products by original card name (for response)
    const results = {}
    
    cardNames.forEach(cardName => {
      const normalizedSearch = normalizeCardName(cardName)
      
      const matchingProducts = products.filter(p => 
        p.normalized_card_name === normalizedSearch
      )

      if (matchingProducts.length > 0) {
        // Map products to the format the deck builder expects
        results[cardName] = matchingProducts.map(product => {
          // Get the first variant for pricing
          const variant = product.variants?.[0] || {}
          
          return {
            productId: product.shopify_product_id,
            variantId: variant.id,
            title: product.title,
            price: parseFloat(variant.price) || 0,
            compareAtPrice: variant.compare_at_price ? parseFloat(variant.compare_at_price) : null,
            sku: variant.sku || '',
            available: variant.inventory_quantity > 0,
            inventoryQuantity: variant.inventory_quantity || 0,
            image: product.images?.[0]?.src || null,
            // Extract metadata from title or stored fields
            setCode: product.set_code || extractSetCode(product.title),
            rarity: product.rarity || extractRarity(product.title),
            condition: product.condition || 'Near Mint',
            edition: product.edition || ''
          }
        })
      } else {
        results[cardName] = []
      }
    })

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        results
      })
    }

  } catch (error) {
    console.error('Search inventory error:', error)
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: error.message })
    }
  }
}

// Helper functions to extract metadata from product titles
function extractSetCode(title) {
  const match = title.match(/\b([A-Z]{2,5}-[A-Z]?\d{3})\b/i)
  return match ? match[1].toUpperCase() : ''
}

function extractRarity(title) {
  const rarities = [
    'Starlight Rare',
    'Ghost Rare',
    'Ultimate Rare',
    'Ultra Rare',
    'Super Rare',
    'Secret Rare',
    'Rare',
    'Common'
  ]
  
  for (const rarity of rarities) {
    if (title.toLowerCase().includes(rarity.toLowerCase())) {
      return rarity
    }
  }
  
  return ''
}