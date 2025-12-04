const { createClient } = require('@supabase/supabase-js')

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

// Add the normalize helper function
function normalizeCardName(name) {
  if (!name) return ''
  return name
    .toLowerCase()
    .replace(/[\s-]/g, '') // Remove spaces and hyphens
    .replace(/[^a-z0-9]/g, '') // Remove special characters
}

function extractCardName(title) {
  let cleaned = title
  
  // Remove set codes (e.g., "LOB-005", "SDK-001")
  cleaned = cleaned.replace(/\s*-?\s*[A-Z]{2,5}-[A-Z]?\d{3,4}\s*/gi, '')
  
  // Remove conditions (including "Mint")
  cleaned = cleaned.replace(/\s*-?\s*(Near Mint|Lightly Played|Moderately Played|Heavily Played|Damaged|Mint|NM|LP|MP|HP|DMG)\s*/gi, '')
  
  // Remove editions
  cleaned = cleaned.replace(/\s*-?\s*(1st Edition|Limited Edition|Unlimited|1st)\s*/gi, '')
  
  // Remove rarity (in order from longest to shortest to avoid partial matches)
  cleaned = cleaned.replace(/\s*-?\s*(Starlight Rare|Ghost Rare|Ultimate Rare|Ultra Rare|Super Rare|Secret Rare|Prismatic Secret|Quarter Century|Collector's Rare|Rare|Common)\s*/gi, '')
  
  // Clean up: remove trailing " - " patterns
  cleaned = cleaned.replace(/\s*-\s*$/g, '').trim()
  
  return cleaned
}

async function fetchCardData(cardName, productTitle) {
  if (!cardName) return null
  
  console.log(`\n🔍 FETCH CARD DATA START`)
  console.log(`   Input cardName: "${cardName}"`)
  console.log(`   Input productTitle: "${productTitle}"`)
  
  try {
    // Try exact match first
    console.log(`   🌐 Trying exact match...`)
    let response = await fetch(
      `https://db.ygoprodeck.com/api/v7/cardinfo.php?name=${encodeURIComponent(cardName)}`
    )
    let data = await response.json()
    
    if (data.error) {
      console.log(`   ❌ Exact match failed: ${data.error}`)
      console.log(`   🌐 Trying fuzzy search...`)
      
      // Try fuzzy search
      response = await fetch(
        `https://db.ygoprodeck.com/api/v7/cardinfo.php?fname=${encodeURIComponent(cardName)}`
      )
      data = await response.json()
    }
    
    if (data.data && data.data[0]) {
      const card = data.data[0]
      console.log(`   ✅ FOUND: "${card.name}"`)
      console.log(`   🖼️  Image: ${card.card_images?.[0]?.image_url}`)
      console.log(`🔍 FETCH CARD DATA END\n`)
      return {
        officialName: card.name,
        image: card.card_images?.[0]?.image_url || null
      }
    } else {
      console.log(`   ❌ No results found`)
      console.log(`🔍 FETCH CARD DATA END\n`)
    }
  } catch (error) {
    console.warn(`   ⚠️ Error: ${error.message}`)
    console.log(`🔍 FETCH CARD DATA END\n`)
  }
  
  return null
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: 'Method not allowed' })
    }
  }

  try {
    const { storeId, accessToken, shopDomain } = JSON.parse(event.body)

    if (!storeId || !accessToken || !shopDomain) {
      throw new Error('Missing required parameters')
    }

    // Fetch products from Shopify
    const shopifyResponse = await fetch(
      `https://${shopDomain}/admin/api/2024-01/products.json?limit=250`,
      {
        headers: {
          'X-Shopify-Access-Token': accessToken,
          'Content-Type': 'application/json',
        },
      }
    )

    if (!shopifyResponse.ok) {
      const errorText = await shopifyResponse.text()
      throw new Error(`Shopify API error: ${errorText}`)
    }

    const shopifyData = await shopifyResponse.json()
    const products = shopifyData.products || []

    console.log(`📦 Syncing ${products.length} products...`)

    // Save products to Supabase
    const productsToInsert = await Promise.all(
      products.map(async (product) => {
const matchedCardName = extractCardName(product.title)

// Check if product has Shopify images
let productImages = product.images
let finalCardName = matchedCardName

// Only fetch from YGOProDeck if NO Shopify image exists
if (!productImages || productImages.length === 0) {
  console.log(`🔍 No Shopify image for "${product.title}"`)
  
  // Check if we already have this product in the database with an image
  const { data: existingProduct } = await supabase
    .from('products')
    .select('images, matched_card_name')
    .eq('store_id', storeId)
    .eq('shopify_product_id', product.id.toString())
    .single()
  
  if (existingProduct?.images && existingProduct.images.length > 0) {
    // Use existing image from database (don't fetch again)
    productImages = existingProduct.images
    finalCardName = existingProduct.matched_card_name
    console.log(`✅ Using existing database image for "${product.title}"`)
  } else {
    // Fetch from YGOProDeck (first time only)
    console.log(`🌐 Fetching from YGOProDeck...`)
    const cardData = await fetchCardData(matchedCardName, product.title)
    finalCardName = cardData?.officialName || matchedCardName
    
    if (cardData?.image) {
      productImages = [{ src: cardData.image }]
      console.log(`✅ Added YGOProDeck image for "${finalCardName}"`)
    }
  }
} else {
  // Has Shopify image - just get official name
  console.log(`✅ Using Shopify image for "${product.title}"`)
  const cardData = await fetchCardData(matchedCardName, product.title)
  finalCardName = cardData?.officialName || matchedCardName
}

return {
  store_id: storeId,
  shopify_product_id: product.id.toString(),
  title: product.title,
  vendor: product.vendor,
  product_type: product.product_type,
  variants: product.variants,
  images: productImages,
  matched_card_name: finalCardName,
  normalized_card_name: normalizeCardName(finalCardName),
  updated_at: new Date().toISOString()
}
      })
    )

    // Delete old products for this store
    await supabase
      .from('products')
      .delete()
      .eq('store_id', storeId)

    // Insert new products
    const { error: insertError } = await supabase
      .from('products')
      .insert(productsToInsert)

    if (insertError) {
      throw new Error(`Database error: ${insertError.message}`)
    }

    console.log(`✅ Successfully synced ${products.length} products`)

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        success: true,
        productsCount: products.length
      })
    }

  } catch (error) {
    console.error('Sync products error:', error)
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message })
    }
  }
}