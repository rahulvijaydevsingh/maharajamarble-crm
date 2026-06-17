// Plus Code (Open Location Code) conversion utility
// Uses Google's Open Location Code algorithm

/**
 * Converts GPS coordinates (latitude, longitude) to a Plus Code
 * @param latitude - Latitude in decimal degrees
 * @param longitude - Longitude in decimal degrees
 * @param codeLength - Length of the plus code (default: 10 for ~14m precision)
 * @returns Plus Code string
 */
export function coordinatesToPlusCode(latitude: number, longitude: number, codeLength: number = 10): string {
  // Implementation of Google's Open Location Code algorithm
  const ALPHABET = "23456789CFGHJMPQRVWX";
  const CODE_PRECISION = [20, 1, 0.05, 0.0025, 0.000125];
  const PAIR_CODE_LENGTH = 10;
  const SEPARATOR = "+";
  const SEPARATOR_POSITION = 8;
  
  // Validate inputs
  if (latitude < -90 || latitude > 90) {
    throw new Error("Invalid latitude");
  }
  if (longitude < -180 || longitude > 180) {
    throw new Error("Invalid longitude");
  }

  // Normalize latitude and longitude
  let normalizedLatitude = Math.min(latitude, 90);
  let normalizedLongitude = longitude;
  
  // Normalize longitude to be in the range [-180, 180)
  while (normalizedLongitude < -180) {
    normalizedLongitude += 360;
  }
  while (normalizedLongitude >= 180) {
    normalizedLongitude -= 360;
  }

  // Shift latitude and longitude to positive values
  normalizedLatitude += 90;
  normalizedLongitude += 180;

  let code = "";
  
  // Generate the first 10 characters (pair code)
  let latPrecision = CODE_PRECISION[0];
  let lngPrecision = CODE_PRECISION[0];
  
  for (let i = 0; i < PAIR_CODE_LENGTH; i += 2) {
    if (i === SEPARATOR_POSITION) {
      code += SEPARATOR;
    }
    
    // Latitude
    const latDigit = Math.floor(normalizedLatitude / latPrecision);
    normalizedLatitude -= latDigit * latPrecision;
    latPrecision = latPrecision / 20;
    code += ALPHABET[latDigit];
    
    // Longitude
    const lngDigit = Math.floor(normalizedLongitude / lngPrecision);
    normalizedLongitude -= lngDigit * lngPrecision;
    lngPrecision = lngPrecision / 20;
    code += ALPHABET[lngDigit];
  }

  // Pad if needed
  if (code.length < codeLength + 1) {
    code += SEPARATOR;
  }

  return code;
}

/**
 * Extracts GPS coordinates from image EXIF data
 * @param file - The image file
 * @returns Promise with latitude and longitude, or null if not found
 */
export function extractGPSFromExif(file: File): Promise<{ latitude: number; longitude: number } | null> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    
    reader.onload = (e) => {
      const view = new DataView(e.target?.result as ArrayBuffer);
      
      // Check for JPEG SOI marker
      if (view.getUint16(0, false) !== 0xFFD8) {
        resolve(null);
        return;
      }

      const length = view.byteLength;
      let offset = 2;

      while (offset < length) {
        if (view.getUint16(offset, false) === 0xFFE1) {
          const exifLength = view.getUint16(offset + 2, false);
          const exifData = extractExifGPS(view, offset + 4, exifLength);
          resolve(exifData);
          return;
        }
        offset += 2 + view.getUint16(offset + 2, false);
      }
      
      resolve(null);
    };

    reader.onerror = () => resolve(null);
    reader.readAsArrayBuffer(file);
  });
}

function extractExifGPS(view: DataView, start: number, length: number): { latitude: number; longitude: number } | null {
  // Check for "Exif\0\0" marker
  const exifMarker = String.fromCharCode(
    view.getUint8(start),
    view.getUint8(start + 1),
    view.getUint8(start + 2),
    view.getUint8(start + 3)
  );
  
  if (exifMarker !== "Exif") {
    return null;
  }

  const tiffStart = start + 6;
  const littleEndian = view.getUint16(tiffStart, false) === 0x4949;
  
  // Find IFD0
  const ifd0Offset = view.getUint32(tiffStart + 4, littleEndian);
  
  try {
    // Parse IFD0 to find GPS IFD pointer
    const gpsIFDPointer = findGPSIFD(view, tiffStart, tiffStart + ifd0Offset, littleEndian);
    
    if (gpsIFDPointer === null) {
      return null;
    }

    // Parse GPS IFD
    return parseGPSIFD(view, tiffStart, gpsIFDPointer, littleEndian);
  } catch {
    return null;
  }
}

function findGPSIFD(view: DataView, tiffStart: number, ifdStart: number, littleEndian: boolean): number | null {
  const entries = view.getUint16(ifdStart, littleEndian);
  
  for (let i = 0; i < entries; i++) {
    const entryOffset = ifdStart + 2 + (i * 12);
    const tag = view.getUint16(entryOffset, littleEndian);
    
    // GPS IFD Pointer tag is 0x8825
    if (tag === 0x8825) {
      return tiffStart + view.getUint32(entryOffset + 8, littleEndian);
    }
  }
  
  return null;
}

function parseGPSIFD(view: DataView, tiffStart: number, gpsStart: number, littleEndian: boolean): { latitude: number; longitude: number } | null {
  const entries = view.getUint16(gpsStart, littleEndian);
  
  let latRef = "N";
  let lonRef = "E";
  let latitude: number[] | null = null;
  let longitude: number[] | null = null;

  for (let i = 0; i < entries; i++) {
    const entryOffset = gpsStart + 2 + (i * 12);
    const tag = view.getUint16(entryOffset, littleEndian);
    
    switch (tag) {
      case 0x0001: // GPSLatitudeRef
        latRef = String.fromCharCode(view.getUint8(entryOffset + 8));
        break;
      case 0x0002: // GPSLatitude
        latitude = readGPSCoordinate(view, tiffStart, entryOffset, littleEndian);
        break;
      case 0x0003: // GPSLongitudeRef
        lonRef = String.fromCharCode(view.getUint8(entryOffset + 8));
        break;
      case 0x0004: // GPSLongitude
        longitude = readGPSCoordinate(view, tiffStart, entryOffset, littleEndian);
        break;
    }
  }

  if (latitude && longitude) {
    let lat = latitude[0] + latitude[1] / 60 + latitude[2] / 3600;
    let lon = longitude[0] + longitude[1] / 60 + longitude[2] / 3600;
    
    if (latRef === "S") lat = -lat;
    if (lonRef === "W") lon = -lon;
    
    return { latitude: lat, longitude: lon };
  }

  return null;
}

function readGPSCoordinate(view: DataView, tiffStart: number, entryOffset: number, littleEndian: boolean): number[] | null {
  const valueOffset = tiffStart + view.getUint32(entryOffset + 8, littleEndian);
  
  try {
    const degrees = view.getUint32(valueOffset, littleEndian) / view.getUint32(valueOffset + 4, littleEndian);
    const minutes = view.getUint32(valueOffset + 8, littleEndian) / view.getUint32(valueOffset + 12, littleEndian);
    const seconds = view.getUint32(valueOffset + 16, littleEndian) / view.getUint32(valueOffset + 20, littleEndian);
    
    return [degrees, minutes, seconds];
  } catch {
    return null;
  }
}
