import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { crypto } from "https://deno.land/std@0.168.0/crypto/mod.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-shopify-topic, x-shopify-hmac-sha256, x-shopify-shop-domain',
}

async function verifyWebhook(body: string, hmacHeader: string, secret: string): Promise<boolean> {
  const encoder = new TextEncoder()
  const keyData = encoder.encode(secret)
  const messageData = encoder.encode(body)
  
  const key = await crypto.subtle.importKey(
    'raw',
    keyData,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )
  
  const signature = await crypto.subtle.sign('HMAC', key, messageData)
  const hash = btoa(String.fromCharCode(...new Uint8Array(signature)))
  
  return hash === hmacHeader
}

// Normalize card name for matching
function normalizeCardName(name: string): string {
  if (!name) return ''
  return name
    .toLowerCase()
    .replace(/[''"]/g, '')
    .replace(/[-–—∙•·]/g, ' ')
    .replace(/[^\w\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

// Match product to card using 3-step logic
async function matchProductToCard(supabase: any, productTitle: string) {
  // Step 1: Exact match
  const { data: exactMatch } = await supabase
    .from('yugioh_cards')
    .select('id, name')
    .eq('name', productTitle)
    .limit(1)
  
  if (exactMatch && exactMatch.length > 0) {
    return { card: exactMatch[0], confidence: 1.0 }
  }

  // Step 2: Fuzzy match
  const normalized = normalizeCardName(productTitle)
  const { data: fuzzyMatch } = await supabase
    .from('yugioh_cards')
    .select('id, name')
    .ilike('name', `%${normalized}%`)
    .limit(1)
  
  if (fuzzyMatch && fuzzyMatch.length > 0) {
    return { card: fuzzyMatch[0], confidence: 0.8 }
  }

  // Step 3: Core name match (remove set codes, editions, etc.)
  const coreTitle = productTitle
    .replace(/\([^)]*\)/g, '')
    .replace(/\[[^\]]*\]/g, '')
    .replace(/\s*-\s*\w+\d+\s*$/i, '')
    .replace(/\s*(Near Mint|LP|MP|HP|Damaged|1st Edition|Unlimited|Limited)\s*/gi, '')
    .trim()

  if (coreTitle !== productTitle) {
    const coreNormalized = normalizeCardName(coreTitle)
    const { data: coreMatch } = await supabase
      .from('yugioh_cards')
      .select('id, name')
      .ilike('name', `%${coreNormalized}%`)
      .limit(1)
    
    if (coreMatch && coreMatch.length > 0) {
      return { card: coreMatch[0], confidence: 0.6 }
    }
  }

  return null
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Get webhook headers
    const topic = req.headers.get('x-shopify-topic')
    const hmac = req.headers.get('x-shopify-hmac-sha256')
    const shopDomain = req.headers.get('x-shopify-shop-domain')

    console.log(`📨 Webhook received: ${topic} from ${shopDomain}`)

    // Get request body
    const bodyText = await req.text()
    
    // Verify webhook signature
    const webhookSecret = Deno.env.get('SHOPIFY_WEBHOOK_SECRET')
    if (!webhookSecret) {
      throw new Error('SHOPIFY_WEBHOOK_SECRET not configured')
    }

if (!(await verifyWebhook(bodyText, hmac || '', webhookSecret))) {
      console.error('❌ Invalid webhook signature')
      return new Response('Unauthorized', { status: 401 })
    }

    console.log('✅ Webhook verified')

    // Parse body
    const data = JSON.parse(bodyText)

    // Initialize Supabase
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseKey)

    // Look up store
    const { data: store, error: storeError } = await supabase
      .from('connected_stores')
      .select('id')
      .eq('shop_domain', shopDomain)
      .single()

    if (storeError || !store) {
      console.error('❌ Store not found:', shopDomain)
      return new Response('Store not found', { status: 404 })
    }

    console.log(`🏪 Store found: ${store.id}`)

    // Handle different webhook topics
    switch (topic) {
      case 'products/create':
        await handleProductCreate(supabase, store.id, data)
        break
      
      case 'products/update':
        await handleProductUpdate(supabase, store.id, data)
        break
      
      case 'products/delete':
        await handleProductDelete(supabase, store.id, data)
        break
      
      case 'inventory_levels/update':
        await handleInventoryUpdate(supabase, store.id, data)
        break
      
      default:
        console.log(`⚠️ Unhandled topic: ${topic}`)
    }

    return new Response(
      JSON.stringify({ success: true }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('❌ Webhook error:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500 
      }
    )
  }
})

// Handle product creation
async function handleProductCreate(supabase: any, storeId: string, product: any) {
  console.log(`➕ Creating product: ${product.title}`)

  for (const variant of product.variants) {
    // Try to match to card
    const matchResult = await matchProductToCard(supabase, product.title)

    const productData = {
      store_id: storeId,
      shopify_product_id: product.id.toString(),
      shopify_variant_id: variant.id.toString(),
      title: product.title,
      variant_title: variant.title !== 'Default Title' ? variant.title : null,
      price: parseFloat(variant.price),
      inventory_quantity: variant.inventory_quantity || 0,
      sku: variant.sku || null,
      images: product.images || [],
      matched_card_id: matchResult ? matchResult.card.id : null,
      matched_card_name: matchResult ? matchResult.card.name : null,
      normalized_card_name: matchResult ? normalizeCardName(matchResult.card.name) : null,
      match_confidence: matchResult ? matchResult.confidence : null
    }

    const { error } = await supabase
      .from('products')
      .insert(productData)

    if (error) {
      console.error('❌ Error inserting product:', error)
    } else {
      console.log(`✅ Product created: ${product.title}${matchResult ? ' (matched!)' : ' (unmatched)'}`)
    }
  }
}

// Handle product update
async function handleProductUpdate(supabase: any, storeId: string, product: any) {
  console.log(`📝 Updating product: ${product.title}`)

  for (const variant of product.variants) {
    // Check if product exists
    const { data: existing } = await supabase
      .from('products')
      .select('id, matched_card_id, title')
      .eq('store_id', storeId)
      .eq('shopify_variant_id', variant.id.toString())
      .single()

    if (existing) {
      // Check if title changed - if so, rematch
      let matchUpdate = {}
      if (existing.title !== product.title && !existing.matched_card_id) {
        const matchResult = await matchProductToCard(supabase, product.title)
        if (matchResult) {
          matchUpdate = {
            matched_card_id: matchResult.card.id,
            matched_card_name: matchResult.card.name,
            normalized_card_name: normalizeCardName(matchResult.card.name),
            match_confidence: matchResult.confidence
          }
        }
      }

      const { error } = await supabase
        .from('products')
        .update({
          title: product.title,
          variant_title: variant.title !== 'Default Title' ? variant.title : null,
          price: parseFloat(variant.price),
          inventory_quantity: variant.inventory_quantity || 0,
          sku: variant.sku || null,
          images: product.images || [],
          ...matchUpdate
        })
        .eq('id', existing.id)

      if (error) {
        console.error('❌ Error updating product:', error)
      } else {
        console.log(`✅ Product updated: ${product.title}`)
      }
    } else {
      // Product doesn't exist, create it
      await handleProductCreate(supabase, storeId, product)
    }
  }
}

// Handle product deletion
async function handleProductDelete(supabase: any, storeId: string, product: any) {
  console.log(`🗑️ Deleting product: ${product.id}`)

  const { error } = await supabase
    .from('products')
    .delete()
    .eq('store_id', storeId)
    .eq('shopify_product_id', product.id.toString())

  if (error) {
    console.error('❌ Error deleting product:', error)
  } else {
    console.log(`✅ Product deleted`)
  }
}

// Handle inventory update
async function handleInventoryUpdate(supabase: any, storeId: string, inventoryData: any) {
  console.log(`📦 Updating inventory for variant: ${inventoryData.inventory_item_id}`)

  const { error } = await supabase
    .from('products')
    .update({
      inventory_quantity: inventoryData.available || 0
    })
    .eq('store_id', storeId)
    .eq('shopify_variant_id', inventoryData.inventory_item_id.toString())

  if (error) {
    console.error('❌ Error updating inventory:', error)
  } else {
    console.log(`✅ Inventory updated`)
  }
}