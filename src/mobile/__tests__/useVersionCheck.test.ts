import { describe, expect, it } from 'vitest';

import { extractAssetSignature } from '@/mobile/hooks/useVersionCheck';

/**
 * The build assets the server publishes.
 *
 * `<link rel="modulepreload">` is a code-split chunk preload — it is NOT an
 * entry asset, so it must never take part in the comparison.
 */
const INDEX_HTML = [
  '<!doctype html>',
  '<html><head>',
  '<script type="module" crossorigin src="/assets/index-abc123.js"></script>',
  '<link rel="stylesheet" crossorigin href="/assets/index-def456.css">',
  '<link rel="modulepreload" crossorigin href="/assets/MobileApp-789abc.js">',
  '</head><body><div id="root"></div></body></html>',
].join('');

describe('asset signature extraction', () => {
  it('extracts the entry script and the stylesheet', () => {
    expect(extractAssetSignature(INDEX_HTML)).toBe(
      '/assets/index-abc123.js,/assets/index-def456.css',
    );
  });

  it('ignores a modulepreload chunk', () => {
    // Counting the preloaded chunk made the server signature differ from the
    // running document on every page — the permanent "update available"
    // banner.
    const signature = extractAssetSignature(INDEX_HTML);
    expect(signature).not.toContain('MobileApp-789abc.js');
  });

  it('ignores a modulepreload that points at an entry asset', () => {
    const html = [
      '<script type="module" src="/assets/index-abc123.js"></script>',
      '<link rel="modulepreload" href="/assets/index-abc123.js">',
    ].join('');
    expect(extractAssetSignature(html)).toBe('/assets/index-abc123.js');
  });

  it('ignores a stylesheet that is not a stylesheet', () => {
    const html = [
      '<link rel="preload" as="style" href="/assets/index-def456.css">',
    ].join('');
    expect(extractAssetSignature(html)).toBeNull();
  });

  it('returns null for an empty document', () => {
    expect(extractAssetSignature('')).toBeNull();
    expect(extractAssetSignature('<html><body></body></html>')).toBeNull();
  });

  it('sorts the assets so the comparison is stable', () => {
    const html = [
      '<script src="/assets/zeta.js"></script>',
      '<script src="/assets/alpha.js"></script>',
    ].join('');
    expect(extractAssetSignature(html)).toBe('/assets/alpha.js,/assets/zeta.js');
  });
});
