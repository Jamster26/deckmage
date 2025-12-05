import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing environment variables!')
}

const supabase = createClient(supabaseUrl, supabaseKey)

// BATCH SIZE - process this many products per function call
const BATCH_SIZE = 250

// ===== COPY YOUR HELPER FUNCTIONS =====

function fixCommonCardNameVariants(name) {
  const fixes = {
    'blue eyes white dragon': 'Blue-Eyes White Dragon',
    'blue eyes black dragon': 'Blue-Eyes Black Dragon', 
    'red eyes black dragon': 'Red-Eyes Black Dragon',
    'red eyes b dragon': 'Red-Eyes B. Dragon',
    'red eyes b. dragon': 'Red-Eyes B. Dragon',
    'dark magician girl': 'Dark Magician Girl',
    'blue eyes ultimate dragon': 'Blue-Eyes Ultimate Dragon',
    'red eyes darkness metal dragon': 'Red-Eyes Darkness Metal Dragon',
    'cyber end dragon': 'Cyber End Dragon',
    'cyber twin dragon': 'Cyber Twin Dragon'
  };
  
  const normalized = name.toLowerCase().trim();
  
  if (fixes[normalized]) {
    console.log(`✏️  Auto-corrected: "${name}" → "${fixes[normalized]}"`);
    return fixes[normalized];
  }
  
  return name;
}

function extractCardName(title) {
  let cleaned = title
  
  cleaned = cleaned.replace(/\b[A-Z]{2,5}-[A-Z]?\d{3,4}\b/gi, '')
  cleaned = cleaned.replace(/\s*-?\s*(Near Mint|Lightly Played|Moderately Played|Heavily Played|Damaged|Mint|NM|LP|MP|HP|DMG)\s*/gi, '')
  cleaned = cleaned.replace(/\s*-?\s*(1st Edition|Limited Edition|Unlimited|1st)\s*/gi, '')
  cleaned = cleaned.replace(/\s*-?\s*(Starlight Rare|Ghost Rare|Ultimate Rare|Ultra Rare|Super Rare|Secret Rare|Prismatic Secret|Quarter Century|Collector's Rare|Rare|Common)\s*/gi, '')
  cleaned = cleaned.replace(/\s+/g, ' ').trim()
  cleaned = fixCommonCardNameVariants(cleaned)
  
  return cleaned
}

const normalizeCardName = (str) => {
  if (!str) return '';
  return str
    .toLowerCase()
    .replace(/[''"]/g, '')
    .replace(/[-–—∙•·]/g, ' ')
    .replace(/[^\w\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
};

async function getCardData(cardName) {
  if (!cardName?.trim()) return null;

  const searchName = cardName.trim();
  console.log(`🔍 Looking up: "${searchName}"`);

  try {
    const { data: localCard, error: localError } = await supabase
      .from('yugioh_cards')
      .select('*')
      .or(`name.ilike.%${searchName}%,normalized_name.eq.${normalizeCardName(searchName)}`)
      .limit(10);

    if (localCard && localCard.length > 0) {
      const scored = localCard.map(card => {
        const normCard = normalizeCardName(card.name);
        const normSearch = normalizeCardName(searchName);
        const exact = normCard === normSearch;
        const includes = normCard.includes(normSearch);
        const startsWith = normCard.startsWith(normSearch.split(' ')[0]);
        
        return {
          card,
          score: exact ? 100 : includes ? 80 : startsWith ? 50 : 10
        };
      }).sort((a, b) => b.score - a.score);

      const best = scored[0];
      
      if (best.score >= 50) {
        console.log(`✅ Found in local DB: "${best.card.name}" (score: ${best.score})`);
        return {
          officialName: best.card.name,
          image: best.card.image_url,
          type: best.card.type,
          id: best.card.id,
          description: best.card.description,
          race: best.card.race,
          attribute: best.card.attribute,
          atk: best.card.atk,
          def: best.card.def,
          level: best.card.level,
          sets: best.card.card_sets
        };
      }
    }

    console.log(`⚠️ Not in local DB, trying YGOProDeck API...`);
    
    let res = await fetch(`https://db.ygoprodeck.com/api/v7/cardinfo.php?name=${encodeURIComponent(searchName)}`);
    let json = await res.json();

    if (!json.error && json.data?.[0]) {
      const card = json.data[0];
      console.log(`✅ Found via API: "${card.name}"`);
      
      await supabase.from('yugioh_cards').upsert({
        id: card.id,
        name: card.name,
        type: card.type,
        race: card.race,
        attribute: card.attribute,
        atk: card.atk ?? null,
        def: card.def ?? null,
        level: card.level ?? null,
        scale: card.scale ?? null,
        linkval: card.linkval ?? null,
        description: card.desc,
        image_url: card.card_images?.[0]?.image_url,
        image_url_small: card.card_images?.[0]?.image_url_small,
        image_url_cropped: card.card_images?.[0]?.image_url_cropped,
        archetype: card.archetype,
        card_sets: card.card_sets,
        card_prices: card.card_prices,
        updated_at: new Date().toISOString()
      }, { onConflict: 'id' });
      
      return {
        officialName: card.name,
        image: card.card_images?.[0]?.image_url,
        type: card.type,
        id: card.id,
        description: card.desc,
        race: card.race,
        attribute: card.attribute,
        atk: card.atk,
        def: card.def,
        level: card.level,
        sets: card.card_sets
      };
    }

    console.log(`⚠️ Trying fuzzy API search...`);
    const fuzzyQuery = searchName.split(/\s+/).slice(0, 3).join(' ');
    res = await fetch(`https://db.ygoprodeck.com/api/v7/cardinfo.php?fname=${encodeURIComponent(fuzzyQuery)}&num=10`);
    json = await res.json();

    if (json.data && json.data.length > 0) {
      const card = json.data[0];
      console.log(`⚠️ Fuzzy match: "${card.name}"`);
      
      await supabase.from('yugioh_cards').upsert({
        id: card.id,
        name: card.name,
        type: card.type,
        race: card.race,
        attribute: card.attribute,
        atk: card.atk ?? null,
        def: card.def ?? null,
        level: card.level ?? null,
        description: card.desc,
        image_url: card.card_images?.[0]?.image_url,
        image_url_small: card.card_images?.[0]?.image_url_small,
        archetype: card.archetype,
        card_sets: card.card_sets,
        updated_at: new Date().toISOString()
      }, { onConflict: 'id' });
      
      return {
        officialName: card.name,
        image: card.card_images?.[0]?.image_url,
        type: card.type,
        id: card.id
      };
    }

    console.log(`❌ Card not found anywhere`);
    return null;

  } catch (err) {
    console.error('❌ Error fetching card data:', err.message);
    return null;
  }
}

async function getCardDataCached(cardName, productTitle, cache) {
  const key = normalizeCardName(cardName);
  
  if (cache.has(key)) {
    console.log(`   ♻️  Using sync session cache`);
    return cache.get(key);
  }
  
  const result = await getCardData(cardName);
  if (result) {
    cache.set(key, result);
  }
  return result;
}

// ===== MAIN BACKGROUND WORKER =====

export const handler = async (event, context) => {
  console.log('\n========================================')
  console.log('🔄 BACKGROUND SYNC WORKER STARTED')
  console.log('========================================\n')
  
  try {
    const { jobId } = JSON.parse(event.body)
    
    if (!jobId) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Job ID required' })
      }
    }
    
    // Get job details
    const { data: job, error: jobError } = await supabase
      .from('sync_jobs')
      .select(`
        *,
        connected_stores (
          shop_domain,
          access_token
        )
      `)
      .eq('id', jobId)
      .single()
    
    if (jobError || !job) {
      console.error('❌ Job not found:', jobError)
      return {
        statusCode: 404,
        body: JSON.stringify({ error: 'Job not found' })
      }
    }
    
    const { shop_domain, access_token } = job.connected_stores
    
    console.log(`📊 Processing job ${jobId}`)
    console.log(`📦 Store: ${shop_domain}`)
    console.log(`📈 Progress: ${job.processed_products}/${job.total_products}`)
    
    // Update status to processing (first time only)
    if (job.status === 'pending') {
      await supabase
        .from('sync_jobs')
        .update({ status: 'processing' })
        .eq('id', jobId)
    }
    
    // Build Shopify API URL with cursor pagination
    let shopifyUrl = `https://${shop_domain}/admin/api/2024-01/products.json?limit=${BATCH_SIZE}`
    
    if (job.last_shopify_cursor) {
      shopifyUrl += `&page_info=${job.last_shopify_cursor}`
    }
    
    console.log(`📡 Fetching from Shopify...`)
    
    const shopifyResponse = await fetch(shopifyUrl, {
      headers: {
        'X-Shopify-Access-Token': access_token,
        'Content-Type': 'application/json'
      }
    })
    
    if (!shopifyResponse.ok) {
      throw new Error(`Shopify API error: ${shopifyResponse.status}`)
    }
    
    const { products } = await shopifyResponse.json()
    
    console.log(`📦 Fetched ${products.length} products`)
    
    // Get next page cursor from Link header
    const linkHeader = shopifyResponse.headers.get('Link')
    let nextCursor = null
    
    if (linkHeader) {
      const nextMatch = linkHeader.match(/<[^>]*page_info=([^>&]+)[^>]*>;\s*rel="next"/)
      if (nextMatch) {
        nextCursor = nextMatch[1]
        console.log(`🔗 Next cursor found: ${nextCursor.substring(0, 20)}...`)
      } else {
        console.log(`✅ No more pages - this is the last batch`)
      }
    }
    
    // Process products
    console.log(`\n⚙️ Processing ${products.length} products...\n`)
    
    const cardCache = new Map()
    const productsToInsert = []
    
    for (const product of products) {
      console.log(`📦 "${product.title}"`)
      
      const matchedCardName = extractCardName(product.title)
      let productImages = product.images
      let finalCardName = matchedCardName
      
      // Check if we already have this product
      const { data: existingProduct } = await supabase
        .from('products')
        .select('images, matched_card_name')
        .eq('store_id', job.store_id)
        .eq('shopify_product_id', product.id.toString())
        .single()
      
      if (!productImages || productImages.length === 0) {
        if (existingProduct?.images && existingProduct.images.length > 0) {
          productImages = existingProduct.images
          finalCardName = existingProduct.matched_card_name
          console.log(`   ♻️  Using cached image`)
        } else {
          const cardData = await getCardDataCached(matchedCardName, product.title, cardCache)
          
          if (cardData) {
            finalCardName = cardData.officialName || matchedCardName
            
            if (cardData.image) {
              productImages = [{ src: cardData.image }]
              console.log(`   ✅ Added card image`)
            }
          }
        }
      } else {
        if (existingProduct?.matched_card_name) {
          finalCardName = existingProduct.matched_card_name
        } else {
          const cardData = await getCardDataCached(matchedCardName, product.title, cardCache)
          if (cardData) {
            finalCardName = cardData.officialName || matchedCardName
          }
        }
      }
      
      productsToInsert.push({
        store_id: job.store_id,
        shopify_product_id: product.id.toString(),
        title: product.title,
        vendor: product.vendor,
        product_type: product.product_type,
        variants: product.variants,
        images: productImages,
        matched_card_name: finalCardName,
        normalized_card_name: normalizeCardName(finalCardName),
        updated_at: new Date().toISOString()
      })
    }
    
    console.log(`\n💾 Saving ${productsToInsert.length} products to database...`)
    
    // Upsert products (insert or update if exists)
    const { error: insertError } = await supabase
      .from('products')
      .upsert(productsToInsert, {
        onConflict: 'store_id,shopify_product_id',
        ignoreDuplicates: false
      })
    
    if (insertError) {
      console.error('❌ Insert error:', insertError)
      throw insertError
    }
    
    console.log(`✅ Saved successfully`)
    
    // Update job progress
    const newProcessed = job.processed_products + products.length
    const hasMore = nextCursor !== null
    
    console.log(`\n📊 Progress: ${newProcessed}/${job.total_products} (${Math.round(newProcessed/job.total_products*100)}%)`)
    
    if (hasMore) {
      // More products to process - update and trigger next batch
      console.log(`🔄 More products remaining, updating job and triggering next batch...`)
      
      await supabase
        .from('sync_jobs')
        .update({
          processed_products: newProcessed,
          last_shopify_cursor: nextCursor
        })
        .eq('id', jobId)
      
      // Trigger self again for next batch
      const nextBatchUrl = `${process.env.URL}/.netlify/functions/process-sync-job`
      console.log(`🚀 Triggering next batch at: ${nextBatchUrl}`)
      
      await fetch(nextBatchUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobId })
      })
      
      console.log(`✅ Next batch triggered`)
      
    } else {
      // All done!
      console.log(`\n🎉 SYNC COMPLETE!`)
      console.log(`📊 Total processed: ${newProcessed} products`)
      
      await supabase
        .from('sync_jobs')
        .update({
          status: 'completed',
          processed_products: newProcessed,
          total_products: newProcessed,
          completed_at: new Date().toISOString()
        })
        .eq('id', jobId)
      
      console.log(`✅ Job marked as completed`)
    }
    
    console.log('\n========================================')
    console.log('✅ BACKGROUND WORKER FINISHED')
    console.log('========================================\n')
    
    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        success: true,
        processed: newProcessed,
        total: job.total_products,
        hasMore
      })
    }
    
  } catch (error) {
    console.error('\n❌ WORKER ERROR:', error)
    
    // Mark job as failed
    if (event.body) {
      try {
        const { jobId } = JSON.parse(event.body)
        await supabase
          .from('sync_jobs')
          .update({
            status: 'failed',
            error_message: error.message
          })
          .eq('id', jobId)
      } catch (e) {
        console.error('Failed to update job status:', e)
      }
    }
    
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ error: error.message })
    }
  }
}