export interface ImageCompressionOptions {
  maxDimension?: number;
  maxSizeBytes?: number;
  initialQuality?: number;
}

const DEFAULT_MAX_DIMENSION = 1024;
const DEFAULT_MAX_SIZE_BYTES = 200 * 1024;
const MIN_JPEG_QUALITY = 0.4;

function asFile(source: File | Blob, name: string): File {
  return source instanceof File
    ? source
    : new File([source], name, { type: source.type || "image/jpeg" });
}

function canvasToBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("Could not encode image"))),
      "image/jpeg",
      quality,
    );
  });
}

/**
 * Resizes an image without enlarging it, then reduces JPEG quality until it
 * meets the requested payload target or reaches the safe quality floor.
 */
export async function compressImageFile(
  source: File | Blob,
  options: ImageCompressionOptions = {},
): Promise<File> {
  const original = asFile(source, "capture.jpg");
  const maxDimension = options.maxDimension ?? DEFAULT_MAX_DIMENSION;
  const maxSizeBytes = options.maxSizeBytes ?? DEFAULT_MAX_SIZE_BYTES;
  const initialQuality = options.initialQuality ?? 0.8;

  if (!original.type.startsWith("image/")) {
    return original;
  }

  let objectUrl: string | null = null;
  try {
    objectUrl = URL.createObjectURL(original);
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new Image();
      element.onload = () => resolve(element);
      element.onerror = () => reject(new Error("Could not load image"));
      element.src = objectUrl ?? "";
    });

    const longestEdge = Math.max(image.naturalWidth, image.naturalHeight);
    const scale = longestEdge > maxDimension ? maxDimension / longestEdge : 1;
    const width = Math.max(1, Math.round(image.naturalWidth * scale));
    const height = Math.max(1, Math.round(image.naturalHeight * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Canvas is unavailable");
    context.drawImage(image, 0, 0, width, height);

    let quality = initialQuality;
    let compressed = await canvasToBlob(canvas, quality);
    while (compressed.size > maxSizeBytes && quality > MIN_JPEG_QUALITY) {
      quality = Math.max(MIN_JPEG_QUALITY, quality - 0.1);
      compressed = await canvasToBlob(canvas, quality);
    }

    return new File([compressed], original.name.replace(/\.[^.]+$/, "") + ".jpg", {
      type: "image/jpeg",
      lastModified: original.lastModified,
    });
  } catch (error) {
    console.warn("Attendance image compression failed; using original image.", error);
    return original;
  } finally {
    if (objectUrl) URL.revokeObjectURL(objectUrl);
  }
}