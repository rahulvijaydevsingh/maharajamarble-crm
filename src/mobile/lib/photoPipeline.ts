/**
 * The two-step site-photo pipeline.
 *
 * The order matters and is not negotiable:
 *
 *   STEP 1 — read the GPS coordinates out of the raw file's EXIF metadata,
 *   STEP 2 — only then compress the image.
 *
 * Compression rewrites the JPEG and drops the metadata block, so extracting
 * the coordinates after compressing would always yield `null`. The desktop
 * site-photo flow does the same thing (see `src/lib/plusCode.ts`'s
 * `extractGPSFromExif` and `src/lib/imageCompression.ts`'s `compressImageFile`).
 */

import { extractGPSFromExif, coordinatesToPlusCode } from '@/lib/plusCode';
import { compressImageFile } from '@/lib/imageCompression';

export interface ExifGpsFix {
  latitude: number;
  longitude: number;
  plusCode: string;
}

export interface PhotoPipelineResult {
  /** The compressed, upload-ready file. */
  file: File;
  /** The GPS fix read from the raw EXIF metadata, when the photo had one. */
  exifGps: ExifGpsFix | null;
}

/** Reads the EXIF GPS fix out of a raw file, returning `null` when there is none. */
export async function readExifGps(rawFile: File): Promise<ExifGpsFix | null> {
  if (!rawFile) return null;
  const isPdf =
    rawFile.type === 'application/pdf' ||
    (rawFile.name ?? '').toLowerCase().endsWith('.pdf');
  if (isPdf) return null;

  try {
    const gps = await extractGPSFromExif(rawFile);
    if (!gps) return null;
    const { latitude, longitude } = gps;
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
    return {
      latitude,
      longitude,
      plusCode: coordinatesToPlusCode(latitude, longitude),
    };
  } catch {
    // A photo without usable EXIF metadata is normal — never block the upload.
    return null;
  }
}

/**
 * Runs the full two-step pipeline: EXIF GPS first, compression second.
 *
 * `compressImageFile` never throws (it falls back to the original file), so
 * this function always resolves.
 */
export async function extractExifThenCompress(rawFile: File): Promise<PhotoPipelineResult> {
  const exifGps = await readExifGps(rawFile);
  const file = await compressImageFile(rawFile, {
    maxDimension: 1024,
    maxSizeBytes: 200 * 1024,
  });
  return { file, exifGps };
}

/**
 * Revokes an object URL created for a local preview. Safe to call with `null`
 * or an already-revoked URL.
 */
export function revokePreviewUrl(url: string | null | undefined): void {
  if (!url) return;
  if (typeof URL === 'undefined' || typeof URL.revokeObjectURL !== 'function') return;
  try {
    URL.revokeObjectURL(url);
  } catch {
    /* already revoked */
  }
}
