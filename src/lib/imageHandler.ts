import { ref, push, update, increment } from 'firebase/database';
import { compressImage, blobToBase64 } from './utils';
import { saveOfflinePhoto } from './offlineStore';

export interface UploadedPhoto {
  id: string;
  url: string;
  createdAt: number;
  sizeBytes: number;
  monthYear: string;
  isOffline?: boolean;
}

export async function processAndUploadImages(
  files: File[] | FileList,
  folderId: string,
  targetSizeKB: number,
  db: any
): Promise<UploadedPhoto[]> {
  const uploadedPhotos: UploadedPhoto[] = [];
  let totalAddedBytes = 0;
  const updates: Record<string, any> = {};

  // Sequential queue for memory-safe processing
  for (let i = 0; i < files.length; i++) {
    const file = files[i] as File;
    let base64String = "";
    let sizeBytes = 0;

    try {
      // Aggressively compress image
      const compressedBlob = await compressImage(file, targetSizeKB);
      base64String = await blobToBase64(compressedBlob);
      sizeBytes = base64String.length;
    } catch (error) {
      console.warn('Compression failed, falling back to original file', error);
      // Graceful fallback to original file if compression fails
      try {
        base64String = await blobToBase64(file as Blob);
        sizeBytes = base64String.length;
      } catch (fallbackError) {
        console.error('Fallback failed for file', fallbackError);
        continue; // Skip this file if both compression and fallback fail
      }
    }

    // Prepare DB updates
    const newPhotoRef = push(ref(db, `photos/${folderId}`));
    const photoKey = newPhotoRef.key as string;
    const createdAt = Date.now();
    
    const photoData = {
      url: base64String,
      createdAt,
      sizeBytes
    };
    
    const date = new Date(createdAt);
    const monthYear = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;

    if (!navigator.onLine) {
      // Store in IndexedDB
      await saveOfflinePhoto({
        id: photoKey,
        folderId,
        ...photoData,
        monthYear
      });
      uploadedPhotos.push({
        id: photoKey,
        ...photoData,
        monthYear,
        isOffline: true
      });
      continue;
    }

    updates[`photos/${folderId}/${photoKey}`] = photoData;
    totalAddedBytes += sizeBytes;
    
    updates[`folders/${folderId}/months/${monthYear}`] = true;

    uploadedPhotos.push({
      id: photoKey,
      ...photoData,
      monthYear
    });
  }

  if (totalAddedBytes > 0 && navigator.onLine) {
    updates[`folders/${folderId}/sizeBytes`] = increment(totalAddedBytes);
    updates[`storageStats/totalBytes`] = increment(totalAddedBytes);
    updates[`stats/folders/${folderId}/count`] = increment(uploadedPhotos.filter(p => !p.isOffline).length);
    updates[`stats/folders/${folderId}/sizeInBytes`] = increment(totalAddedBytes);
    updates[`stats/global/count`] = increment(uploadedPhotos.filter(p => !p.isOffline).length);
    updates[`stats/global/sizeInBytes`] = increment(totalAddedBytes);
    
    await update(ref(db), updates);
  }

  return uploadedPhotos;
}
