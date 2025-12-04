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

    // Save products to Supabase
    const productsToInsert = products.map(product => {
      // Extract card name from title (you might need to adjust this logic)
      const matchedCardName = extractCardName(product.title)
      
      return {
        store_id: storeId,
        shopify_product_id: product.id.toString(),
        title: product.title,
        vendor: product.vendor,
        product_type: product.product_type,
        variants: product.variants,
        images: product.images,
        matched_card_name: matchedCardName,  // Add this
        normalized_card_name: normalizeCardName(matchedCardName),  // Add this
        updated_at: new Date().toISOString()
      }
    })

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