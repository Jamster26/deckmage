import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { jobId } = await req.json()
    
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseKey)

    console.log(`🚀 Starting background sync for job ${jobId}`)

    // Get job and store details
    const { data: job, error: jobError } = await supabase
      .from('sync_jobs')
      .select(`
        *,
        connected_stores (
          id,
          shop_domain,
          access_token
        )
      `)
      .eq('id', jobId)
      .single()

    if (jobError || !job) {
      throw new Error('Job not found')
    }

    const store = job.connected_stores
    const BATCH_SIZE = 250
    let cursor = null
    let processedCount = 0

    // Update to processing
    await supabase
      .from('sync_jobs')
      .update({ status: 'processing' })
      .eq('id', jobId)

    // Process all products
    while (processedCount < job.total_products) {
      console.log(`📦 Fetching batch (${processedCount}/${job.total_products})...`)

      let url = `https://${store.shop_domain}/admin/api/2024-01/products.json?limit=${BATCH_SIZE}`
      if (cursor) url += `&page_info=${cursor}`

      const response = await fetch(url, {
        headers: {
          'X-Shopify-Access-Token': store.access_token,
          'Content-Type': 'application/json'
        }
      })

      if (!response.ok) {
        throw new Error(`Shopify API error: ${response.status}`)
      }

      const data = await response.json()
      const products = data.products || []

      console.log(`✅ Fetched ${products.length} products`)

      // Process products
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
            bestMatch = matchingCards.reduce((best: any, card: any) => {
              const cardNorm = normalizeCardName(card.name)
              const similarity = calculateSimilarity(normalizedTitle, cardNorm)
              return similarity > (best?.similarity || 0) 
                ? { ...card, similarity } 
                : best
            }, null)

            if (bestMatch && bestMatch.similarity < 0.6) {
              bestMatch = null
            }
          }

          // Upsert product
          await supabase
            .from('products')
            .upsert({
              store_id: store.id,
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

      // Update progress
      await supabase
        .from('sync_jobs')
        .update({
          processed_products: processedCount,
          last_shopify_cursor: cursor
        })
        .eq('id', jobId)

      console.log(`✅ Processed ${processedCount}/${job.total_products}`)

      // Get next cursor
      const linkHeader = response.headers.get('Link')
      if (linkHeader && processedCount < job.total_products) {
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

    console.log(`✅ Sync complete! Processed ${processedCount} products`)

    return new Response(
      JSON.stringify({ success: true, processed: processedCount }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('❌ Error:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    )
  }
})

function normalizeCardName(name: string): string {
  if (!name) return ''
  return name
    .toLowerCase()
    .replace(/[''"]/g, '')
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function calculateSimilarity(str1: string, str2: string): number {
  const longer = str1.length > str2.length ? str1 : str2
  const shorter = str1.length > str2.length ? str2 : str1
  
  if (longer.length === 0) return 1.0
  
  const editDistance = levenshteinDistance(longer, shorter)
  return (longer.length - editDistance) / longer.length
}

function levenshteinDistance(str1: string, str2: string): number {
  const matrix: number[][] = []

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