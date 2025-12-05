import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY

const supabase = createClient(supabaseUrl, supabaseKey)

function normalizeCardName(name) {
  if (!name) return ''
  return name
    .toLowerCase()
    .replace(/[''"]/g, '')
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

export const handler = async (event) => {
  console.log('\n========================================')
  console.log('🚀 SYNC JOB STARTED')
  console.log('========================================\n')
  
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: 'Method not allowed' })
    }
  }

  let jobId = null

  try {
    const { storeId, accessToken, shopDomain } = JSON.parse(event.body)

    if (!storeId || !accessToken || !shopDomain) {
      throw new Error('Missing required parameters')
    }

    console.log(`📦 Store: ${shopDomain}`)

    // Get total product count
    const countResponse = await fetch(
      `https://${shopDomain}/admin/api/2024-01/products/count.json`,
      {
        headers: {
          'X-Shopify-Access-Token': accessToken,
          'Content-Type': 'application/json'
        }
      }
    )

    if (!countResponse.ok) {
      throw new Error(`Shopify API error: ${countResponse.status}`)
    }

    const { count } = await countResponse.json()
    console.log(`📊 Total products: ${count}`)

    // Create sync job
    const { data: job, error: jobError } = await supabase
      .from('sync_jobs')
      .insert({
        store_id: storeId,
        status: 'processing',
        total_products: count,
        processed_products: 0,
        failed_products: 0,
        started_at: new Date().toISOString()
      })
      .select()
      .single()

    if (jobError) throw jobError

    jobId = job.id
    console.log(`✅ Created job: ${jobId}`)
    console.log(`🔄 Starting background processing...`)

    // Process in background (don't await - fire and forget)
    processProductsInBackground(jobId, storeId, accessToken, shopDomain, count)

    // Return immediately
    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({
        success: true,
        jobId: job.id,
        totalProducts: count,
        message: `Sync started! Processing ${count} products in background.`
      })
    }

  } catch (error) {
    console.error('❌ Error:', error)
    
    if (jobId) {
      await supabase
        .from('sync_jobs')
        .update({
          status: 'failed',
          error_message: error.message,
          completed_at: new Date().toISOString()
        })
        .eq('id', jobId)
    }

    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({ error: error.message })
    }
  }
}

// Background processing function
async function processProductsInBackground(jobId, storeId, accessToken, shopDomain, totalProducts) {
  console.log(`\n🔄 Background processing started for job ${jobId}`)
  
  const BATCH_SIZE = 250
  let cursor = null
  let processedCount = 0

  try {
    while (processedCount < totalProducts) {
      console.log(`\n📦 Fetching batch (${processedCount}/${totalProducts})...`)

      // Build URL with cursor
      let url = `https://${shopDomain}/admin/api/2024-01/products.json?limit=${BATCH_SIZE}`
      if (cursor) {
        url += `&page_info=${cursor}`
      }

      const response = await fetch(url, {
        headers: {
          'X-Shopify-Access-Token': accessToken,
          'Content-Type': 'application/json'
        }
      })

      if (!response.ok) {
        throw new Error(`Shopify API error: ${response.status}`)
      }

      const data = await response.json()
      const products = data.products || []

      console.log(`✅ Fetched ${products.length} products`)

      // Process and save products
      for (const product of products) {
        for (const variant of product.variants) {
          const normalizedTitle = normalizeCardName(product.title)

          // Try to find matching card
          const { data: matchingCards } = await supabase
            .from('yugioh_cards')
            .select('id, name')
            .ilike('name', `%${normalizedTitle}%`)
            .limit(5)

          let bestMatch = null
          if (matchingCards && matchingCards.length > 0) {
            bestMatch = matchingCards.reduce((best, card) => {
              const cardNorm = normalizeCardName(card.name)
              const similarity = calculateSimilarity(normalizedTitle, cardNorm)
              return similarity > (best?.similarity || 0) ? { ...card, similarity } : best
            }, null)

            if (bestMatch && bestMatch.similarity < 0.6) {
              bestMatch = null
            }
          }

          // Upsert product
          await supabase
            .from('products')
            .upsert({
              store_id: storeId,
              shopify_product_id: product.id.toString(),
              shopify_variant_id: variant.id.toString(),
              title: product.title,
              variant_title: variant.title !== 'Default Title' ? variant.title : null,
              price: parseFloat(variant.price),
              inventory_quantity: variant.inventory_quantity || 0,
              sku: variant.sku || null,
              matched_card_id: bestMatch?.id || null,
              matched_card_name: bestMatch?.name || null,
              match_confidence: bestMatch?.similarity || null
            }, {
              onConflict: 'store_id,shopify_variant_id'
            })
        }
      }

      processedCount += products.length

      // Update job progress
      await supabase
        .from('sync_jobs')
        .update({
          processed_products: processedCount,
          last_shopify_cursor: cursor
        })
        .eq('id', jobId)

      console.log(`✅ Processed ${processedCount}/${totalProducts}`)

      // Get next cursor from Link header
      const linkHeader = response.headers.get('Link')
      if (linkHeader && processedCount < totalProducts) {
        const nextMatch = linkHeader.match(/<([^>]+)>;\s*rel="next"/)
        if (nextMatch) {
          const nextUrl = new URL(nextMatch[1])
          cursor = nextUrl.searchParams.get('page_info')
        } else {
          break
        }
      } else {
        break
      }

      // Small delay between batches
      await new Promise(resolve => setTimeout(resolve, 500))
    }

    // Mark as completed
    await supabase
      .from('sync_jobs')
      .update({
        status: 'completed',
        completed_at: new Date().toISOString()
      })
      .eq('id', jobId)

    console.log(`\n✅ Sync complete! Processed ${processedCount} products`)

  } catch (error) {
    console.error(`❌ Background processing error:`, error)
    
    await supabase
      .from('sync_jobs')
      .update({
        status: 'failed',
        error_message: error.message,
        completed_at: new Date().toISOString()
      })
      .eq('id', jobId)
  }
}

function calculateSimilarity(str1, str2) {
  const longer = str1.length > str2.length ? str1 : str2
  const shorter = str1.length > str2.length ? str2 : str1
  
  if (longer.length === 0) return 1.0
  
  const editDistance = levenshteinDistance(longer, shorter)
  return (longer.length - editDistance) / longer.length
}

function levenshteinDistance(str1, str2) {
  const matrix = []

  for (let i = 0; i <= str2.length; i++) {
    matrix[i] = [i]
  }

  for (let j = 0; j <= str1.length; j++) {
    matrix[0][j] = j
  }

  for (let i = 1; i <= str2.length; i++) {
    for (let j = 1; j <= str1.length; j++) {
      if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1]
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        )
      }
    }
  }

  return matrix[str2.length][str1.length]
}