import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY

const supabase = createClient(supabaseUrl, supabaseKey)

export const handler = async (event) => {
  console.log('🔄 Running daily YGOProDeck card update...\n')
  
  try {
    // Get cards updated in last 14 days (catches new releases + updates)
    const fourteenDaysAgo = new Date()
    fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14)
    const dateString = fourteenDaysAgo.toISOString().split('T')[0]
    
    console.log(`📅 Fetching cards updated since: ${dateString}`)
    
    const response = await fetch(
      `https://db.ygoprodeck.com/api/v7/cardinfo.php?dateregion=tcg_date&startdate=${dateString}`
    )
    const data = await response.json()
    
    const cards = data.data || []
    console.log(`📥 Found ${cards.length} new/updated cards\n`)
    
    if (cards.length === 0) {
      console.log('✅ No updates needed')
      return {
        statusCode: 200,
        body: JSON.stringify({ 
          success: true, 
          message: 'No updates needed',
          cardsUpdated: 0
        })
      }
    }
    
    // Process in batches
    const BATCH_SIZE = 50
    let updated = 0
    
    for (let i = 0; i < cards.length; i += BATCH_SIZE) {
      const batch = cards.slice(i, i + BATCH_SIZE)
      
      console.log(`📦 Processing batch ${Math.floor(i/BATCH_SIZE) + 1}/${Math.ceil(cards.length/BATCH_SIZE)}`)
      
      const cardsToUpsert = batch.map(card => ({
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
        .upsert(cardsToUpsert, { onConflict: 'id' })
      
      if (error) {
        console.error(`❌ Error in batch:`, error.message)
      } else {
        updated += batch.length
        console.log(`✅ Updated ${updated}/${cards.length} cards`)
      }
      
      await new Promise(resolve => setTimeout(resolve, 100))
    }
    
    console.log('\n========================================')
    console.log('✅ Daily update complete!')
    console.log(`📊 Cards updated: ${updated}`)
    console.log('========================================\n')
    
    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ 
        success: true, 
        cardsUpdated: updated
      })
    }
    
  } catch (error) {
    console.error('❌ Update error:', error)
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message })
    }
  }
}