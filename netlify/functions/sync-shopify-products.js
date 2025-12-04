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
  // Split by hyphen and take the first part
  const parts = title.split('-')
  
  if (parts.length > 1) {
    return parts[0].trim()
  }
  
  // Fallback: return the whole title
  return title.trim()
}

async function fetchCardData(cardName, productTitle) {
  if (!cardName) return null
  
  try {
    // Try exact match first
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
    
    // If still failing, try original title (cleaned)
    if (data.error && productTitle !== cardName) {
      const cleanTitle = productTitle.split('-')[0].trim() // Remove everything after first hyphen
      console.log(`⚠️ Trying cleaned title "${cleanTitle}"...`)
      response = await fetch(
        `https://db.ygoprodeck.com/api/v7/cardinfo.php?fname=${encodeURIComponent(cleanTitle)}`
      )
      data = await response.json()
    }
    
    if (data.data && data.data[0]) {
      const card = data.data[0]
      console.log(`✅ Found official card data for: ${card.name}`)
      return {
        officialName: card.name,
        image: card.card_images?.[0]?.image_url || null
      }
    }
  } catch (error) {
    console.warn(`⚠️ Could not fetch card data for ${cardName}:`, error.message)
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

// Fetch official card data from YGOProDeck
const cardData = await fetchCardData(matchedCardName, product.title)

// Use official name if found, otherwise use extracted name
const finalCardName = cardData?.officialName || matchedCardName

// Check if product has images
let productImages = product.images

// If no Shopify image, use YGOProDeck image
if ((!productImages || productImages.length === 0) && cardData?.image) {
  productImages = [{ src: cardData.image }]
  console.log(`✅ Added YGOProDeck image for "${finalCardName}"`)

}
        
        return {
          store_id: storeId,
          shopify_product_id: product.id.toString(),
          title: product.title,
          vendor: product.vendor,
          product_type: product.product_type,
          variants: product.variants,
          images: productImages,  // Now includes YGOProDeck images if needed
  matched_card_name: finalCardName,  // ← Now uses official name!
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