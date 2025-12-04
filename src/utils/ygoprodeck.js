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
  
  let cleaned = productTitle
    // Remove set codes (e.g., "LOB-001", "SDK-001") - but keep card name hyphens
    .replace(/\b[A-Z]{2,5}-[A-Z]?\d{3,4}\b/gi, '')
    // Remove conditions
    .replace(/\s*-?\s*(Near Mint|Lightly Played|Moderately Played|Heavily Played|Damaged|Mint|NM|LP|MP|HP|DMG)\s*/gi, '')
    // Remove editions
    .replace(/\s*-?\s*(1st Edition|Limited Edition|Unlimited|1st)\s*/gi, '')
    // Remove rarities
    .replace(/\s*-?\s*(Starlight Rare|Ghost Rare|Ultimate Rare|Ultra Rare|Super Rare|Secret Rare|Prismatic Secret|Quarter Century|Collector's Rare|Rare|Common)\s*/gi, '')
    .trim()
  
  // Clean up extra spaces
  cleaned = cleaned.replace(/\s+/g, ' ').trim()
  
  // Fix common variants (Blue Eyes → Blue-Eyes)
  cleaned = fixCommonCardNameVariants(cleaned)
  
  return cleaned
}

// Add this helper function BEFORE extractCardName
function fixCommonCardNameVariants(name) {
  const fixes = {
    'blue eyes white dragon': 'Blue-Eyes White Dragon',
    'blue eyes black dragon': 'Blue-Eyes Black Dragon', 
    'red eyes black dragon': 'Red-Eyes Black Dragon',
    'red eyes b dragon': 'Red-Eyes B. Dragon',
    'red eyes b. dragon': 'Red-Eyes B. Dragon',
    'dark magician girl': 'Dark Magician Girl',
    'blue eyes ultimate dragon': 'Blue-Eyes Ultimate Dragon',
    'red eyes darkness metal dragon': 'Red-Eyes Darkness Metal Dragon',
    'cyber end dragon': 'Cyber End Dragon',
    'cyber twin dragon': 'Cyber Twin Dragon'
  };
  
  const normalized = name.toLowerCase().trim();
  
  if (fixes[normalized]) {
    console.log(`✏️  Auto-corrected: "${name}" → "${fixes[normalized]}"`);
    return fixes[normalized];
  }
  
  return name;
}