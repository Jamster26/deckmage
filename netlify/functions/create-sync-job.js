import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY

const supabase = createClient(supabaseUrl, supabaseKey)

export const handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json'
  }

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' }
  }

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: 'Method not allowed' })
    }
  }

  try {
    const { storeId } = JSON.parse(event.body)
    
    if (!storeId) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Store ID required' })
      }
    }
    
    console.log(`🚀 Creating sync job for store: ${storeId}`)
    
    // Get store details
    const { data: store, error: storeError } = await supabase
      .from('connected_stores')
      .select('*')
      .eq('id', storeId)
      .single()
    
    if (storeError || !store) {
      console.error('❌ Store not found:', storeError)
      return {
        statusCode: 404,
        headers,
        body: JSON.stringify({ error: 'Store not found' })
      }
    }
    
    // Get total product count from Shopify
    console.log(`📊 Fetching product count from Shopify...`)
    
    const countResponse = await fetch(
      `https://${store.shop_domain}/admin/api/2024-01/products/count.json`,
      {
        headers: {
          'X-Shopify-Access-Token': store.access_token,
          'Content-Type': 'application/json'
        }
      }
    )
    
    if (!countResponse.ok) {
      throw new Error(`Shopify API error: ${countResponse.status}`)
    }
    
    const { count } = await countResponse.json()
    console.log(`📦 Total products: ${count}`)
    
    // Create sync job
    const { data: job, error: jobError } = await supabase
      .from('sync_jobs')
      .insert({
        store_id: storeId,
        status: 'pending',
        total_products: count,
        processed_products: 0,
        last_shopify_cursor: null
      })
      .select()
      .single()
    
    if (jobError) {
      console.error('❌ Failed to create job:', jobError)
      throw jobError
    }
    
    console.log(`✅ Created job: ${job.id}`)
    
    // Trigger the background worker immediately
    const workerUrl = `${process.env.URL}/.netlify/functions/process-sync-job`
    console.log(`🚀 Triggering background worker: ${workerUrl}`)
    
    // Fire and forget - don't wait for response
    fetch(workerUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jobId: job.id })
    }).catch(err => console.error('Failed to trigger worker:', err))
    
    console.log(`✅ Sync job created and worker triggered`)
    
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        jobId: job.id,
        totalProducts: count,
        message: `Sync started! Processing ${count} products in background.`
      })
    }
    
  } catch (error) {
    console.error('❌ Create sync job error:', error)
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: error.message })
    }
  }
}