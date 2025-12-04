const { createClient } = require('@supabase/supabase-js')

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

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

    // Search for products that match the card names
    const { data: products, error: productsError } = await supabase
      .from('products')
      .select('*')
      .eq('store_id', store.id)
      .in('matched_card_name', cardNames)

    if (productsError) {
      throw productsError
    }

    // Group products by card name
    const results = {}
    
    cardNames.forEach(cardName => {
      const matchingProducts = products.filter(p => 
        p.matched_card_name === cardName
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