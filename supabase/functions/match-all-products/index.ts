import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    console.log('🎯 Function started')

    // Parse request body
    const body = await req.json()
    console.log('📦 Request body:', body)

    const { storeId, batchSize = 100 } = body

    if (!storeId) {
      throw new Error('storeId is required')
    }

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    
    if (!supabaseUrl || !supabaseKey) {
      throw new Error('Missing Supabase credentials')
    }

    const supabase = createClient(supabaseUrl, supabaseKey)
    console.log('✅ Supabase client initialized')

    // Get unmatched products
    console.log(`📦 Fetching unmatched products for store ${storeId}`)
    
    const { data: products, error } = await supabase
      .from('products')
      .select('id, title')
      .eq('store_id', storeId)
      .is('matched_card_id', null)
      .limit(batchSize)

    if (error) {
      console.error('❌ Error fetching products:', error)
      throw error
    }

    console.log(`✅ Found ${products?.length || 0} unmatched products`)

    if (!products || products.length === 0) {
      return new Response(
        JSON.stringify({ 
          success: true,
          matched: 0,
          failed: 0,
          remaining: 0,
          hasMore: false
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    let successCount = 0
    let failCount = 0

    // Process each product
    for (const product of products) {
      try {
        // Normalize title
        const normalized = product.title
          .toLowerCase()
          .replace(/[''"]/g, '')
          .replace(/[-–—∙•·]/g, ' ')
          .replace(/[^\w\s]/g, '')
          .replace(/\s+/g, ' ')
          .trim()

        console.log(`🔍 Searching for: "${normalized}"`)

        // Search for matching card
        const { data: cards } = await supabase
          .from('yugioh_cards')
          .select('id, name')
          .ilike('name', `%${normalized}%`)
          .limit(1)

        if (cards && cards.length > 0) {
          const matchedCard = cards[0]
          console.log(`✅ Found match: "${matchedCard.name}"`)

          // Update product
          const { error: updateError } = await supabase
            .from('products')
            .update({
              matched_card_id: matchedCard.id,
              matched_card_name: matchedCard.name,
              match_confidence: 0.8
            })
            .eq('id', product.id)

          if (updateError) {
            console.error(`❌ Update error:`, updateError)
            failCount++
          } else {
            successCount++
          }
        } else {
          console.log(`⚠️ No match found for "${product.title}"`)
          failCount++
        }
      } catch (error) {
        console.error(`❌ Error processing product:`, error)
        failCount++
      }
    }

    // Count remaining unmatched
    const { count: remainingCount } = await supabase
      .from('products')
      .select('*', { count: 'exact', head: true })
      .eq('store_id', storeId)
      .is('matched_card_id', null)

    console.log(`✅ Batch complete: ${successCount} matched, ${failCount} failed, ${remainingCount} remaining`)

    return new Response(
      JSON.stringify({ 
        success: true,
        matched: successCount,
        failed: failCount,
        remaining: remainingCount || 0,
        hasMore: (remainingCount || 0) > 0
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('💥 Fatal error:', error)
    return new Response(
      JSON.stringify({ 
        success: false,
        error: error.message 
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }, 
        status: 500 
      }
    )
  }
})