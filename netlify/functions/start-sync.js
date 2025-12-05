import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const supabase = createClient(supabaseUrl, supabaseKey)

export const handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) }
  }

  try {
    const { storeId, accessToken, shopDomain } = JSON.parse(event.body)

    // Get product count
    const countResponse = await fetch(
      `https://${shopDomain}/admin/api/2024-01/products/count.json`,
      { headers: { 'X-Shopify-Access-Token': accessToken, 'Content-Type': 'application/json' } }
    )

    if (!countResponse.ok) {
      throw new Error(`Shopify API error: ${countResponse.status}`)
    }

    const { count } = await countResponse.json()

    // Create job
    const { data: job, error } = await supabase
      .from('sync_jobs')
      .insert({
        store_id: storeId,
        status: 'pending',
        total_products: count,
        processed_products: 0,
        started_at: new Date().toISOString()
      })
      .select()
      .single()

    if (error) throw error

    console.log(`✅ Job created: ${job.id}, triggering Edge Function...`)

    // Trigger Supabase Edge Function
    const edgeFunctionUrl = `${supabaseUrl}/functions/v1/process-shopify-sync`
    
    fetch(edgeFunctionUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${supabaseKey}`
      },
      body: JSON.stringify({ jobId: job.id })
    }).catch(err => console.error('Edge function trigger error:', err))

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({
        success: true,
        jobId: job.id,
        totalProducts: count,
        message: `Sync started! Processing ${count} products in background.`
      })
    }
  } catch (error) {
    console.error('❌ Error:', error)
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ error: error.message })
    }
  }
}