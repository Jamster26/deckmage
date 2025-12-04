import { createClient } from '@supabase/supabase-js'
import pLimit from 'p-limit'  // ADD THIS LINE


// Check for environment variables
const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing environment variables!')
  console.error('VITE_SUPABASE_URL:', supabaseUrl ? 'Found' : 'Missing')
  console.error('SUPABASE_SERVICE_ROLE_KEY:', supabaseKey ? 'Found' : 'Missing')
}

const supabase = createClient(supabaseUrl, supabaseKey)



function extractCardName(title) {
  let cleaned = title
  
  // Remove set codes (e.g., "LOB-005", "SDK-001")
  cleaned = cleaned.replace(/\s*[A-Z]{2,5}-[A-Z]?\d{3,4}\s*/gi, '')
  
  // Remove conditions (including "Mint")
  cleaned = cleaned.replace(/\s*-?\s*(Near Mint|Lightly Played|Moderately Played|Heavily Played|Damaged|Mint|NM|LP|MP|HP|DMG)\s*/gi, '')
  
  // Remove editions
  cleaned = cleaned.replace(/\s*-?\s*(1st Edition|Limited Edition|Unlimited|1st)\s*/gi, '')
  
  // Remove rarity (in order from longest to shortest)
  cleaned = cleaned.replace(/\s*-?\s*(Starlight Rare|Ghost Rare|Ultimate Rare|Ultra Rare|Super Rare|Secret Rare|Prismatic Secret|Quarter Century|Collector's Rare|Rare|Common)\s*/gi, '')
  
  // Remove any trailing/leading dashes and spaces
  cleaned = cleaned.replace(/^\s*-\s*|\s*-\s*$/g, '').trim()
  
  // Clean up multiple spaces
  cleaned = cleaned.replace(/\s+/g, ' ')
  
  return cleaned
}

const normalizeCardName = (str) => {
  if (!str) return '';
  return str
    .toLowerCase()
    .replace(/[’'"]/g, '')           // smart quotes & apostrophes
    .replace(/[-–—∙•·]/g, ' ')       // all dash-like characters → space
    .replace(/[^\w\s]/g, '')         // remove remaining punctuation
    .replace(/\s+/g, ' ')            // collapse whitespace
    .trim();
};

async function fetchCardData(cardName, productTitle = '') {
  if (!cardName?.trim()) return null;

  const originalName = cardName.trim();
  const normalizedInput = normalizeCardName(originalName);

  console.log(`\n🔍 Searching for: "${originalName}" → normalized: "${normalizedInput}"`);

  // Helper to extract result
  const extractCard = (card) => ({
    officialName: card.name,
    image: card.card_images?.[0]?.image_url || card.card_images?.[0]?.image_url_cropped || null,
    type: card.type,
    id: card.id
  });

  try {
    // Step 1: Try exact API match (handles official names perfectly)
    let res = await fetch(`https://db.ygoprodeck.com/api/v7/cardinfo.php?name=${encodeURIComponent(originalName)}`);
    let json = await res.json();

    if (!json.error && json.data?.[0]) {
      console.log(`✅ Exact match: "${json.data[0].name}"`);
      return extractCard(json.data[0]);
    }

    // Step 2: Fuzzy search with fname (their "fuzzy" endpoint)
    const searchWords = originalName.split(/\s+/).slice(0, 4); // more flexible than fixed 3
    const fuzzyQuery = searchWords.join(' ');

    res = await fetch(`https://db.ygoprodeck.com/api/v7/cardinfo.php?fname=${encodeURIComponent(fuzzyQuery)}&num=50&offset=0`);
    json = await res.json();

    if (!json.data?.length) {
      console.log(`❌ No results even with fuzzy search`);
      return null;
    }

    const candidates = json.data;

    // Step 3: Score candidates by normalized name match quality
    const scored = candidates
      .map(card => {
        const norm = normalizeCardName(card.name);
        const exact = norm === normalizedInput;
        const includes = norm.includes(normalizedInput);
        const startsWith = norm.startsWith(normalizedInput.split(' ')[0]);
        const wordMatchRatio = normalizedInput.split(' ').filter(w => norm.includes(w)).length;

        return {
          card,
          score: exact ? 100 : 
                 includes ? 80 + wordMatchRatio * 5 :
                 startsWith ? 50 + wordMatchRatio * 3 : 
                 wordMatchRatio * 10
        };
      })
      .sort((a, b) => b.score - a.score);

    const best = scored[0];
    
    if (best.score >= 80) {
      console.log(`✅ Strong match (${best.score}): "${best.card.name}"`);
      return extractCard(best.card);
    } else if (best.score >= 50) {
      console.log(`⚠️  Weak match (${best.score}): "${best.card.name}" (from "${originalName}")`);
      return extractCard(best.card); // still return, but you could warn user
    } else {
      console.log(`❌ Best weak candidate: "${best.card.name}" (score: ${best.score}) — rejecting`);
      console.log(`   Top 3: ${scored.slice(0,3).map(s => `"${s.card.name}"`).join(', ')}`);
      return null;
    }

  } catch (err) {
    console.error('API error:', err.message);
    return null;
  }
}

// ADD THIS NEW FUNCTION RIGHT AFTER:
async function fetchCardDataCached(cardName, productTitle, cache) {
  const key = normalizeCardName(cardName);
  
  if (cache.has(key)) {
    console.log(`   ♻️  Using cached result`);
    return cache.get(key);
  }
  
  const result = await fetchCardData(cardName, productTitle);
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

// Fetch all products from Shopify
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

    // ADD THESE TWO LINES HERE:
    const limit = pLimit(10); // Max 10 concurrent API calls
    const cardCache = new Map(); // In-memory cache for this sync

    // NOW FIND YOUR productsToInsert section and wrap it:
    const productsToInsert = await Promise.all(
      products.map(product => limit(async () => {  // ADD limit() wrapper here
        console.log(`\n====================================`)
        console.log(`📦 Product: "${product.title}"`)
        
        const matchedCardName = extractCardName(product.title)
        console.log(`📝 Extracted: "${matchedCardName}"`)

        let productImages = product.images
        let finalCardName = matchedCardName

        if (!productImages || productImages.length === 0) {
          console.log(`🔍 No Shopify image`)
          
          const { data: existingProduct } = await supabase
            .from('products')
            .select('images, matched_card_name')
            .eq('store_id', storeId)
            .eq('shopify_product_id', product.id.toString())
            .single()
          
          if (existingProduct?.images && existingProduct.images.length > 0) {
            productImages = existingProduct.images
            finalCardName = existingProduct.matched_card_name
            console.log(`✅ Using existing database image`)
          } else {
            // CHANGE THIS LINE:
            // const cardData = await fetchCardData(matchedCardName, product.title)
            // TO THIS:
            const cardData = await fetchCardDataCached(matchedCardName, product.title, cardCache)
            
            finalCardName = cardData?.officialName || matchedCardName
            
            if (cardData?.image) {
              productImages = [{ src: cardData.image }]
              console.log(`✅ Added YGOProDeck image`)
            }
          }
        } else {
          console.log(`✅ Has Shopify image`)
          // CHANGE THIS LINE TOO:
          // const cardData = await fetchCardData(matchedCardName, product.title)
          // TO THIS:
          const cardData = await fetchCardDataCached(matchedCardName, product.title, cardCache)
          finalCardName = cardData?.officialName || matchedCardName
        }

        console.log(`📝 Final card name: "${finalCardName}"`)
        console.log(`📝 Normalized: "${normalizeCardName(finalCardName)}"`)
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
      }))  // CLOSE the limit() wrapper here
    )

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