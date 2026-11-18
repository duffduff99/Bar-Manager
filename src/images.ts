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

export async function upload(blob: Blob): Promise<string> {
  return (await api<{ url: string }>('POST', '/api/admin/upload', blob)).url;
}

export function discardUpload(url: string | null | undefined) {
  if (url) void api('POST', '/api/admin/upload/discard', { url }).catch(() => undefined);
}
