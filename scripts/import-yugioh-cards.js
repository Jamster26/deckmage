import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

// Load environment variables from .env file
const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
config({ path: join(__dirname, '..', '.env.local') })

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing environment variables!')
  console.error('VITE_SUPABASE_URL:', supabaseUrl ? 'Found' : 'Missing')
  console.error('SUPABASE_SERVICE_ROLE_KEY:', supabaseKey ? 'Found' : 'Missing')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseKey)

async function importAllCards() {
  console.log('🚀 Starting YGOProDeck card import...\n')
  
  try {
    // Fetch all cards from YGOProDeck
    console.log('📥 Fetching all cards from YGOProDeck API...')
    const response = await fetch('https://db.ygoprodeck.com/api/v7/cardinfo.php')
    const data = await response.json()
    
    const cards = data.data || []
    console.log(`✅ Fetched ${cards.length} cards\n`)
    
    // Process in batches to avoid timeout
    const BATCH_SIZE = 100
    let imported = 0
    let errors = 0
    
    for (let i = 0; i < cards.length; i += BATCH_SIZE) {
      const batch = cards.slice(i, i + BATCH_SIZE)
      
      console.log(`📦 Processing batch ${Math.floor(i/BATCH_SIZE) + 1}/${Math.ceil(cards.length/BATCH_SIZE)} (${batch.length} cards)`)
      
      const cardsToInsert = batch.map(card => ({
        id: card.id,
        name: card.name,
        type: card.type || null,
        race: card.race || null,
        attribute: card.attribute || null,
        atk: card.atk ?? null,
        def: card.def ?? null,
        level: card.level ?? null,
        scale: card.scale ?? null,
        linkval: card.linkval ?? null,
        description: card.desc || null,
        image_url: card.card_images?.[0]?.image_url || null,
        image_url_small: card.card_images?.[0]?.image_url_small || null,
        image_url_cropped: card.card_images?.[0]?.image_url_cropped || null,
        archetype: card.archetype || null,
        card_sets: card.card_sets || null,
        card_prices: card.card_prices || null,
        updated_at: new Date().toISOString()
      }))
      
      const { error } = await supabase
        .from('yugioh_cards')
        .upsert(cardsToInsert, { onConflict: 'id' })
      
      if (error) {
        console.error(`❌ Error in batch ${Math.floor(i/BATCH_SIZE) + 1}:`, error.message)
        errors += batch.length
      } else {
        imported += batch.length
        console.log(`✅ Imported ${imported}/${cards.length} cards`)
      }
      
      // Small delay to be nice to database
      await new Promise(resolve => setTimeout(resolve, 100))
    }
    
    console.log('\n========================================')
    console.log('🎉 IMPORT COMPLETE!')
    console.log(`✅ Successfully imported: ${imported} cards`)
    console.log(`❌ Errors: ${errors} cards`)
    console.log('========================================\n')
    
  } catch (error) {
    console.error('💥 Fatal error:', error)
    process.exit(1)
  }
}

// Run import
importAllCards()