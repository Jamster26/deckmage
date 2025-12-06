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

    console.log(`🚀 Processing batch for job ${jobId}`)

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
      console.error(`❌ Job error:`, jobError)
      throw new Error('Job not found')
    }

    console.log(`📋 Job status: ${job.status}, Processed: ${job.processed_products}/${job.total_products}`)

    // Check if already completed
    if (job.status === 'completed') {
      console.log(`⏭️ Job already completed, skipping`)
      return new Response(
        JSON.stringify({ success: true, done: true, message: 'Already completed' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const store = job.connected_stores
    const cursor = job.last_shopify_cursor

    console.log(`🏪 Store: ${store.shop_domain}, Cursor: ${cursor || 'none'}`)

    // Update to processing if pending
    if (job.status === 'pending') {
      await supabase
        .from('sync_jobs')
        .update({ status: 'processing' })
        .eq('id', jobId)
    }

    // Fetch ONE batch from Shopify
    let url = `https://${store.shop_domain}/admin/api/2024-01/products.json?limit=250`
    if (cursor) url += `&page_info=${cursor}`

    console.log(`📦 Fetching from Shopify: ${url}`)

    const response = await fetch(url, {
      headers: {
        'X-Shopify-Access-Token': store.access_token,
        'Content-Type': 'application/json'
      }
    })

    if (!response.ok) {
      console.error(`❌ Shopify API error: ${response.status}`)
      throw new Error(`Shopify API error: ${response.status}`)
    }

    const data = await response.json()
    const products = data.products || []

    console.log(`✅ Shopify returned ${products.length} products`)

    // Build batch insert array (MUCH faster than individual upserts)
    const productsToInsert = []
    
    for (const product of products) {
      console.log(`   📦 Product: "${product.title}" with ${product.variants?.length || 0} variants`)
      for (const variant of product.variants) {
        productsToInsert.push({
          store_id: store.id,
          shopify_product_id: product.id.toString(),
          shopify_variant_id: variant.id.toString(),
          title: product.title,
          variant_title: variant.title !== 'Default Title' ? variant.title : null,
          price: parseFloat(variant.price),
          inventory_quantity: variant.inventory_quantity || 0,
          sku: variant.sku || null,
          matched_card_id: null,
          matched_card_name: null,
          match_confidence: null
        })
      }
    }

    console.log(`📝 Built array of ${productsToInsert.length} variants to insert`)

    // Single batch upsert - MUCH more efficient
    if (productsToInsert.length > 0) {
      console.log(`💾 Starting upsert to 'products' table...`)
      
      const { data: upsertData, error: upsertError } = await supabase
        .from('products')
        .upsert(productsToInsert, { 
          onConflict: 'store_id,shopify_variant_id',
          ignoreDuplicates: false 
        })
      
      if (upsertError) {
        console.error(`❌ Upsert error:`, upsertError)
        throw upsertError
      }
      
      console.log(`✅ Upsert successful!`)
    } else {
      console.log(`⚠️ No products to insert!`)
    }

    const newProcessed = job.processed_products + products.length

    // Get next cursor
    const linkHeader = response.headers.get('Link')
    let nextCursor = null
    let hasMore = false
    
    if (linkHeader && newProcessed < job.total_products) {
      const nextMatch = linkHeader.match(/<([^>]+)>;\s*rel="next"/)
      if (nextMatch) {
        const nextUrl = new URL(nextMatch[1])
        nextCursor = nextUrl.searchParams.get('page_info')
        hasMore = true
      }
    }

    console.log(`🔗 Next cursor: ${nextCursor || 'none'}, hasMore: ${hasMore}`)

    // Update job progress
    const isComplete = !hasMore || newProcessed >= job.total_products

    await supabase
      .from('sync_jobs')
      .update({
        processed_products: newProcessed,
        last_shopify_cursor: nextCursor,
        status: isComplete ? 'completed' : 'processing',
        completed_at: isComplete ? new Date().toISOString() : null
      })
      .eq('id', jobId)

    console.log(`✅ Batch complete: ${newProcessed}/${job.total_products}, isComplete: ${isComplete}`)

    // 🆕 AUTO-TRIGGER MATCHING WHEN SYNC COMPLETES
    if (isComplete) {
      console.log('🎯 Sync complete! Auto-triggering matching job...')
      
      try {
        const matchResponse = await fetch(`${supabaseUrl}/functions/v1/match-all-products`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${supabaseKey}`
          },
          body: JSON.stringify({
            storeId: store.id,
            batchSize: 100
          })
        })

        if (matchResponse.ok) {
          console.log('✅ Matching job triggered successfully!')
        } else {
          console.error('⚠️ Failed to trigger matching (non-critical)')
        }
      } catch (matchError) {
        console.error('⚠️ Error triggering matching:', matchError)
      }
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        processed: newProcessed,
        total: job.total_products,
        done: isComplete,
        hasMore: hasMore
      }),
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