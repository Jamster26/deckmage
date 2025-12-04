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

// Helper function to extract card name from product title
function extractCardName(title) {
  // Remove common suffixes like set codes, conditions, editions
  let cleaned = title
    
  // Remove set codes (e.g., "LOB-005", "SDK-001")
  cleaned = cleaned.replace(/\s*-?\s*[A-Z]{2,5}-[A-Z]?\d{3,4}\s*/gi, '')
  
  // Remove conditions
  cleaned = cleaned.replace(/\s*-?\s*(Near Mint|Lightly Played|Moderately Played|Heavily Played|Damaged|NM|LP|MP|HP|DMG)\s*/gi, '')
  
  // Remove editions
  cleaned = cleaned.replace(/\s*-?\s*(1st Edition|Limited Edition|Unlimited)\s*/gi, '')
  
  // Remove rarity
  cleaned = cleaned.replace(/\s*-?\s*(Ultra Rare|Super Rare|Secret Rare|Rare|Common|Starlight|Ghost)\s*/gi, '')
  
  // Trim and return
  return cleaned.trim()
}

// Fetch card image from YGOProDeck
async function fetchCardImage(cardName, productTitle) {
  if (!cardName) return null
  
  try {
    // Try exact match with the extracted card name first
    let response = await fetch(
      `https://db.ygoprodeck.com/api/v7/cardinfo.php?name=${encodeURIComponent(cardName)}`
    )
    let data = await response.json()
    
    // If exact match fails, try fuzzy search
    if (data.error) {
      console.log(`⚠️ Exact match failed for "${cardName}", trying fuzzy search...`)
      response = await fetch(
        `https://db.ygoprodeck.com/api/v7/cardinfo.php?fname=${encodeURIComponent(cardName)}`
      )
      data = await response.json()
    }
    
    // If fuzzy search also fails, try with the original product title
    if (data.error && productTitle !== cardName) {
      console.log(`⚠️ Fuzzy search failed, trying original title "${productTitle}"...`)
      response = await fetch(
        `https://db.ygoprodeck.com/api/v7/cardinfo.php?fname=${encodeURIComponent(productTitle)}`
      )
      data = await response.json()
    }
    
    if (data.data && data.data[0]?.card_images?.[0]?.image_url) {
      console.log(`✅ Found image for ${cardName}`)
      return data.data[0].card_images[0].image_url
    } else {
      console.log(`❌ No image found for ${cardName}`)
    }
  } catch (error) {
    console.warn(`⚠️ Could not fetch image for ${cardName}:`, error.message)
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
        // In the products.map section:
const matchedCardName = extractCardName(product.title)

// Check if product has images
let productImages = product.images

// If no Shopify image, fetch from YGOProDeck
if (!productImages || productImages.length === 0) {
  console.log(`🔍 No Shopify image for "${product.title}", fetching from YGOProDeck...`)
  const ygoproImage = await fetchCardImage(matchedCardName, product.title) // ← Pass both
  
  if (ygoproImage) {
    productImages = [{ src: ygoproImage }]
    console.log(`✅ Added YGOProDeck image for "${matchedCardName}"`)
  }
}
        
        return {
          store_id: storeId,
          shopify_product_id: product.id.toString(),
          title: product.title,
          vendor: product.vendor,
          product_type: product.product_type,
          variants: product.variants,
          images: productImages,  // Now includes YGOProDeck images if needed
          matched_card_name: matchedCardName,
          normalized_card_name: normalizeCardName(matchedCardName),
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