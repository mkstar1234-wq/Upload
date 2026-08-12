import { getOfflinePhotos, removeOfflinePhoto } from './offlineStore';
import { ref, update, increment } from 'firebase/database';

let isSyncing = false;

export async function syncOfflinePhotos(db: any) {
  if (isSyncing || !navigator.onLine) return;
  isSyncing = true;

  try {
    const photos = await getOfflinePhotos();
    if (photos.length === 0) {
      isSyncing = false;
      return;
    }

    console.log(`Syncing ${photos.length} offline photos...`);

    // Group photos by folderId to optimize updates
    const photosByFolder = photos.reduce((acc, photo) => {
      if (!acc[photo.folderId]) acc[photo.folderId] = [];
      acc[photo.folderId].push(photo);
      return acc;
    }, {} as Record<string, typeof photos>);

    for (const folderId of Object.keys(photosByFolder)) {
      const folderPhotos = photosByFolder[folderId];
      let totalAddedBytes = 0;
      const updates: Record<string, any> = {};

      for (const photo of folderPhotos) {
        updates[`photos/${folderId}/${photo.id}`] = {
          url: photo.url,
          createdAt: photo.createdAt,
          sizeBytes: photo.sizeBytes
        };
        updates[`folders/${folderId}/months/${photo.monthYear}`] = true;
        totalAddedBytes += photo.sizeBytes;
      }

      if (totalAddedBytes > 0) {
        updates[`folders/${folderId}/sizeBytes`] = increment(totalAddedBytes);
        updates[`storageStats/totalBytes`] = increment(totalAddedBytes);
        updates[`stats/folders/${folderId}/count`] = increment(folderPhotos.length);
        updates[`stats/folders/${folderId}/sizeInBytes`] = increment(totalAddedBytes);
        updates[`stats/global/count`] = increment(folderPhotos.length);
        updates[`stats/global/sizeInBytes`] = increment(totalAddedBytes);
        
        await update(ref(db), updates);
      }

      // After successful update, remove them from IndexedDB
      for (const photo of folderPhotos) {
        await removeOfflinePhoto(photo.id);
      }
    }
    console.log('Sync complete');
  } catch (error) {
    console.error('Error syncing offline photos:', error);
  } finally {
    isSyncing = false;
  }
}

export function setupSyncListener(db: any) {
  window.addEventListener('online', () => {
    syncOfflinePhotos(db);
  });
  
  // Try syncing on startup just in case
  if (navigator.onLine) {
    syncOfflinePhotos(db);
  }
}
