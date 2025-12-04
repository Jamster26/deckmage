import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing environment variables!')
}

const supabase = createClient(supabaseUrl, supabaseKey)

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

// 🆕 NEW: Get card data from local database first, API fallback
async function getCardData(cardName) {
  if (!cardName?.trim()) return null;

  const searchName = cardName.trim();
  console.log(`🔍 Looking up: "${searchName}"`);

  try {
    // STEP 1: Check local database first (99.9% of cases)
    const { data: localCard, error: localError } = await supabase
      .from('yugioh_cards')
      .select('*')
      .or(`name.ilike.%${searchName}%,normalized_name.eq.${normalizeCardName(searchName)}`)
      .limit(10);

    if (localCard && localCard.length > 0) {
      // Score and pick best match
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

    // STEP 2: Not in database - fallback to API (rare - new cards only)
    console.log(`⚠️ Not in local DB, trying YGOProDeck API...`);
    
    let res = await fetch(`https://db.ygoprodeck.com/api/v7/cardinfo.php?name=${encodeURIComponent(searchName)}`);
    let json = await res.json();

    if (!json.error && json.data?.[0]) {
      const card = json.data[0];
      console.log(`✅ Found via API: "${card.name}"`);
      
      // STEP 3: Save to local database for next time
      console.log(`💾 Caching card in local database...`);
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
      
      console.log(`✅ Cached for future use`);
      
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

    // Try fuzzy search on API as last resort
    console.log(`⚠️ Trying fuzzy API search...`);
    const fuzzyQuery = searchName.split(/\s+/).slice(0, 3).join(' ');
    res = await fetch(`https://db.ygoprodeck.com/api/v7/cardinfo.php?fname=${encodeURIComponent(fuzzyQuery)}&num=10`);
    json = await res.json();

    if (json.data && json.data.length > 0) {
      const card = json.data[0];
      console.log(`⚠️ Fuzzy match: "${card.name}"`);
      
      // Cache this too
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

export const handler = async (event) => {
  console.log('\n========================================')
  console.log('🚀 SYNC FUNCTION STARTED')
  console.log('========================================\n')
  
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

    console.log(`📦 Fetching products from Shopify: ${shopDomain}`)

    const shopifyResponse = await fetch(
      `https://${shopDomain}/admin/api/2024-01/products.json?limit=250`,
      {
        method: 'GET',
        headers: {
          'X-Shopify-Access-Token': accessToken,
          'Content-Type': 'application/json'
        }
      }
    )

    if (!shopifyResponse.ok) {
      throw new Error(`Shopify API error: ${shopifyResponse.status} ${shopifyResponse.statusText}`)
    }

    const shopifyData = await shopifyResponse.json()
    const products = shopifyData.products || []

    console.log(`📦 Processing ${products.length} products...\n`)

    const cardCache = new Map()
    const productsToInsert = []
    const BATCH_SIZE = 10

    for (let i = 0; i < products.length; i += BATCH_SIZE) {
      const batch = products.slice(i, i + BATCH_SIZE)
      
      console.log(`📦 Processing batch ${Math.floor(i/BATCH_SIZE) + 1}/${Math.ceil(products.length/BATCH_SIZE)}`)
      
      const batchResults = await Promise.all(
        batch.map(async (product) => {
          console.log(`\n====================================`)
          console.log(`📦 Product: "${product.title}"`)
          
          const matchedCardName = extractCardName(product.title)
          console.log(`📝 Extracted: "${matchedCardName}"`)

          let productImages = product.images
          let finalCardName = matchedCardName
          let cardData = null

          // Check database cache first
          const { data: existingProduct } = await supabase
            .from('products')
            .select('images, matched_card_name')
            .eq('store_id', storeId)
            .eq('shopify_product_id', product.id.toString())
            .single()

          if (!productImages || productImages.length === 0) {
            console.log(`🔍 No Shopify image`)
            
            if (existingProduct?.images && existingProduct.images.length > 0) {
              productImages = existingProduct.images
              finalCardName = existingProduct.matched_card_name
              console.log(`♻️  Using cached product image`)
            } else {
              cardData = await getCardDataCached(matchedCardName, product.title, cardCache)
              
              if (cardData) {
                finalCardName = cardData.officialName || matchedCardName
                
                if (cardData.image) {
                  productImages = [{ src: cardData.image }]
                  console.log(`✅ Added card image`)
                }
              } else {
                console.log(`⚠️  No card data found`)
              }
            }
          } else {
            console.log(`✅ Has Shopify image`)
            
            if (existingProduct?.matched_card_name) {
              finalCardName = existingProduct.matched_card_name
            } else {
              cardData = await getCardDataCached(matchedCardName, product.title, cardCache)
              if (cardData) {
                finalCardName = cardData.officialName || matchedCardName
              }
            }
          }

          console.log(`📝 Final card name: "${finalCardName}"`)
          console.log(`====================================\n`)

          return {
            store_id: storeId,
            shopify_product_id: product.id.toString(),
            title: product.title,
            vendor: product.vendor,
            product_type: product.product_type,
            variants: product.variants,
            images: productImages,
            matched_card_name: finalCardName,
            normalized_card_name: normalizeCardName(finalCardName),
            updated_at: new Date().toISOString()
          }
        })
      )
      
      productsToInsert.push(...batchResults)
      
      console.log(`✅ Completed batch ${Math.floor(i/BATCH_SIZE) + 1}/${Math.ceil(products.length/BATCH_SIZE)}`)
      
      if (i + BATCH_SIZE < products.length) {
        await new Promise(resolve => setTimeout(resolve, 1000))
      }
    }

    console.log(`\n💾 Saving to database...`)

    await supabase
      .from('products')
      .delete()
      .eq('store_id', storeId)

    const { error: insertError } = await supabase
      .from('products')
      .insert(productsToInsert)

    if (insertError) {
      throw new Error(`Database error: ${insertError.message}`)
    }

    console.log(`✅ Successfully synced ${products.length} products\n`)

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
    console.error('❌ Sync products error:', error)
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message })
    }
  }
}