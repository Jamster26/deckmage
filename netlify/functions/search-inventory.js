import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

function normalizeCardName(name) {
  if (!name) return '';
  return name
    .toLowerCase()
    .replace(/[''"]/g, '')
    .replace(/[-–—∙•·]/g, ' ')
    .replace(/[^\w\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractSetCode(title, sku) {
  if (sku && /^[A-Z]{2,5}-[A-Z]?\d{3,4}/i.test(sku)) {
    return sku.match(/([A-Z]{2,5}-[A-Z]?\d{3,4})/i)[1]
  }
  
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
      if (condition === 'NM') return 'Near Mint'
      if (condition === 'LP') return 'Lightly Played'
      if (condition === 'MP') return 'Moderately Played'
      if (condition === 'HP') return 'Heavily Played'
      if (condition === 'DMG') return 'Damaged'
      return condition
    }
  }
  
  return 'Near Mint'
}

function extractEdition(title) {
  if (title.toLowerCase().includes('1st edition')) return '1st Edition'
  if (title.toLowerCase().includes('limited edition')) return 'Limited Edition'
  if (title.toLowerCase().includes('unlimited')) return 'Unlimited'
  return null
}

export const handler = async (event) => {
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

    console.log(`🔍 Search request | Shop: ${shopId} | Cards: ${cardNames.length}`)

    if (!shopId || !cardNames || !Array.isArray(cardNames)) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Missing shopId or cardNames array' })
      }
    }

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

    const normalizedCardNames = cardNames.map(normalizeCardName)
    const uniqueNormalized = [...new Set(normalizedCardNames)]

    // Fetch products from database
    const chunkSize = 30
    const chunks = []
    for (let i = 0; i < uniqueNormalized.length; i += chunkSize) {
      chunks.push(uniqueNormalized.slice(i, i + chunkSize))
    }

    let products = []
    for (const chunk of chunks) {
      const { data, error: productsError } = await supabase
        .from('products')
        .select('*')
        .eq('store_id', store.id)
        .in('normalized_card_name', chunk)
      
      if (data) products.push(...data)
    }

    console.log(`Found ${products.length} matching products`)

    // 🆕 NEW: Fetch card data from LOCAL database (no API calls!)
    const uniqueCardNames = [...new Set(products.map(p => p.matched_card_name))]

    const { data: cardDataArray } = await supabase
      .from('yugioh_cards')
      .select('*')
      .in('name', uniqueCardNames)

    // Create lookup map
    const cardDataMap = {}
    if (cardDataArray) {
      cardDataArray.forEach(card => {
        cardDataMap[card.name] = card
      })
    }

    console.log(`Fetched card data for ${Object.keys(cardDataMap).length} unique cards from local DB`)

    const results = {}

    cardNames.forEach(cardName => {
      const normalizedSearch = normalizeCardName(cardName)
      
      const matchingProducts = products.filter(p => 
        p.normalized_card_name === normalizedSearch
      )

      if (matchingProducts.length > 0) {
        // Get card data from local database
        const cardData = cardDataMap[matchingProducts[0].matched_card_name]
        
        results[cardName] = matchingProducts.map(product => {
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
            setName: getSetName(setCode, cardData?.card_sets) || null,
            rarity: product.rarity || extractRarity(product.title) || 'Common',
            condition: product.condition || extractCondition(product.title),
            edition: product.edition || extractEdition(product.title) || '',
            // 🆕 Use LOCAL database card data (no API call!)
            description: cardData?.description || '',
            cardType: cardData?.type || '',
            race: cardData?.race || '',
            attribute: cardData?.attribute || '',
            atk: cardData?.atk,
            def: cardData?.def,
            level: cardData?.level
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