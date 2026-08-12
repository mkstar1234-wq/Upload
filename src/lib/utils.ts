import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Safely formats a timestamp into a localized date string without throwing RangeError.
 */
export function safeFormatDate(timestamp: any, options?: Intl.DateTimeFormatOptions): string {
  if (!timestamp) return '';
  const date = new Date(timestamp);
  if (isNaN(date.getTime())) return '';
  try {
    return date.toLocaleDateString(undefined, options);
  } catch (e) {
    return '';
  }
}

/**
 * Safely formats a timestamp into a localized time string without throwing RangeError.
 */
export function safeFormatTime(timestamp: any, options?: Intl.DateTimeFormatOptions): string {
  if (!timestamp) return '';
  const date = new Date(timestamp);
  if (isNaN(date.getTime())) return '';
  try {
    return date.toLocaleTimeString([], options);
  } catch (e) {
    return '';
  }
}

/**
 * Aggressively compresses an image using the Canvas API to fit under the target size (in KB).
 * Follows a recursive fallback to degrade quality and scale until the constraint is met.
 */
export async function compressImage(file: File, targetSizeKB: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);
    img.src = objectUrl;
    
    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      
      if (!ctx) {
        return reject(new Error('Canvas context not available'));
      }

      let scale = 1.0;
      let quality = 0.7; // Start at 0.7 to save iterations
      let iteration = 0;
      const maxIterations = 10; // Prevent infinite loops and long processing times
      
      const attemptCompress = () => {
        iteration++;
        const width = Math.max(1, Math.floor(img.width * scale));
        const height = Math.max(1, Math.floor(img.height * scale));
        
        canvas.width = width;
        canvas.height = height;
        
        ctx.clearRect(0, 0, width, height);
        ctx.drawImage(img, 0, 0, width, height);
        
        canvas.toBlob((blob) => {
          if (!blob) {
            return reject(new Error('Canvas toBlob failed'));
          }
          
          const sizeKB = blob.size / 1024;
          
          if (sizeKB <= targetSizeKB || iteration >= maxIterations || (scale <= 0.1 && quality <= 0.1)) {
            resolve(blob);
          } else {
            // Calculate a ratio to jump down faster
            const ratio = targetSizeKB / sizeKB;
            
            if (ratio < 0.5) {
              // If it's more than 2x too big, drop scale aggressively
              scale *= Math.max(0.3, Math.sqrt(ratio)); 
            } else {
              // Otherwise, fine-tune quality or drop scale slightly
              if (quality > 0.4) {
                quality -= 0.2;
              } else {
                quality = 0.7;
                scale *= 0.7;
              }
            }
            attemptCompress();
          }
        }, 'image/jpeg', quality);
      };
      
      // If image is already huge, immediately drop scale to save time
      const estimatedSizeKB = (file.size || (img.width * img.height * 3)) / 1024;
      if (estimatedSizeKB > targetSizeKB * 4) {
         scale = Math.max(0.1, Math.sqrt((targetSizeKB * 4) / estimatedSizeKB));
      }
      
      attemptCompress();
    };
    
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('Failed to load image for compression'));
    };
  });
}

export function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error('Failed to read blob'));
    reader.readAsDataURL(blob);
  });
}
