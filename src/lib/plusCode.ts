/**
 * Open Location Code (Plus Code) utilities for WhatsApp location pins.
 */
const OLC_ALPHABET = "23456789CFGHJMPQRVWX";
const SEPARATOR = "+";
const SEPARATOR_POSITION = 8;
const PAIR_RESOLUTIONS = [20, 1, 0.05, 0.0025, 0.000125];
const GRID_ROWS = 5;
const GRID_COLUMNS = 4;

export interface DecodedPlusCodeCenter {
  lat: number;
  lng: number;
}

export function cleanPlusCodeInput(raw: string | null | undefined): string {
  return typeof raw === "string" ? raw.trim() : "";
}

function getPlusCodeToken(raw: string | null | undefined): string {
  const cleaned = cleanPlusCodeInput(raw);
  return cleaned ? cleaned.split(/\s+/)[0].toUpperCase() : "";
}

export function isValidPlusCodeFormat(raw: string | null | undefined): boolean {
  const token = getPlusCodeToken(raw);
  if (!token) return false;
  const plusIndex = token.indexOf(SEPARATOR);
  if (
    plusIndex < 2 ||
    plusIndex > SEPARATOR_POSITION ||
    plusIndex % 2 !== 0 ||
    token.indexOf(SEPARATOR, plusIndex + 1) !== -1
  ) return false;

  const code = token.replace(SEPARATOR, "");
  if (code.length < 4 || code.length > 15) return false;
  if (code.length % 2 !== 0 && code.length <= 10) return false;
  for (const character of code) {
    if (!OLC_ALPHABET.includes(character)) return false;
  }
  return true;
}

export function getGoogleMapsUrlFromPlusCode(
  sitePlusCode: string | null | undefined,
): string | null {
  const cleaned = cleanPlusCodeInput(sitePlusCode);
  if (!cleaned) return null;
  return "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent(cleaned);
}

/**
 * Decodes a full Open Location Code with the separator after eight characters.
 * Short/local codes are deliberately not decoded because they need a reference area.
 */
export function decodePlusCodeCenter(
  fullCodeRaw: string | null | undefined,
): DecodedPlusCodeCenter | null {
  const token = getPlusCodeToken(fullCodeRaw);
  if (!isValidPlusCodeFormat(token) || token.indexOf(SEPARATOR) !== SEPARATOR_POSITION) {
    return null;
  }
  const code = token.replace(SEPARATOR, "");
  if (code.length < 10 || code.length > 15) return null;

  let latitude = -90;
  let longitude = -180;
  let pairResolution = PAIR_RESOLUTIONS[0];

  const pairLength = Math.min(code.length, 10);
  for (let index = 0; index < pairLength; index += 2) {
    const latitudeDigit = OLC_ALPHABET.indexOf(code[index]);
    const longitudeDigit = OLC_ALPHABET.indexOf(code[index + 1]);
    if (latitudeDigit < 0 || longitudeDigit < 0) return null;
    latitude += latitudeDigit * pairResolution;
    longitude += longitudeDigit * pairResolution;
    pairResolution /= 20;
  }

  let latitudePrecision = pairResolution * 20;
  let longitudePrecision = pairResolution * 20;

  if (code.length > 10) {
    for (let index = 10; index < code.length; index += 1) {
      latitudePrecision /= GRID_ROWS;
      longitudePrecision /= GRID_COLUMNS;
      const digit = OLC_ALPHABET.indexOf(code[index]);
      if (digit < 0) return null;
      latitude += Math.floor(digit / GRID_COLUMNS) * latitudePrecision;
      longitude += (digit % GRID_COLUMNS) * longitudePrecision;
    }
  } else {
    const lastPairIndex = code.length / 2 - 1;
    latitudePrecision = PAIR_RESOLUTIONS[lastPairIndex];
    longitudePrecision = PAIR_RESOLUTIONS[lastPairIndex];
  }

  const lat = Number((latitude + latitudePrecision / 2).toFixed(6));
  const lng = Number((longitude + longitudePrecision / 2).toFixed(6));
  if (
    !Number.isFinite(lat) || !Number.isFinite(lng) ||
    lat < -90 || lat > 90 || lng < -180 || lng > 180
  ) return null;
  return { lat, lng };
}
