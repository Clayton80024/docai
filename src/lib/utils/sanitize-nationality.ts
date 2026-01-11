/**
 * Sanitize nationality text for formal USCIS documents
 * Converts nationality strings to proper format: "a national of [Country]"
 */
export function sanitizeNationality(raw: string): string {
  if (!raw) return "";

  const normalized = raw.toLowerCase();

  if (normalized.includes("brasil") || normalized.includes("brasileir")) {
    return "a national of Brazil";
  }

  return `a national of ${raw}`;
}

/**
 * Get country name in English from nationality string
 * Converts Portuguese or other language country names to English
 * NEVER returns Portuguese terms like "BRASILEIRO(A)" or "brasileiro"
 */
export function getCountryName(nationality: string): string {
  if (!nationality) return "";

  const normalized = nationality.toLowerCase().trim();

  // Map common Portuguese/other language country names to English
  const countryMap: Record<string, string> = {
    "brasil": "Brazil",
    "brasileiro": "Brazil",
    "brasileira": "Brazil",
    "brasileiro(a)": "Brazil",
    "brasileiro (a)": "Brazil",
    "brasileiro/a": "Brazil",
    "brasileiro/brasileira": "Brazil",
    "brazil": "Brazil",
    "brazilian": "Brazil",
  };

  // Check if normalized value matches any key
  for (const [key, value] of Object.entries(countryMap)) {
    if (normalized.includes(key)) {
      return value;
    }
  }

  // If already in English format (capitalized), return as is
  // Otherwise, capitalize first letter
  if (normalized.length > 0) {
    return nationality.charAt(0).toUpperCase() + nationality.slice(1).toLowerCase();
  }

  return nationality;
}

/**
 * Get citizenship adjective from country name
 * Example: "Brazil" -> "Brazilian"
 */
export function getCitizenshipAdjective(countryName: string): string {
  if (!countryName) return "";

  const normalized = countryName.toLowerCase();

  const citizenshipMap: Record<string, string> = {
    "brazil": "Brazilian",
    "united states": "American",
    "united states of america": "American",
    "usa": "American",
    "mexico": "Mexican",
    "canada": "Canadian",
    "argentina": "Argentine",
    "chile": "Chilean",
    "colombia": "Colombian",
    "peru": "Peruvian",
    "venezuela": "Venezuelan",
    "ecuador": "Ecuadorian",
  };

  if (citizenshipMap[normalized]) {
    return citizenshipMap[normalized];
  }

  // Default: capitalize first letter
  return countryName.charAt(0).toUpperCase() + countryName.slice(1).toLowerCase();
}





