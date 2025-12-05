import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function normalizeCardName(name: string): string {
  if (!name) return '';
  return name
    .toLowerCase()
    .replace(/[''"]/g, '')
    .replace(/[-–—∙•·]/g, ' ')
    .replace(/[^\w\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { storeId, batchSize = 100 } = await req.json()
    
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseKey)

    console.log(`🎯 Starting card matching for store ${storeId}`)

    // Get unmatched products in batches
    const { data: products, error } = await supabase
      .from('products')
      .select('id, title, store_id')
      .eq('store_id', storeId)
      .is('matched_card_id', null)
      .limit(batchSize)

    if (error || !products) {
      throw new Error('Failed to fetch products')
    }

    console.log(`📦 Processing ${products.length} unmatched products`)

    let successCount = 0
    let failCount = 0

    for (const product of products) {
      try {
        const normalized = normalizeCardName(product.title)

        // Search for matching card
        const { data: cards } = await supabase
          .from('yugioh_cards')
          .select('id, name')
          .ilike('name', `%${normalized}%`)
          .limit(1)

        if (cards && cards.length > 0) {
          const matchedCard = cards[0]

          // Update product with match
          const { error: updateError } = await supabase
            .from('products')
            .update({
              matched_card_id: matchedCard.id,
              matched_card_name: matchedCard.name,
              match_confidence: 0.8
            })
            .eq('id', product.id)

          if (updateError) {
            console.error(`❌ Failed to update product ${product.id}:`, updateError)
            failCount++
          } else {
            successCount++
          }
        } else {
          failCount++
        }

      } catch (error) {
        console.error(`❌ Error matching product ${product.id}:`, error)
        failCount++
      }
    }

    // Check if there are more products to match
    const { count: remainingCount } = await supabase
      .from('products')
      .select('*', { count: 'exact', head: true })
      .eq('store_id', storeId)
      .is('matched_card_id', null)

    const hasMore = (remainingCount || 0) > 0

    console.log(`✅ Batch complete: ${successCount} matched, ${failCount} failed`)
    console.log(`📊 Remaining unmatched: ${remainingCount}`)

    return new Response(
      JSON.stringify({ 
        success: true,
        matched: successCount,
        failed: failCount,
        remaining: remainingCount,
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