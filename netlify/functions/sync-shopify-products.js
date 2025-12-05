import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing environment variables!')
}

const supabase = createClient(supabaseUrl, supabaseKey)

export const handler = async (event) => {
  console.log('\n========================================')
  console.log('🚀 SYNC JOB CREATION STARTED')
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

    console.log(`📦 Store: ${shopDomain}`)
    console.log(`🔍 Getting total product count...`)

    // Get total product count from Shopify
    const countResponse = await fetch(
      `https://${shopDomain}/admin/api/2024-01/products/count.json`,
      {
        headers: {
          'X-Shopify-Access-Token': accessToken,
          'Content-Type': 'application/json'
        }
      }
    )

    if (!countResponse.ok) {
      throw new Error(`Shopify API error: ${countResponse.status}`)
    }

    const { count } = await countResponse.json()
    console.log(`📊 Store has ${count} total products`)

    // Create sync job in database
    console.log(`💾 Creating sync job...`)
    
    const { data: job, error: jobError } = await supabase
      .from('sync_jobs')
      .insert({
        store_id: storeId,
        status: 'pending',
        total_products: count,
        processed_products: 0,
        failed_products: 0
      })
      .select()
      .single()

    if (jobError) {
      console.error('❌ Failed to create job:', jobError)
      throw new Error(`Failed to create sync job: ${jobError.message}`)
    }

    console.log(`✅ Created job: ${job.id}`)
    console.log(`🚀 Triggering background worker...`)

    // Trigger background worker function
    const workerUrl = `${process.env.URL}/.netlify/functions/process-sync-job`
    
    const workerResponse = await fetch(workerUrl, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ jobId: job.id })
    })

    if (!workerResponse.ok) {
      const errorText = await workerResponse.text()
      console.error('❌ Worker response:', errorText)
      throw new Error('Failed to start background worker')
    }

    console.log(`✅ Background worker started successfully`)
    console.log('\n========================================')
    console.log('✅ SYNC JOB CREATED - PROCESSING IN BACKGROUND')
    console.log('========================================\n')

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({
        success: true,
        jobId: job.id,
        totalProducts: count,
        message: `Sync started! Processing ${count} products in background.`
      })
    }

  } catch (error) {
    console.error('\n❌ SYNC JOB CREATION ERROR:', error)
    
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({ 
        error: error.message,
        details: 'Failed to create sync job'
      })
    }
  }
}