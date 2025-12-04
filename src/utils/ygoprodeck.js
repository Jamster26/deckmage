const YGOPRODECK_API = 'https://db.ygoprodeck.com/api/v7/cardinfo.php'

// Simple rate limiter
let lastRequestTime = 0
const MIN_REQUEST_INTERVAL = 100 // 100ms = max 10 requests/second

/**
 * Search for cards by name (fuzzy search)
 */
export async function searchYGOCards(query) {
  // Rate limit protection
  const now = Date.now()
  const timeSinceLastRequest = now - lastRequestTime
  if (timeSinceLastRequest < MIN_REQUEST_INTERVAL) {
    await new Promise(resolve => 
      setTimeout(resolve, MIN_REQUEST_INTERVAL - timeSinceLastRequest)
    )
  }
  lastRequestTime = Date.now()
  
  try {
    // Add better error logging
    console.log('Searching YGOProDeck for:', query)
    
    const url = `${YGOPRODECK_API}?fname=${encodeURIComponent(query)}`
    console.log('API URL:', url)
    
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
      }
    })
    
    console.log('Response status:', response.status)
    
    if (!response.ok) {
      if (response.status === 404) {
        console.log('No cards found for query:', query)
        return []
      }
      // Log the actual error response
      const errorText = await response.text()
      console.error('API error response:', errorText)
      throw new Error(`Failed to search cards: ${response.status} ${response.statusText}`)
    }
    
    const data = await response.json()
    console.log('Found cards:', data.data?.length || 0)
    return data.data || []
  } catch (error) {
    console.error('Error searching YGOProDeck:', error)
    // Return empty array instead of throwing to prevent UI breaking
    return []
  }
}

/**
 * Get exact card by name
 */
export async function getYGOCard(name) {
  // Rate limit protection (same as above)
  const now = Date.now()
  const timeSinceLastRequest = now - lastRequestTime
  if (timeSinceLastRequest < MIN_REQUEST_INTERVAL) {
    await new Promise(resolve => 
      setTimeout(resolve, MIN_REQUEST_INTERVAL - timeSinceLastRequest)
    )
  }
  lastRequestTime = Date.now()
  
  try {
    console.log('Fetching exact card:', name)
    
    const url = `${YGOPRODECK_API}?name=${encodeURIComponent(name)}`
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
      }
    })
    
    if (!response.ok) {
      console.log('Card not found:', name)
      return null
    }
    
    const data = await response.json()
    return data.data?.[0] || null
  } catch (error) {
    console.error('Error fetching YGO card:', error)
    return null
  }
}

/**
 * Extract likely card name from product title
 */
export function extractCardName(productTitle) {
  if (!productTitle) return ''
  
  // Remove common suffixes
  let cleaned = productTitle
    // Remove set codes (e.g., "LOB-001", "SDK-001")
    .replace(/[A-Z]{2,5}-[A-Z]?\d{3}/gi, '')
    // Remove editions
    .replace(/\b(1st Edition|Unlimited|Limited)\b/gi, '')
    // Remove rarities
    .replace(/\b(Ultra Rare|Super Rare|Secret Rare|Common|Rare|Starlight|Ghost)\b/gi, '')
    // Remove conditions
    .replace(/\b(Near Mint|NM|Lightly Played|LP|Moderately Played|MP|Heavily Played|HP|Damaged)\b/gi, '')
    // Remove extra dashes and whitespace
    .replace(/\s*-\s*/g, ' ')
    .trim()
  
  // Take everything before the first dash (if remaining)
  const firstPart = cleaned.split('-')[0].trim()
  
  return firstPart || cleaned
}