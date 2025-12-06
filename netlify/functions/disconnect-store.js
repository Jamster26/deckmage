import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const supabase = createClient(supabaseUrl, supabaseKey)

export const handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) }
  }

  try {
    const { storeId } = JSON.parse(event.body)

    if (!storeId) {
      throw new Error('storeId is required')
    }

    console.log('🗑️ Disconnecting store:', storeId)

    // Delete all products first
    const { error: productsError } = await supabase
      .from('products')
      .delete()
      .eq('store_id', storeId)

    if (productsError) {
      console.error('Error deleting products:', productsError)
      throw productsError
    }

    console.log('✅ Products deleted')

    // Delete the store
    const { error: storeError } = await supabase
      .from('connected_stores')
      .delete()
      .eq('id', storeId)

    if (storeError) {
      console.error('Error deleting store:', storeError)
      throw storeError
    }

    console.log('✅ Store deleted')

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ success: true })
    }

  } catch (error) {
    console.error('❌ Disconnect error:', error)
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: error.message })
    }
  }
}