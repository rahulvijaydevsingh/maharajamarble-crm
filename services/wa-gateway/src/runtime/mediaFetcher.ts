import { Buffer } from "node:buffer";

export const MAX_GATEWAY_PDF_BYTES = 16 * 1024 * 1024;
export const MAX_GATEWAY_IMAGE_BYTES = 5 * 1024 * 1024;
export const MEDIA_FETCH_TIMEOUT_MS = 30_000;

const ALLOWED_MEDIA_MIMES = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
]);

export interface FetchSignedMediaOptions {
  timeoutMs?: number;
  maxBytes?: number;
  fetchImpl?: typeof fetch;
}

export async function fetchSignedMediaBuffer(
  signedUrl: string,
  expectedMimeType: string,
  options: FetchSignedMediaOptions = {},
): Promise<Buffer> {
  let url: URL;
  try {
    url = new URL(signedUrl);
  } catch {
    throw new Error("MEDIA_URL_INVALID: Signed media URL is invalid");
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new Error("MEDIA_URL_INVALID: Signed media URL must use HTTP or HTTPS");
  }

  const mime = expectedMimeType.toLowerCase().split(";")[0].trim();
  if (!ALLOWED_MEDIA_MIMES.has(mime)) {
    throw new Error("MEDIA_MIME_INVALID: Media type is not allowed");
  }

  const mimeLimit = mime === "application/pdf" ? MAX_GATEWAY_PDF_BYTES : MAX_GATEWAY_IMAGE_BYTES;
  const maxBytes = Math.min(options.maxBytes ?? mimeLimit, mimeLimit);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? MEDIA_FETCH_TIMEOUT_MS);

  try {
    const fetchImpl = options.fetchImpl ?? fetch;
    const response = await fetchImpl(signedUrl, {
      method: "GET",
      signal: controller.signal,
      redirect: "error",
    });

    if (!response.ok) {
      throw new Error("MEDIA_DOWNLOAD_FAILED: Signed URL returned HTTP " + response.status);
    }

    const responseMime = (response.headers.get("content-type") ?? "")
      .split(";")[0]
      .trim()
      .toLowerCase();
    if (responseMime && responseMime !== mime) {
      throw new Error("MEDIA_MIME_MISMATCH: Stored media content type does not match its metadata");
    }

    const contentLength = Number(response.headers.get("content-length") ?? 0);
    if (Number.isFinite(contentLength) && contentLength > maxBytes) {
      throw new Error("MEDIA_TOO_LARGE: Media exceeds the " + maxBytes + " byte download limit");
    }

    if (!response.body) {
      const fallback = Buffer.from(await response.arrayBuffer());
      if (fallback.length === 0) throw new Error("MEDIA_EMPTY: Downloaded media file is empty");
      if (fallback.length > maxBytes) {
        throw new Error("MEDIA_TOO_LARGE: Media exceeds the " + maxBytes + " byte download limit");
      }
      return fallback;
    }

    const reader = response.body.getReader();
    const chunks: Buffer[] = [];
    let totalBytes = 0;

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (!value) continue;
        totalBytes += value.byteLength;
        if (totalBytes > maxBytes) {
          await reader.cancel("Media size limit exceeded");
          throw new Error("MEDIA_TOO_LARGE: Media exceeds the " + maxBytes + " byte download limit");
        }
        chunks.push(Buffer.from(value));
      }
    } finally {
      reader.releaseLock();
    }

    if (totalBytes === 0) throw new Error("MEDIA_EMPTY: Downloaded media file is empty");
    return Buffer.concat(chunks, totalBytes);
  } catch (error) {
    if (controller.signal.aborted) {
      throw new Error("MEDIA_DOWNLOAD_TIMEOUT: Signed media download exceeded its time limit");
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}
