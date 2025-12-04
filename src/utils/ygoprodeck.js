const YGOPRODECK_API = 'https://db.ygoprodeck.com/api/v7/cardinfo.php'

/**
 * Search for cards by name (fuzzy search)
 */
export async function searchYGOCards(query) {
  try {
    const response = await fetch(`${YGOPRODECK_API}?fname=${encodeURIComponent(query)}`)
    
    if (!response.ok) {
      if (response.status === 404) {
        return []
      }
      throw new Error('Failed to search cards')
    }
    
    const data = await response.json()
    return data.data || []
  } catch (error) {
    console.error('Error searching YGOProDeck:', error)
    return []
  }
}

/**
 * Get exact card by name
 */
export async function getYGOCard(name) {
  try {
    const response = await fetch(`${YGOPRODECK_API}?name=${encodeURIComponent(name)}`)
    
    if (!response.ok) {
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
 * Examples:
 *   "Blue-Eyes White Dragon - LOB-001 Ultra Rare" → "Blue-Eyes White Dragon"
 *   "Dark Magician SDY-006 NM" → "Dark Magician"
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