import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY

const supabase = createClient(supabaseUrl, supabaseKey)

export const handler = async (event) => {
  console.log('🚀 Creating sync job...')
  
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

    // Get total product count
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
    console.log(`📊 Total products: ${count}`)

    // Create sync job with ALL the data it needs
    const { data: job, error: jobError } = await supabase
      .from('sync_jobs')
      .insert({
        store_id: storeId,
        status: 'pending',
        total_products: count,
        processed_products: 0,
        failed_products: 0,
        started_at: new Date().toISOString(),
        // Store the credentials in the job itself
        metadata: {
          accessToken,
          shopDomain
        }
      })
      .select()
      .single()

    if (jobError) throw jobError

    console.log(`✅ Job created: ${job.id}`)

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
        message: `Sync job created! Processing will start automatically.`
      })
    }

  } catch (error) {
    console.error('❌ Error:', error)
    
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({ error: error.message })
    }
  }
}