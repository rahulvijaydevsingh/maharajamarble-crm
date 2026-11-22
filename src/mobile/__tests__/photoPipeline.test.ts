import { beforeEach, describe, expect, it, vi } from 'vitest';

const { calls } = vi.hoisted(() => ({ calls: [] as string[] }));

vi.mock('@/lib/plusCode', () => ({
  extractGPSFromExif: vi.fn(async () => {
    calls.push('extractGPSFromExif');
    return { latitude: 26.9124, longitude: 75.7873 };
  }),
  coordinatesToPlusCode: vi.fn(() => {
    calls.push('coordinatesToPlusCode');
    return '7JRQWR6P+XW';
  }),
}));

vi.mock('@/lib/imageCompression', () => ({
  compressImageFile: vi.fn(async () => {
    calls.push('compressImageFile');
    return { name: 'site.jpg', size: 1024 } as unknown as File;
  }),
}));

import {
  extractExifThenCompress,
  readExifGps,
  revokePreviewUrl,
} from '@/mobile/lib/photoPipeline';

function fakeFile(name = 'site.jpg', type = 'image/jpeg'): File {
  return { name, type, size: 1_200_000 } as unknown as File;
}

describe('site photo pipeline', () => {
  beforeEach(() => {
    calls.length = 0;
    vi.clearAllMocks();
  });

  it('extracts the EXIF GPS fix before compressing the image', async () => {
    await extractExifThenCompress(fakeFile());
    expect(calls).toEqual(['extractGPSFromExif', 'coordinatesToPlusCode', 'compressImageFile']);
    expect(calls.indexOf('extractGPSFromExif')).toBeLessThan(
      calls.indexOf('compressImageFile'),
    );
  });

  it('returns the GPS fix with a plus code', async () => {
    const result = await extractExifThenCompress(fakeFile());
    expect(result.exifGps).not.toBeNull();
    expect(result.exifGps?.latitude).toBe(26.9124);
    expect(result.exifGps?.longitude).toBe(75.7873);
    expect(result.exifGps?.plusCode).toBe('7JRQWR6P+XW');
  });

  it('returns the compressed file', async () => {
    const result = await extractExifThenCompress(fakeFile());
    expect(result.file).toBeDefined();
    expect(result.file.name).toBe('site.jpg');
  });

  it('skips EXIF extraction for PDFs', async () => {
    calls.length = 0;
    const fix = await readExifGps(fakeFile('plan.pdf', 'application/pdf'));
    expect(fix).toBeNull();
    expect(calls).not.toContain('extractGPSFromExif');
  });

  it('never throws when the photo has no EXIF metadata', async () => {
    const plusCode = await import('@/lib/plusCode');
    vi.mocked(plusCode.extractGPSFromExif).mockResolvedValueOnce(null as never);
    const fix = await readExifGps(fakeFile());
    expect(fix).toBeNull();
  });

  it('never throws when the file is missing', async () => {
    const fix = await readExifGps(null as unknown as File);
    expect(fix).toBeNull();
  });
});

describe('preview URL cleanup', () => {
  it('revokes an object URL', () => {
    const revoke = vi.fn();
    (globalThis as unknown as { URL: { revokeObjectURL: unknown } }).URL = {
      revokeObjectURL: revoke,
    };
    revokePreviewUrl('blob:fake');
    expect(revoke).toHaveBeenCalledWith('blob:fake');
  });

  it('is a no-op for a missing URL', () => {
    const revoke = vi.fn();
    (globalThis as unknown as { URL: { revokeObjectURL: unknown } }).URL = {
      revokeObjectURL: revoke,
    };
    revokePreviewUrl(null);
    revokePreviewUrl(undefined);
    expect(revoke).not.toHaveBeenCalled();
  });
});
