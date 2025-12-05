import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const supabase = createClient(supabaseUrl, supabaseKey)

export const handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) }
  }

  try {
    const { storeId, accessToken, shopDomain, processNextBatch } = JSON.parse(event.body)

    // If this is a batch processing request
    if (processNextBatch) {
      const { jobId } = JSON.parse(event.body)
      
      // Call Edge Function with service role key
      const edgeFunctionUrl = `${supabaseUrl}/functions/v1/process-shopify-sync`
      
      const response = await fetch(edgeFunctionUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${supabaseKey}`
        },
        body: JSON.stringify({ jobId })
      })

      const result = await response.json()

      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify(result)
      }
    }

    // Initial job creation (existing code)
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

    console.log(`✅ Job created: ${job.id}`)

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