/**
 * Client-side photo preparation for /add (#38): decode whatever the camera
 * produced, downscale it, and re-encode it as JPEG before upload, so phone
 * photos (often 4–12 MB, sometimes HEIC on iOS) fit the Worker's 5 MB limit
 * and upload quickly. Browser-only (canvas). Nothing is stored.
 */
import type { AuthorPhotoImage } from "../ai/api";
import { PHOTO_LIMITS } from "../ai/config";

export interface PreparedPhoto extends AuthorPhotoImage {
  mediaType: "image/jpeg";
  /** `data:` URL for the preview thumbnail. */
  previewUrl: string;
  width: number;
  height: number;
  bytes: number;
}

export interface PrepareOptions {
  /** Longest side after downscaling (px). Text on a card stays legible at this size. */
  maxDimension?: number;
  quality?: number;
  maxBytes?: number;
}

export class PhotoPrepareError extends Error {
  constructor(
    readonly reason: "decode" | "too_large",
    message: string
  ) {
    super(message);
    this.name = "PhotoPrepareError";
  }
}

export const PHOTO_PREPARE_DEFAULTS = { maxDimension: 1600, quality: 0.85 } as const;

/** Target size for a `width`×`height` image whose longest side is at most `max`. */
export function fitWithin(width: number, height: number, max: number): { width: number; height: number } {
  const scale = Math.min(1, max / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

type Drawable = { source: CanvasImageSource; width: number; height: number; close?: () => void };

async function decode(file: Blob): Promise<Drawable> {
  if (typeof createImageBitmap === "function") {
    try {
      // Applies the EXIF orientation, so portrait photos stay upright.
      const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
      return { source: bitmap, width: bitmap.width, height: bitmap.height, close: () => bitmap.close() };
    } catch {
      /* fall back to <img> */
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.decoding = "async";
    img.src = url;
    await img.decode();
    return { source: img, width: img.naturalWidth, height: img.naturalHeight };
  } catch {
    throw new PhotoPrepareError("decode", "This browser cannot read that image. Take a new photo or choose a JPEG.");
  } finally {
    URL.revokeObjectURL(url);
  }
}

function toJpeg(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("toBlob failed"))), "image/jpeg", quality);
  });
}

function readDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

/** Downscale and re-encode one photo as JPEG. */
export async function preparePhoto(file: Blob, options: PrepareOptions = {}): Promise<PreparedPhoto> {
  const maxBytes = options.maxBytes ?? PHOTO_LIMITS.maxImageDecodedBytes;
  let maxDimension = options.maxDimension ?? PHOTO_PREPARE_DEFAULTS.maxDimension;
  let quality = options.quality ?? PHOTO_PREPARE_DEFAULTS.quality;
  const image = await decode(file);
  try {
    for (let attempt = 0; attempt < 5; attempt++) {
      const size = fitWithin(image.width, image.height, maxDimension);
      const canvas = document.createElement("canvas");
      canvas.width = size.width;
      canvas.height = size.height;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new PhotoPrepareError("decode", "Canvas is not available");
      ctx.fillStyle = "#fff"; // transparent PNGs become white, not black
      ctx.fillRect(0, 0, size.width, size.height);
      ctx.drawImage(image.source, 0, 0, size.width, size.height);
      const blob = await toJpeg(canvas, quality);
      if (blob.size <= maxBytes) {
        const previewUrl = await readDataUrl(blob);
        return {
          mediaType: "image/jpeg",
          data: previewUrl.slice(previewUrl.indexOf(",") + 1),
          previewUrl,
          width: size.width,
          height: size.height,
          bytes: blob.size,
        };
      }
      maxDimension = Math.round(maxDimension * 0.75);
      quality = Math.max(0.5, quality - 0.1);
    }
  } finally {
    image.close?.();
  }
  throw new PhotoPrepareError("too_large", "The photo is still too large after compressing it.");
}
