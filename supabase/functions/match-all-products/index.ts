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
        console.log(`🔍 Matching: "${product.title}"`)

        let matchedCard = null
        let matchMethod = null

        // STEP 1: Try exact match first (fastest, best for clean data)
        const { data: exactCards } = await supabase
          .from('yugioh_cards')
          .select('id, name')
          .eq('name', product.title)
          .limit(1)

        if (exactCards && exactCards.length > 0) {
          matchedCard = exactCards[0]
          matchMethod = 'exact'
          console.log(`✅ Exact match: "${matchedCard.name}"`)
        }

        // STEP 2: Try normalized fuzzy match (handles hyphens, quotes, etc.)
        if (!matchedCard) {
          const normalized = product.title
            .toLowerCase()
            .replace(/[''"]/g, '') // Remove quotes
            .replace(/[-–—∙•·]/g, ' ') // Replace dashes with spaces
            .replace(/[^\w\s]/g, '') // Remove special chars
            .replace(/\s+/g, ' ') // Collapse multiple spaces
            .trim()

          console.log(`   🔄 Trying fuzzy match: "${normalized}"`)

          const { data: fuzzyCards } = await supabase
            .from('yugioh_cards')
            .select('id, name')
            .ilike('name', `%${normalized}%`)
            .limit(1)

          if (fuzzyCards && fuzzyCards.length > 0) {
            matchedCard = fuzzyCards[0]
            matchMethod = 'fuzzy'
            console.log(`✅ Fuzzy match: "${matchedCard.name}"`)
          }
        }

        // STEP 3: Try matching just the core card name (removes edition, set codes, etc.)
        if (!matchedCard) {
          // Remove common suffixes like (1st Edition), [LOB-001], etc.
          const coreTitle = product.title
            .replace(/\([^)]*\)/g, '') // Remove parentheses content
            .replace(/\[[^\]]*\]/g, '') // Remove bracket content
            .replace(/\s*-\s*\w+\d+\s*$/i, '') // Remove set codes at end
            .replace(/\s*(Near Mint|LP|MP|HP|Damaged|1st Edition|Unlimited|Limited)\s*/gi, '') // Remove conditions/editions
            .trim()

          if (coreTitle !== product.title) {
            console.log(`   🔄 Trying core name: "${coreTitle}"`)

            const normalized = coreTitle
              .toLowerCase()
              .replace(/[''"]/g, '')
              .replace(/[-–—∙•·]/g, ' ')
              .replace(/[^\w\s]/g, '')
              .replace(/\s+/g, ' ')
              .trim()

            const { data: coreCards } = await supabase
              .from('yugioh_cards')
              .select('id, name')
              .ilike('name', `%${normalized}%`)
              .limit(1)

            if (coreCards && coreCards.length > 0) {
              matchedCard = coreCards[0]
              matchMethod = 'core'
              console.log(`✅ Core match: "${matchedCard.name}"`)
            }
          }
        }

        // Update product if match found
        if (matchedCard) {
          const confidence = matchMethod === 'exact' ? 1.0 : matchMethod === 'fuzzy' ? 0.8 : 0.6

          const { error: updateError } = await supabase
            .from('products')
            .update({
              matched_card_id: matchedCard.id,
              matched_card_name: matchedCard.name,
              match_confidence: confidence
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