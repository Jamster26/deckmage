import { createClient } from '@supabase/supabase-js'
import fs from 'fs'
import dotenv from 'dotenv'
import { stringify } from 'csv-stringify/sync'

dotenv.config({ path: '.env.local' })

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

async function exportToShopifyCSV() {
  console.log('📦 Fetching all cards from database...')
  
  let allCards = []
  let page = 0
  const pageSize = 1000
  let hasMore = true
  
  while (hasMore) {
    const { data: cards, error } = await supabase
      .from('yugioh_cards')
      .select('*')
      .order('name')
      .range(page * pageSize, (page + 1) * pageSize - 1)
    
    if (error) {
      console.error('❌ Error:', error)
      return
    }
    
    if (!cards || cards.length === 0) {
      hasMore = false
    } else {
      allCards = allCards.concat(cards)
      console.log(`   Fetched ${allCards.length} cards so far...`)
      page++
      
      if (cards.length < pageSize) {
        hasMore = false
      }
    }
  }
  
  const cards = allCards
  console.log(`\n✅ Total fetched: ${cards.length} cards`)
  console.log('📝 Building CSV with proper library...')
  
  // Build rows array
  const rows = cards.map((card, index) => {
    // Clean values
    const handle = card.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
    const title = (card.name || '').substring(0, 255)
    const description = (card.description || '').replace(/[\r\n]+/g, ' ').substring(0, 5000)
    
    const tags = [
      card.type,
      card.race,
      card.attribute,
      card.archetype
    ].filter(Boolean).join(', ')
    
    if ((index + 1) % 1000 === 0) {
      console.log(`   Processed ${index + 1}/${cards.length} cards...`)
    }
    
    // Return row as array (library handles escaping)
    return [
      handle,                    // Handle
      title,                     // Title
      description,               // Body (HTML)
      'Konami',                  // Vendor
      'Yu-Gi-Oh! Singles',       // Type
      tags,                      // Tags
      'true',                    // Published
      'Title',                   // Option1 Name
      'Default Title',           // Option1 Value
      `YGO-${card.id}`,         // Variant SKU
      '0',                       // Variant Grams
      'shopify',                 // Variant Inventory Tracker
      '100',                     // Variant Inventory Qty
      'deny',                    // Variant Inventory Policy
      'manual',                  // Variant Fulfillment Service
      '9.99',                    // Variant Price
      '',                        // Variant Compare At Price
      'true',                    // Variant Requires Shipping
      'true',                    // Variant Taxable
      '',                        // Variant Barcode
      card.image_url || '',      // Image Src
      '1',                       // Image Position
      title,                     // Image Alt Text
      'false',                   // Gift Card
      title,                     // SEO Title
      description.substring(0, 160), // SEO Description
      '',                        // Google Shopping / Google Product Category
      '',                        // Google Shopping / Gender
      '',                        // Google Shopping / Age Group
      '',                        // Google Shopping / MPN
      '',                        // Google Shopping / AdWords Grouping
      '',                        // Google Shopping / AdWords Labels
      '',                        // Google Shopping / Condition
      '',                        // Google Shopping / Custom Product
      '',                        // Google Shopping / Custom Label 0
      '',                        // Google Shopping / Custom Label 1
      '',                        // Google Shopping / Custom Label 2
      '',                        // Google Shopping / Custom Label 3
      '',                        // Google Shopping / Custom Label 4
      '',                        // Variant Image
      'g',                       // Variant Weight Unit
      '',                        // Variant Tax Code
      '5.00',                    // Cost per item
      'active'                   // Status
    ]
  })
  
  // Generate CSV using library (handles all escaping automatically)
  const csv = stringify(rows, {
    header: true,
    columns: [
      'Handle', 'Title', 'Body (HTML)', 'Vendor', 'Type', 'Tags', 'Published',
      'Option1 Name', 'Option1 Value', 'Variant SKU', 'Variant Grams',
      'Variant Inventory Tracker', 'Variant Inventory Qty', 'Variant Inventory Policy',
      'Variant Fulfillment Service', 'Variant Price', 'Variant Compare At Price',
      'Variant Requires Shipping', 'Variant Taxable', 'Variant Barcode',
      'Image Src', 'Image Position', 'Image Alt Text', 'Gift Card',
      'SEO Title', 'SEO Description', 'Google Shopping / Google Product Category',
      'Google Shopping / Gender', 'Google Shopping / Age Group', 'Google Shopping / MPN',
      'Google Shopping / AdWords Grouping', 'Google Shopping / AdWords Labels',
      'Google Shopping / Condition', 'Google Shopping / Custom Product',
      'Google Shopping / Custom Label 0', 'Google Shopping / Custom Label 1',
      'Google Shopping / Custom Label 2', 'Google Shopping / Custom Label 3',
      'Google Shopping / Custom Label 4', 'Variant Image', 'Variant Weight Unit',
      'Variant Tax Code', 'Cost per item', 'Status'
    ]
  })
  
  const filename = 'shopify-import.csv'
  fs.writeFileSync(filename, csv)
  
  console.log(`\n✅ Created ${filename}`)
  console.log(`📦 ${cards.length} products ready to import`)
  console.log(`📊 File size: ${(fs.statSync(filename).size / 1024 / 1024).toFixed(2)} MB`)
  console.log('\n✅ CSV properly formatted with library - should import successfully!\n')
}

exportToShopifyCSV().catch(console.error)