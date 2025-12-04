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

// Add these helper functions at the top of the file
function extractSetCode(title, sku) {
  // Priority 1: Use SKU if it looks like a set code
  if (sku && /^[A-Z]{2,5}-[A-Z]?\d{3,4}/i.test(sku)) {
    return sku.match(/([A-Z]{2,5}-[A-Z]?\d{3,4})/i)[1]
  }
  
  // Priority 2: Extract from title
  const match = title.match(/([A-Z]{2,5}-[A-Z]?\d{3,4})/i)
  return match ? match[1] : null
}

function extractRarity(title) {
  const rarities = [
    'Starlight Rare', 'Ghost Rare', 'Secret Rare', 
    'Ultra Rare', 'Super Rare', 'Rare', 'Common',
    'Quarter Century', 'Collector\'s Rare', 'Prismatic Secret'
  ]
  
  for (const rarity of rarities) {
    if (title.toLowerCase().includes(rarity.toLowerCase())) {
      return rarity
    }
  }
  
  return null
}

async function fetchCardDataFromYGOPro(cardName) {
  if (!cardName) return null
  
  try {
    let response = await fetch(
      `https://db.ygoprodeck.com/api/v7/cardinfo.php?name=${encodeURIComponent(cardName)}`
    )
    
    if (!response.ok) {
      throw new Error(`YGOPro API returned ${response.status}`)
    }
    
    let data = await response.json()
    
    // If exact match fails, try fuzzy search
    if (data.error) {
      response = await fetch(
        `https://db.ygoprodeck.com/api/v7/cardinfo.php?fname=${encodeURIComponent(cardName)}`
      )
      
      if (!response.ok) {
        throw new Error(`YGOPro API returned ${response.status}`)
      }
      
      data = await response.json()
    }
    
    if (data.data && data.data[0]) {
      const card = data.data[0]
      return {
        description: card.desc,
        type: card.type,
        race: card.race,
        archetype: card.archetype,
        atk: card.atk,
        def: card.def,
        level: card.level,
        attribute: card.attribute,
        sets: card.card_sets || []
      }
    }
  } catch (error) {
    console.warn(`Could not fetch YGOPro data for ${cardName}:`, error.message)
    return null  // Return null instead of throwing
  }
  
  return null
}

// Helper to find set name from set code
function getSetName(setCode, ygoproSets) {
  if (!setCode || !ygoproSets) return null
  
  const set = ygoproSets.find(s => 
    s.set_code && s.set_code.toLowerCase() === setCode.toLowerCase()
  )
  
  return set ? set.set_name : null
}

function extractCondition(title) {
  const conditions = [
    'Near Mint', 'Lightly Played', 'Moderately Played', 
    'Heavily Played', 'Damaged',
    'NM', 'LP', 'MP', 'HP', 'DMG'
  ]
  
  for (const condition of conditions) {
    if (title.toLowerCase().includes(condition.toLowerCase())) {
      // Expand abbreviations
      if (condition === 'NM') return 'Near Mint'
      if (condition === 'LP') return 'Lightly Played'
      if (condition === 'MP') return 'Moderately Played'
      if (condition === 'HP') return 'Heavily Played'
      if (condition === 'DMG') return 'Damaged'
      return condition
    }
  }
  
  return 'Near Mint' // Default assumption
}

function extractEdition(title) {
  if (title.toLowerCase().includes('1st edition')) return '1st Edition'
  if (title.toLowerCase().includes('limited edition')) return 'Limited Edition'
  if (title.toLowerCase().includes('unlimited')) return 'Unlimited'
  return null
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
// Before the forEach loop, fetch YGOPro data once per unique card
const ygoproDataCache = {}

try {
  for (const cardName of cardNames) {
    const normalizedSearch = normalizeCardName(cardName)
    const matchingProducts = products.filter(p => 
      p.normalized_card_name === normalizedSearch
    )
    
    if (matchingProducts.length > 0) {
      // Fetch YGOPro data once for this card
      const matchedCardName = matchingProducts[0].matched_card_name
      console.log(`Fetching YGOPro data for: ${matchedCardName}`)
      
      try {
        ygoproDataCache[cardName] = await fetchCardDataFromYGOPro(matchedCardName)
      } catch (error) {
        console.error(`Failed to fetch YGOPro data for ${matchedCardName}:`, error)
        ygoproDataCache[cardName] = null  // Set to null on error
      }
    }
  }
} catch (error) {
  console.error('Error in YGOPro fetch loop:', error)
  // Continue without YGOPro data - search will still work
}

// Group products by original card name (for response)
const results = {}

cardNames.forEach(cardName => {
  const normalizedSearch = normalizeCardName(cardName)
  
  const matchingProducts = products.filter(p => 
    p.normalized_card_name === normalizedSearch
  )

  if (matchingProducts.length > 0) {
    const ygoproData = ygoproDataCache[cardName]
    
    // Map products to the format the deck builder expects
    results[cardName] = matchingProducts.map(product => {
      // Get the first variant for pricing
      const variant = product.variants?.[0] || {}
      const setCode = product.set_code || extractSetCode(product.title, variant.sku) || 'N/A'
      
      return {
        productId: product.shopify_product_id,
        variantId: variant.id,
        title: product.title,
        matchedCardName: product.matched_card_name,
        price: parseFloat(variant.price) || 0,
        compareAtPrice: variant.compare_at_price ? parseFloat(variant.compare_at_price) : null,
        sku: variant.sku || '',
        available: variant.inventory_quantity > 0,
        inventoryQuantity: variant.inventory_quantity || 0,
        image: product.images?.[0]?.src || null,
        setCode: setCode,
        setName: getSetName(setCode, ygoproData?.sets) || null,
        rarity: product.rarity || extractRarity(product.title) || 'Common',
        condition: product.condition || extractCondition(product.title),
        edition: product.edition || extractEdition(product.title) || '',
        // NEW: Rich card data from YGOProDeck
        description: product.description || ygoproData?.description || '',
        cardType: ygoproData?.type || '',
        race: ygoproData?.race || '',
        attribute: ygoproData?.attribute || '',
        atk: ygoproData?.atk,
        def: ygoproData?.def,
        level: ygoproData?.level
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

