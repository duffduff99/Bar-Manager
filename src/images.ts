import { api } from './api';

function load(file: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('That file could not be opened as an image.'));
    };
    img.src = url;
  });
}

function toBlob(canvas: HTMLCanvasElement, type: string, quality?: number): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('Could not process that image.'))), type, quality),
  );
}

/**
 * Shrink a picture in the browser before it is uploaded, so phone photos do not
 * fill the disk. Photos become JPEG; logos stay PNG to keep transparency.
 */
export async function shrink(file: Blob, max: number, type: 'image/jpeg' | 'image/png'): Promise<Blob> {
  const img = await load(file);
  const width = img.naturalWidth || 512;
  const height = img.naturalHeight || 512;
  const scale = Math.min(1, max / Math.max(width, height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));
  const ctx = canvas.getContext('2d')!;
  if (type === 'image/jpeg') {
    ctx.fillStyle = '#f4ead8';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return toBlob(canvas, type, 0.86);
}

/** A square home-screen icon: the logo centred on a plain background. */
export async function squareIcon(file: Blob, size: number): Promise<Blob> {
  const img = await load(file);
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#f4ead8';
  ctx.fillRect(0, 0, size, size);
  const width = img.naturalWidth || 512;
  const height = img.naturalHeight || 512;
  // Keep the logo inside the middle 70% so rounded and circular icon masks do not clip it.
  const scale = (size * 0.7) / Math.max(width, height);
  ctx.drawImage(img, (size - width * scale) / 2, (size - height * scale) / 2, width * scale, height * scale);
  return toBlob(canvas, 'image/png');
}

export async function upload(blob: Blob): Promise<string> {
  return (await api<{ url: string }>('POST', '/api/admin/upload', blob)).url;
}

export function discardUpload(url: string | null | undefined) {
  if (url) void api('POST', '/api/admin/upload/discard', { url }).catch(() => undefined);
}
