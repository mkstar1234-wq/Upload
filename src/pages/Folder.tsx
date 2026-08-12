import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { db } from '../firebase';
import { ref, onValue, push, get, query, orderByKey, limitToLast, startAt, endAt, endBefore, update, increment, remove } from 'firebase/database';
import { safeFormatDate, safeFormatTime } from '../lib/utils';
import { processAndUploadImages } from '../lib/imageHandler';
import { getOfflinePhotos } from '../lib/offlineStore';
import { Copy, Trash2, Camera, Image as ImageIcon, Loader2, Link as LinkIcon, X, Calendar, Star, ChevronLeft, ChevronRight, CloudOff } from 'lucide-react';
import { showToast } from '../components/Toast';

interface Photo {
  id: string;
  url: string; // Stores Base64 data url
  createdAt: number;
  sizeBytes: number;
  isFavorite?: boolean;
  isOffline?: boolean;
}

function generatePushId(timestamp: number) {
  const PUSH_CHARS = '-0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ_abcdefghijklmnopqrstuvwxyz';
  let timeStampChars = new Array(8);
  for (let i = 7; i >= 0; i--) {
    timeStampChars[i] = PUSH_CHARS.charAt(timestamp % 64);
    timestamp = Math.floor(timestamp / 64);
  }
  return timeStampChars.join('') + '0000000000000000000000';
}

export default function Folder() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  
  const [folderName, setFolderName] = useState<string>(() => {
    try {
      if (!id) return '';
      return localStorage.getItem(`nanoSnap_folder_${id}_name`) || '';
    } catch { return ''; }
  });
  const [offlinePendingPhotos, setOfflinePendingPhotos] = useState<Photo[]>([]);
  const [photos, setPhotos] = useState<Photo[]>(() => {
    try {
      if (!id) return [];
      const cached = localStorage.getItem(`nanoSnap_folder_${id}_photos`);
      return cached ? JSON.parse(cached) : [];
    } catch { return []; }
  });
  const [loading, setLoading] = useState(() => {
    try {
      if (!id) return true;
      return !localStorage.getItem(`nanoSnap_folder_${id}_photos`);
    } catch { return true; }
  });
  const [uploading, setUploading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [targetSize, setTargetSize] = useState(50); // Default 50KB
  
  const [availableMonths, setAvailableMonths] = useState<string[]>([]);
  const [selectedMonth, setSelectedMonth] = useState<string>('');
  
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [fullscreenPhoto, setFullscreenPhoto] = useState<string | null>(null);
  const [zoomLevel, setZoomLevel] = useState(1);
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });
  const [swipeGesture, setSwipeGesture] = useState<'horizontal' | 'vertical'>('horizontal');
  const loadMoreRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!id) return;
    let objectUrls: string[] = [];
    let isMounted = true;

    const loadOffline = async () => {
      try {
        const allOffline = await getOfflinePhotos();
        const folderOffline = allOffline.filter(p => p.folderId === id);

        const newObjectUrls: string[] = [];
        const mapped = await Promise.all(folderOffline.map(async p => {
          try {
            const res = await fetch(p.url);
            const blob = await res.blob();
            const objectUrl = URL.createObjectURL(blob);
            newObjectUrls.push(objectUrl);
            return {
              id: p.id,
              url: objectUrl,
              createdAt: p.createdAt,
              sizeBytes: p.sizeBytes,
              isOffline: true
            } as Photo;
          } catch (e) {
            return {
              id: p.id,
              url: p.url,
              createdAt: p.createdAt,
              sizeBytes: p.sizeBytes,
              isOffline: true
            } as Photo;
          }
        }));
        if (isMounted) {
          // Cleanup old URLs
          objectUrls.forEach(url => URL.revokeObjectURL(url));
          objectUrls = newObjectUrls;
          
          mapped.sort((a, b) => b.createdAt - a.createdAt);
          setOfflinePendingPhotos(mapped);
        } else {
          newObjectUrls.forEach(url => URL.revokeObjectURL(url));
        }
      } catch (err) {
        console.error("Failed to load offline photos:", err);
      }
    };

    loadOffline();
    const intervalId = setInterval(loadOffline, 3000);

    return () => {
      isMounted = false;
      clearInterval(intervalId);
      objectUrls.forEach(url => URL.revokeObjectURL(url));
    };
  }, [id]);
  
  const touchStateRef = useRef({
    x: 0,
    y: 0,
    initialDistance: 0,
    initialZoom: 1,
    lastPanX: 0,
    lastPanY: 0,
    lastTap: 0,
    isPanning: false,
    isPinching: false
  });

  // Category Delete States
  const [showDeleteFolderModal, setShowDeleteFolderModal] = useState(false);

  // Bulk Delete States
  const [bulkDeleteThreshold, setBulkDeleteThreshold] = useState<number | null>(null);
  const [bulkDeleteLabel, setBulkDeleteLabel] = useState<string>('');
  const [isBulkDeleting, setIsBulkDeleting] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [folderStats, setFolderStats] = useState<{ count: number, sizeBytes: number } | null>(null);
  
  // Selection States
  const [selectedPhotos, setSelectedPhotos] = useState<Set<string>>(new Set());
  const [isDeletingSelected, setIsDeletingSelected] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [sortOrder, setSortOrder] = useState<'newest' | 'oldest'>('newest');
  const [showFavoritesOnly, setShowFavoritesOnly] = useState(false);

  // Camera States
  const [showCamera, setShowCamera] = useState(false);
  const [isFlashing, setIsFlashing] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const startCamera = async () => {
    setShowCamera(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { 
          facingMode: 'environment',
          width: { ideal: 1920, max: 3840 },
          height: { ideal: 1080, max: 2160 }
        }
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
    } catch (err) {
      console.error("Error accessing camera:", err);
      showToast("Could not access camera.", "error");
      setShowCamera(false);
    }
  };

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    setShowCamera(false);
  };

  const capturePhoto = () => {
    if (!videoRef.current || !id) return;
    
    // Trigger Screen Flash
    setIsFlashing(true);
    setTimeout(() => setIsFlashing(false), 200);
    
    // Capture exact moment metadata synchronously
    const timestamp = Date.now();
    const folderId = id;
    
    // Snap the photo
    const canvas = document.createElement('canvas');
    canvas.width = videoRef.current.videoWidth;
    canvas.height = videoRef.current.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
    
    // Fire-and-forget background upload
    canvas.toBlob((blob) => {
      if (!blob) return;
      
      (async () => {
        try {
          const file = new File([blob], "capture.jpg", { type: "image/jpeg" });
          const uploadedPhotos = await processAndUploadImages([file], folderId, targetSize, db);
          
          if (uploadedPhotos.length > 0) {
            const photo = uploadedPhotos[0];
            if (!selectedMonth || selectedMonth === photo.monthYear) {
              setPhotos(prev => [{ id: photo.id, url: photo.url, createdAt: photo.createdAt, sizeBytes: photo.sizeBytes, isOffline: photo.isOffline }, ...prev]);
            }
          }
          
          setSuccessMessage("Photo captured and uploaded!");
          setTimeout(() => setSuccessMessage(null), 2000);
        } catch (err) {
          console.error("Failed to upload photo", err);
          showToast("Failed to upload photo.", "error");
        }
      })();
    }, 'image/jpeg', 0.9);
  };

  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  useEffect(() => {
    if (!id) return;
    
    // Fetch target size setting
    get(ref(db, 'settings/compressionTarget')).then((snapshot) => {
      if (snapshot.exists()) {
        setTargetSize(snapshot.val());
      }
    });

    // Fetch swipe gesture setting
    get(ref(db, 'settings/swipeGesture')).then((snapshot) => {
      if (snapshot.exists()) {
        setSwipeGesture(snapshot.val());
      }
    });

    // Listen to folder info for name and months
    const folderRef = ref(db, `folders/${id}`);
    const statsRef = ref(db, `stats/folders/${id}`);
    
    const statsUnsub = onValue(statsRef, (snapshot) => {
      if (snapshot.exists()) {
        const stats = snapshot.val();
        setFolderStats({ count: stats?.count || 0, sizeBytes: stats?.sizeInBytes || 0 });
      } else {
        setFolderStats(null);
      }
    }, (err) => console.error("Error loading folder stats:", err));

    const folderUnsub = onValue(folderRef, (snapshot) => {
      if (!snapshot.exists()) {
        navigate('/', { replace: true });
        return;
      }
      const data = snapshot.val();
      if (!data) return;
      const newName = data.name || 'Untitled Folder';
      setFolderName(newName);
      if (id) localStorage.setItem(`nanoSnap_folder_${id}_name`, newName);
      
      if (data.months && typeof data.months === 'object') {
        const months = Object.keys(data.months).sort((a, b) => b.localeCompare(a));
        setAvailableMonths(months);
        setSelectedMonth(prev => prev || (months.length > 0 ? months[0] : ''));
      }
    }, (err) => console.error("Error loading folder:", err));

    return () => {
      folderUnsub();
      statsUnsub();
      stopCamera();
    };
  }, [id, navigate]);

  // Fetch photos whenever selectedMonth changes
  useEffect(() => {
    if (!id) return;
    setLoading(true);

    let q;
    if (selectedMonth && typeof selectedMonth === 'string' && selectedMonth.includes('-')) {
      const [year, month] = selectedMonth.split('-');
      const y = parseInt(year, 10);
      const m = parseInt(month, 10);
      if (!isNaN(y) && !isNaN(m)) {
        const startDate = new Date(y, m - 1, 1).getTime();
        const endDate = new Date(y, m, 0, 23, 59, 59, 999).getTime();
        
        const startKey = generatePushId(startDate);
        const endKey = generatePushId(endDate);
        
        q = query(ref(db, `photos/${id}`), orderByKey(), startAt(startKey), endAt(endKey), limitToLast(10));
      } else {
        q = query(ref(db, `photos/${id}`), orderByKey(), limitToLast(10));
      }
    } else {
      q = query(ref(db, `photos/${id}`), orderByKey(), limitToLast(10));
    }

    get(q).then((snapshot) => {
      const data = snapshot.val();
      if (data && typeof data === 'object') {
        const parsedPhotos = Object.keys(data).map(key => ({
          id: key,
          ...(typeof data[key] === 'object' && data[key] !== null ? data[key] : {})
        })).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
        setPhotos(parsedPhotos);
        setHasMore(parsedPhotos.length === 10);
        if (id) {
          localStorage.setItem(`nanoSnap_folder_${id}_photos`, JSON.stringify(parsedPhotos));
        }
      } else if (navigator.onLine) {
        setPhotos([]);
        setHasMore(false);
        if (id) {
          localStorage.setItem(`nanoSnap_folder_${id}_photos`, '[]');
        }
      }
      setLoading(false);
    }).catch((err) => {
      console.error("Failed to load photos", err);
      setLoading(false);
    });
  }, [id, selectedMonth]);

  const loadMore = async () => {
    if (!hasMore || photos.length === 0 || loadingMore) return;
    setLoadingMore(true);
    try {
      const lastKey = photos[photos.length - 1].id;
      let q;
      
      if (selectedMonth && typeof selectedMonth === 'string' && selectedMonth.includes('-')) {
        const [yearStr, monthStr] = selectedMonth.split('-');
        const y = parseInt(yearStr, 10);
        const m = parseInt(monthStr, 10);
        if (!isNaN(y) && !isNaN(m)) {
          const startDate = new Date(y, m - 1, 1).getTime();
          const startKey = generatePushId(startDate);
          q = query(ref(db, `photos/${id}`), orderByKey(), startAt(startKey), endBefore(lastKey), limitToLast(10));
        } else {
          q = query(ref(db, `photos/${id}`), orderByKey(), endBefore(lastKey), limitToLast(10));
        }
      } else {
        q = query(ref(db, `photos/${id}`), orderByKey(), endBefore(lastKey), limitToLast(10));
      }
      
      const snapshot = await get(q);
      const data = snapshot.val();
      
      if (data && typeof data === 'object') {
        const parsedPhotos = Object.keys(data).map(key => ({
          id: key,
          ...(typeof data[key] === 'object' && data[key] !== null ? data[key] : {})
        })).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
        
        setPhotos(prev => {
          const existingIds = new Set(prev.map(p => p.id));
          const newPhotos = parsedPhotos.filter(p => !existingIds.has(p.id));
          return [...prev, ...newPhotos];
        });
        setHasMore(parsedPhotos.length === 10);
      } else {
        setHasMore(false);
      }
    } catch (err) {
      console.error("Failed to load more photos:", err);
    } finally {
      setLoadingMore(false);
    }
  };

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !loadingMore) {
          loadMore();
        }
      },
      { rootMargin: '100px' }
    );
    if (loadMoreRef.current) {
      observer.observe(loadMoreRef.current);
    }
    return () => observer.disconnect();
  }, [hasMore, loadingMore, photos, selectedMonth]); // Re-bind when deps change

  const getDistance = (touches: React.TouchList) => {
    if (touches.length < 2) return 0;
    const dx = touches[0].clientX - touches[1].clientX;
    const dy = touches[0].clientY - touches[1].clientY;
    return Math.sqrt(dx * dx + dy * dy);
  };

  const getCenter = (touches: React.TouchList) => {
    if (touches.length < 2) return { x: touches[0].clientX, y: touches[0].clientY };
    return {
      x: (touches[0].clientX + touches[1].clientX) / 2,
      y: (touches[0].clientY + touches[1].clientY) / 2
    };
  };

  const resetZoom = () => {
    setZoomLevel(1);
    setPanOffset({ x: 0, y: 0 });
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    const now = Date.now();
    const lastTap = touchStateRef.current.lastTap;
    
    if (e.touches.length === 1) {
      if (now - lastTap < 300) {
        if (zoomLevel > 1) {
          resetZoom();
        } else {
          setZoomLevel(2.5);
          setPanOffset({ x: 0, y: 0 });
        }
        touchStateRef.current.lastTap = 0;
        return;
      }
      touchStateRef.current.lastTap = now;
      
      touchStateRef.current.x = e.touches[0].clientX;
      touchStateRef.current.y = e.touches[0].clientY;
      touchStateRef.current.lastPanX = panOffset.x;
      touchStateRef.current.lastPanY = panOffset.y;
      touchStateRef.current.isPanning = true;
      touchStateRef.current.isPinching = false;
    } else if (e.touches.length === 2) {
      touchStateRef.current.initialDistance = getDistance(e.touches);
      touchStateRef.current.initialZoom = zoomLevel;
      touchStateRef.current.isPinching = true;
      touchStateRef.current.isPanning = false;
      
      const center = getCenter(e.touches);
      touchStateRef.current.x = center.x;
      touchStateRef.current.y = center.y;
      touchStateRef.current.lastPanX = panOffset.x;
      touchStateRef.current.lastPanY = panOffset.y;
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!fullscreenPhoto) return;

    if (e.touches.length === 2 && touchStateRef.current.isPinching) {
      const distance = getDistance(e.touches);
      const scale = distance / touchStateRef.current.initialDistance;
      const newZoom = Math.max(1, Math.min(touchStateRef.current.initialZoom * scale, 5));
      setZoomLevel(newZoom);
      if (newZoom <= 1) {
        setPanOffset({ x: 0, y: 0 });
      }
    } else if (e.touches.length === 1 && touchStateRef.current.isPanning) {
      if (zoomLevel > 1) {
        const dx = e.touches[0].clientX - touchStateRef.current.x;
        const dy = e.touches[0].clientY - touchStateRef.current.y;
        
        const maxPanX = (window.innerWidth * (zoomLevel - 1)) / 2;
        const maxPanY = (window.innerHeight * (zoomLevel - 1)) / 2;
        
        let newX = touchStateRef.current.lastPanX + dx;
        let newY = touchStateRef.current.lastPanY + dy;
        
        newX = Math.max(-maxPanX, Math.min(maxPanX, newX));
        newY = Math.max(-maxPanY, Math.min(maxPanY, newY));
        
        setPanOffset({ x: newX, y: newY });
      }
    }
  };

  const navigateNext = () => {
    const currentIndex = photos.findIndex(p => p.url === fullscreenPhoto);
    if (currentIndex === -1 || currentIndex >= photos.length - 1) return;
    setFullscreenPhoto(photos[currentIndex + 1].url);
    resetZoom();
    if (currentIndex + 1 === photos.length - 1 && hasMore && !loadingMore) loadMore();
  };

  const navigatePrev = () => {
    const currentIndex = photos.findIndex(p => p.url === fullscreenPhoto);
    if (currentIndex <= 0) return;
    setFullscreenPhoto(photos[currentIndex - 1].url);
    resetZoom();
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!fullscreenPhoto) return;
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') navigateNext();
      if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') navigatePrev();
      if (e.key === 'Escape') {
        setFullscreenPhoto(null);
        resetZoom();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [fullscreenPhoto, photos, hasMore, loadingMore]);

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (!fullscreenPhoto) return;

    if (e.touches.length === 0) {
      touchStateRef.current.isPinching = false;
      touchStateRef.current.isPanning = false;
    }

    if (zoomLevel > 1) {
      return; // Do not swipe next/prev if zoomed in
    }

    if (e.changedTouches.length === 1 && !touchStateRef.current.isPinching) {
      const touchEndX = e.changedTouches[0].clientX;
      const touchEndY = e.changedTouches[0].clientY;
      const dx = touchEndX - touchStateRef.current.x;
      const dy = touchEndY - touchStateRef.current.y;
      
      if (swipeGesture === 'horizontal') {
        if (dx < -50 && Math.abs(dy) < 100) navigateNext(); // Swipe left -> Next
        else if (dx > 50 && Math.abs(dy) < 100) navigatePrev(); // Swipe right -> Prev
      } else {
        if (dy < -50 && Math.abs(dx) < 100) navigateNext(); // Swipe up -> Next
        else if (dy > 50 && Math.abs(dx) < 100) navigatePrev(); // Swipe down -> Prev
      }
    }
  };

  const copyUrl = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      showToast("Folder URL copied to clipboard!", "success");
    } catch (err) {
      showToast("Failed to copy URL. Please copy it manually from the address bar.", "error");
    }
  };

  const processFiles = async (files: FileList | File[]) => {
    if (!files || files.length === 0 || !id) return;

    setUploading(true);
    try {
      const uploadedPhotos = await processAndUploadImages(Array.from(files), id, targetSize, db);
      
      // Optimistically add to UI if it matches current selected month or no month selected
      uploadedPhotos.forEach(photo => {
        if (!selectedMonth || selectedMonth === photo.monthYear) {
          setPhotos(prev => [{ id: photo.id, url: photo.url, createdAt: photo.createdAt, sizeBytes: photo.sizeBytes, isOffline: photo.isOffline }, ...prev]);
        }
      });
    } catch (error: any) {
      console.error(error);
      showToast("Upload Failed: " + error.message, "error");
    } finally {
      setUploading(false);
    }
  };

  const handleUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files) {
      await processFiles(event.target.files);
      event.target.value = ''; // Reset input
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const files = Array.from(e.dataTransfer.files).filter(file => file.type.startsWith('image/'));
      if (files.length > 0) {
        await processFiles(files);
      } else {
        showToast('Please drop image files only.', 'error');
      }
    }
  };

  const toggleFavorite = async (photo: Photo, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!id) return;
    try {
      const targetPath = `photos/${id}/${photo.id}/isFavorite`;
      const newValue = !photo.isFavorite;
      const updates: any = {};
      updates[targetPath] = newValue;
      await update(ref(db), updates);
      
      setPhotos(prev => prev.map(p => p.id === photo.id ? { ...p, isFavorite: newValue } : p));
    } catch (err) {
      console.error("Failed to toggle favorite:", err);
    }
  };

  const deletePhoto = async (photo: Photo) => {
    console.log("Step 1: Delete photo button physically clicked.", photo);
    // Removed window.confirm() because it silently returns false in iframe sandboxes
    
    try {
      const targetPath = `photos/${id}/${photo.id}`;
      console.log("Step 2: Extracted Path ->", targetPath);
      console.log("Step 3: Attempting Firebase remove()...");
      // Precise node removal EXACTLY as requested
      await remove(ref(db, targetPath));
      console.log("Step 4: Firebase remove() succeeded.");
      
      const updates: any = {};
      updates[`stats/folders/${id}/count`] = increment(-1);
      updates[`stats/folders/${id}/sizeInBytes`] = increment(-(photo.sizeBytes || 0));
      updates[`stats/global/count`] = increment(-1);
      updates[`stats/global/sizeInBytes`] = increment(-(photo.sizeBytes || 0));
      await update(ref(db), updates);
      
      // Update UI immediately so the item disappears
      setPhotos(prev => prev.filter(p => p.id !== photo.id));
      console.log("Step 5: UI state updated.");
    } catch (error) {
      console.error("Step 4: FIREBASE ERROR:", error);
      showToast("Failed to delete photo.", "error");
    }
  };

  const deleteCategoryClick = () => {
    setShowDeleteFolderModal(true);
  };

  const confirmDeleteCategory = async () => {
    console.log("Step 1: Delete category button physically clicked.");
    if (!id) return;
    
    setDeleting(true);
    try {
      const photosPath = `photos/${id}`;
      const folderPath = `folders/${id}`;
      console.log("Step 2: Extracted Paths ->", photosPath, folderPath);
      console.log("Step 3: Attempting Firebase remove()...");
      // Precise node removals EXACTLY as requested
      // First, get the stats to decrement global correctly
      const statsSnap = await get(ref(db, `stats/folders/${id}`));
      const updates: any = {};
      updates[`stats/folders/${id}`] = null;
      if (statsSnap.exists()) {
        const stats = statsSnap.val();
        updates[`stats/global/count`] = increment(-(stats.count || 0));
        updates[`stats/global/sizeInBytes`] = increment(-(stats.sizeInBytes || 0));
      }
      
      await remove(ref(db, photosPath));
      console.log("Step 4: Firebase remove(photos) succeeded.");
      await remove(ref(db, folderPath));
      console.log("Step 5: Firebase remove(folders) succeeded.");
      
      await update(ref(db), updates);
      
      // Update UI immediately (navigate away)
      navigate('/', { replace: true });
    } catch (error) {
      console.error("Step 4: FIREBASE ERROR:", error);
      showToast("An error occurred while deleting the category.", "error");
      setDeleting(false);
    }
  };

  const handleBulkDeleteClick = (months: number, label: string) => {
    const threshold = new Date();
    threshold.setMonth(threshold.getMonth() - months);
    setBulkDeleteThreshold(threshold.getTime());
    setBulkDeleteLabel(label);
  };

  const toggleSelection = (photoId: string) => {
    setSelectedPhotos(prev => {
      const next = new Set(prev);
      if (next.has(photoId)) {
        next.delete(photoId);
      } else {
        next.add(photoId);
      }
      return next;
    });
  };

  const clearSelection = () => setSelectedPhotos(new Set());

  const deleteSelectedPhotos = async () => {
    if (!id || selectedPhotos.size === 0) return;
    
    setIsDeletingSelected(true);
    try {
      let totalDeletedBytes = 0;
      const photosToDelete = photos.filter(p => selectedPhotos.has(p.id));
      
      await Promise.all(photosToDelete.map(photo => remove(ref(db, `photos/${id}/${photo.id}`))));
      
      photosToDelete.forEach(photo => {
        totalDeletedBytes += photo.sizeBytes || 0;
      });
      
      const updates: any = {};
      updates[`stats/folders/${id}/count`] = increment(-photosToDelete.length);
      updates[`stats/folders/${id}/sizeInBytes`] = increment(-totalDeletedBytes);
      updates[`stats/global/count`] = increment(-photosToDelete.length);
      updates[`stats/global/sizeInBytes`] = increment(-totalDeletedBytes);
      await update(ref(db), updates);
      
      setPhotos(prev => prev.filter(p => !selectedPhotos.has(p.id)));
      setSelectedPhotos(new Set());
      setSuccessMessage(`Successfully deleted ${photosToDelete.length} photos.`);
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (error) {
      console.error("Failed to delete selected photos:", error);
      showToast("Failed to delete selected photos.", "error");
    } finally {
      setIsDeletingSelected(false);
    }
  };

  const confirmBulkDelete = async () => {
    if (!id || !bulkDeleteThreshold) return;
    
    setIsBulkDeleting(true);
    try {
      const photosRef = ref(db, `photos/${id}`);
      const endKey = generatePushId(bulkDeleteThreshold);
      const q = query(photosRef, orderByKey(), endAt(endKey));
      
      const snapshot = await get(q);
      const data = snapshot.val();
      
      if (data) {
        const photoKeys = Object.keys(data);
        
        await Promise.all(photoKeys.map(key => remove(ref(db, `photos/${id}/${key}`))));
        
        const updates: any = {};
        let totalDeletedBytes = 0;
        photoKeys.forEach(key => {
          totalDeletedBytes += data[key].sizeBytes || 0;
        });
        updates[`stats/folders/${id}/count`] = increment(-photoKeys.length);
        updates[`stats/folders/${id}/sizeInBytes`] = increment(-totalDeletedBytes);
        updates[`stats/global/count`] = increment(-photoKeys.length);
        updates[`stats/global/sizeInBytes`] = increment(-totalDeletedBytes);
        await update(ref(db), updates);
        
        setPhotos(prev => prev.filter(p => p.createdAt >= bulkDeleteThreshold));
        
        setSuccessMessage(`Successfully deleted ${photoKeys.length} old photos from this folder.`);
        setTimeout(() => setSuccessMessage(null), 5000);
      } else {
        setSuccessMessage(`Successfully deleted 0 old photos from this folder.`);
        setTimeout(() => setSuccessMessage(null), 5000);
      }
    } catch (error) {
      console.error("Bulk delete failed:", error);
      showToast("An error occurred while bulk deleting photos.", "error");
    } finally {
      setIsBulkDeleting(false);
      setBulkDeleteThreshold(null);
    }
  };
  
  // Group photos by Month and Year
  const groups: { monthYear: string; photos: Photo[] }[] = [];
  const combinedPhotos = [...offlinePendingPhotos, ...photos].filter((v, i, a) => a.findIndex(t => t.id === v.id) === i);
  const filteredPhotos = (showFavoritesOnly ? combinedPhotos.filter(p => p.isFavorite) : combinedPhotos).sort((a, b) => b.createdAt - a.createdAt);
  
  filteredPhotos.forEach(photo => {
    if (!photo) return;
    const date = photo.createdAt ? new Date(photo.createdAt) : null;
    const isValid = date && !isNaN(date.getTime());
    const monthYear = isValid ? safeFormatDate(date, { month: 'long', year: 'numeric' }) : 'Unknown Date';
    const lastGroup = groups[groups.length - 1];
    if (lastGroup && lastGroup.monthYear === monthYear) {
      lastGroup.photos.push(photo);
    } else {
      groups.push({ monthYear, photos: [photo] });
    }
  });

  return (
    <div 
      className="space-y-6 relative min-h-screen"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {isDragging && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-indigo-500/10 border-4 border-dashed border-indigo-500/50 rounded-xl backdrop-blur-sm pointer-events-none transition-all">
          <div className="text-xl font-bold text-indigo-400 bg-zinc-900/80 px-6 py-3 rounded-2xl shadow-xl">
            Drop Photos Here
          </div>
        </div>
      )}
      {/* Header Actions */}
      <div className="flex flex-col gap-4 rounded-xl border border-zinc-800 bg-zinc-900/50 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold text-zinc-100 truncate">{folderName}</h1>
          {folderStats ? (
            <p className="mt-1 text-xs font-medium text-zinc-400">
              Folder Stats: {folderStats.count} Photos | {formatBytes(folderStats.sizeBytes)}
            </p>
          ) : null}
        </div>
        
        <div className="flex items-center gap-2">
          <button 
            onClick={copyUrl}
            className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-zinc-800 px-4 py-2 text-sm font-medium text-zinc-200 transition-colors hover:bg-zinc-700 active:scale-95"
          >
            <LinkIcon size={16} />
            Copy URL
          </button>
          <button 
            onClick={deleteCategoryClick}
            disabled={deleting}
            className="flex flex-1 items-center justify-center gap-2 rounded-lg border border-red-900/50 bg-red-500/10 px-4 py-2 text-sm font-medium text-red-500 transition-colors hover:bg-red-500/20 active:scale-95 disabled:opacity-50"
          >
            {deleting ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
            Delete
          </button>
        </div>
      </div>

      {/* Success Message */}
      {successMessage && (
        <div className="rounded-lg bg-green-500/10 border border-green-500/30 p-4 text-green-400 text-sm font-medium">
          {successMessage}
        </div>
      )}

      {/* Cleanup Actions */}
      <div className="flex flex-col gap-2 rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
        <div className="text-sm font-medium text-zinc-400 mb-1">Bulk Cleanup (This Folder Only)</div>
        <div className="flex flex-wrap gap-2">
          <button onClick={() => handleBulkDeleteClick(3, '3 Months')} className="px-3 py-1.5 rounded-lg bg-zinc-800 text-xs font-medium text-zinc-300 hover:bg-red-500/20 hover:text-red-400 transition-colors border border-zinc-700">Delete 3 Months Old</button>
          <button onClick={() => handleBulkDeleteClick(6, '6 Months')} className="px-3 py-1.5 rounded-lg bg-zinc-800 text-xs font-medium text-zinc-300 hover:bg-red-500/20 hover:text-red-400 transition-colors border border-zinc-700">Delete 6 Months Old</button>
          <button onClick={() => handleBulkDeleteClick(12, '1 Year')} className="px-3 py-1.5 rounded-lg bg-zinc-800 text-xs font-medium text-zinc-300 hover:bg-red-500/20 hover:text-red-400 transition-colors border border-zinc-700">Delete 1 Year Old</button>
        </div>
      </div>

      {/* Upload Actions */}
      {showCamera ? (
        <div className="flex flex-col gap-3 rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
          <div className="relative aspect-[3/4] w-full overflow-hidden rounded-lg bg-black sm:aspect-video">
            <video
              ref={videoRef}
              autoPlay
              playsInline
              className="h-full w-full object-cover"
            />
            {/* Screen Flash Overlay */}
            <div 
              className={`pointer-events-none absolute inset-0 bg-white transition-opacity duration-200 ${isFlashing ? 'opacity-100' : 'opacity-0'}`}
            />
          </div>
          <div className="flex gap-3">
            <button
              onClick={capturePhoto}
              className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-indigo-600 py-3 font-medium text-white transition-colors hover:bg-indigo-700 active:scale-95"
            >
              <Camera size={20} />
              Capture
            </button>
            <button
              onClick={stopCamera}
              className="flex items-center justify-center rounded-xl bg-red-500/10 px-4 font-medium text-red-500 transition-colors hover:bg-red-500/20 active:scale-95"
            >
              ❌ Close
            </button>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          <input 
            type="file" 
            accept="image/*" 
            capture="environment"
            ref={cameraInputRef}
            className="hidden" 
            onChange={handleUpload}
            disabled={uploading || deleting}
          />
          <input 
            type="file" 
            accept="image/*" 
            multiple
            ref={fileInputRef}
            className="hidden" 
            onChange={handleUpload}
            disabled={uploading || deleting}
          />
          
          <button 
            onClick={startCamera}
            disabled={uploading || deleting}
            className="flex h-24 flex-col items-center justify-center gap-2 rounded-xl bg-indigo-600 font-medium text-white shadow-lg transition-colors hover:bg-indigo-700 active:scale-95 disabled:opacity-50"
          >
            <Camera size={28} />
            <span>Open Camera</span>
          </button>
          
          <button 
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading || deleting}
            className="flex h-24 flex-col items-center justify-center gap-2 rounded-xl bg-zinc-800 font-medium text-zinc-200 shadow-lg transition-colors hover:bg-zinc-700 active:scale-95 disabled:opacity-50"
          >
            <ImageIcon size={28} />
            <span>Gallery</span>
          </button>
        </div>
      )}

      {uploading && !showCamera && (
        <div className="flex items-center justify-center gap-3 rounded-lg border border-indigo-500/30 bg-indigo-500/10 py-4 text-indigo-400">
          <Loader2 className="animate-spin" size={20} />
          <span className="font-medium text-sm">Compressing & Uploading...</span>
        </div>
      )}

      {/* Photo Grid */}
      <div className="pt-2 space-y-6">
        {availableMonths.length > 0 && (
          <div className="flex items-center gap-3 bg-zinc-900/50 p-4 rounded-xl border border-zinc-800">
            <Calendar size={20} className="text-zinc-400 shrink-0" />
            <div className="flex-1">
              <label htmlFor="month-filter" className="sr-only">Filter by Month</label>
              <select
                id="month-filter"
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(e.target.value)}
                className="w-full bg-transparent text-sm font-medium text-zinc-200 outline-none focus:ring-0 cursor-pointer"
              >
                {availableMonths.map(month => {
                  if (!month || typeof month !== 'string' || !month.includes('-')) return null;
                  const [yearStr, monthStr] = month.split('-');
                  const yearInt = parseInt(yearStr, 10);
                  const monthInt = parseInt(monthStr, 10);
                  if (isNaN(yearInt) || isNaN(monthInt)) return null;
                  const date = new Date(yearInt, monthInt - 1, 1);
                  const formattedMonth = isNaN(date.getTime()) ? month : safeFormatDate(date, { month: 'long', year: 'numeric' });
                  return (
                    <option key={month} value={month} className="bg-zinc-800 text-zinc-200">
                      {formattedMonth || month}
                    </option>
                  );
                })}
              </select>
            </div>
          </div>
        )}

        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-medium uppercase tracking-wider text-zinc-500">
              {selectedMonth ? 'Photos in this month' : 'Recent Photos'} ({filteredPhotos.length})
            </h2>
          <div className="flex gap-2">
            <button
              onClick={() => setShowFavoritesOnly(!showFavoritesOnly)}
              className={`flex items-center gap-1.5 px-2 py-1 text-xs rounded-lg font-medium transition-colors border ${
                showFavoritesOnly 
                  ? 'bg-yellow-500/10 border-yellow-500/30 text-yellow-500' 
                  : 'bg-zinc-800 border-zinc-700 text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <Star size={14} className={showFavoritesOnly ? 'fill-yellow-500' : ''} />
              <span className="hidden sm:inline">Favorites</span>
            </button>
            <select
              value={sortOrder}
              onChange={(e) => setSortOrder(e.target.value as 'newest' | 'oldest')}
              className="bg-zinc-800 text-xs font-medium text-zinc-300 rounded-lg px-2 py-1 outline-none border border-zinc-700"
            >
              <option value="newest">Newest First</option>
              <option value="oldest">Oldest First</option>
            </select>
            <div className="flex bg-zinc-800 rounded-lg p-0.5 border border-zinc-700">
              <button 
                onClick={() => setViewMode('grid')}
                className={`px-2 py-1 text-xs rounded-md font-medium transition-colors ${viewMode === 'grid' ? 'bg-zinc-700 text-zinc-100' : 'text-zinc-400 hover:text-zinc-200'}`}
              >
                Grid
              </button>
              <button 
                onClick={() => setViewMode('list')}
                className={`px-2 py-1 text-xs rounded-md font-medium transition-colors ${viewMode === 'list' ? 'bg-zinc-700 text-zinc-100' : 'text-zinc-400 hover:text-zinc-200'}`}
              >
                List
              </button>
            </div>
          </div>
        </div>
        
        {loading && filteredPhotos.length === 0 ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {[1, 2, 3, 4, 5, 6].map(i => (
              <div key={i} className="aspect-square animate-pulse rounded-lg bg-zinc-900/40 border border-zinc-800" />
            ))}
          </div>
        ) : groups.length > 0 ? (
          <div className="space-y-8">
            {groups.map((group) => {
              const sortedPhotos = sortOrder === 'oldest' 
                ? [...group.photos].reverse() 
                : group.photos;
                
              return (
                <div key={group.monthYear}>
                  <div className="mb-4 flex items-center gap-4">
                    <h3 className="text-sm font-semibold text-zinc-200">{group.monthYear}</h3>
                    <div className="h-px flex-1 bg-zinc-800"></div>
                  </div>
                  
                  <div className={viewMode === 'grid' ? "grid grid-cols-2 gap-3 sm:grid-cols-3" : "flex flex-col gap-3"}>
                    {sortedPhotos.map((photo) => (
                      <div key={photo.id} className={`group relative flex gap-1.5 ${viewMode === 'list' ? 'flex-row items-center bg-zinc-900/50 p-2 rounded-xl border border-zinc-800' : 'flex-col'}`}>
                        <div 
                          onClick={() => {
                            if (selectedPhotos.size > 0) {
                              toggleSelection(photo.id);
                            } else {
                              setFullscreenPhoto(photo.url);
                            }
                          }}
                          className={`relative cursor-pointer overflow-hidden rounded-lg bg-zinc-900 border transition-all ${
                            viewMode === 'list' ? 'h-16 w-16 shrink-0' : 'aspect-square'
                          } ${
                            selectedPhotos.has(photo.id) ? 'border-indigo-500 ring-2 ring-indigo-500/50' : 'border-zinc-800'
                          }`}
                        >
                          <img 
                            src={photo.url} 
                            alt="Uploaded" 
                            className={`h-full w-full object-cover transition-transform duration-300 ${
                              selectedPhotos.has(photo.id) ? 'scale-105 opacity-80' : 'group-hover:scale-105'
                            }`}
                            loading="lazy"
                          />
                          
                          {/* Checkbox Overlay */}
                          <div 
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleSelection(photo.id);
                            }}
                            className="absolute left-1 top-1 z-10 p-1"
                          >
                            <div className={`flex h-5 w-5 items-center justify-center rounded-full border transition-colors ${
                              selectedPhotos.has(photo.id) 
                                ? 'border-indigo-500 bg-indigo-500' 
                                : 'border-white/70 bg-black/30 hover:border-white'
                            }`}>
                              {selectedPhotos.has(photo.id) && (
                                <svg className="h-3 w-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                </svg>
                              )}
                            </div>
                          </div>

                          {/* Offline Badge */}
                          {photo.isOffline && (
                            <div className="absolute right-2 bottom-2 z-10 p-1.5 rounded-full bg-black/60 text-amber-400 backdrop-blur-md" title="Pending sync">
                              <CloudOff size={14} />
                            </div>
                          )}
                          {/* Favorite Button */}
                          <button
                            onClick={(e) => toggleFavorite(photo, e)}
                            className={`absolute right-2 top-2 z-10 p-1.5 rounded-full backdrop-blur-md transition-all ${
                              photo.isFavorite 
                                ? 'bg-yellow-500/20 text-yellow-400' 
                                : 'bg-black/20 text-white/70 hover:bg-black/40 hover:text-white opacity-0 group-hover:opacity-100'
                            }`}
                          >
                            <Star size={14} className={photo.isFavorite ? 'fill-yellow-400' : ''} />
                          </button>
                        </div>
                        
                        <div className={`flex flex-col justify-center ${viewMode === 'list' ? 'px-3 flex-1' : 'px-1'}`}>
                          <div className={`font-medium text-zinc-500 ${viewMode === 'list' ? 'text-sm' : 'text-[11px]'}`}>
                            {photo.createdAt ? (
                              <>
                                {safeFormatTime(photo.createdAt, { hour: '2-digit', minute: '2-digit' })}
                                {' • '}
                                {safeFormatDate(photo.createdAt, { day: 'numeric', month: 'short' })}
                              </>
                            ) : (
                              'No timestamp'
                            )}
                          </div>
                          {viewMode === 'list' && (
                            <div className="text-xs text-zinc-600 mt-1">
                              {formatBytes(photo.sizeBytes || 0)}
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
            
            {hasMore && (
              <div ref={loadMoreRef} className="flex justify-center pt-8 pb-12 h-20">
                {loadingMore && <Loader2 className="animate-spin text-zinc-500" size={28} />}
              </div>
            )}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-zinc-800 py-20 text-center">
            <ImageIcon size={32} className="mb-3 text-zinc-600" />
            <p className="text-zinc-400">No photos yet.</p>
            <p className="text-sm text-zinc-600">Snap a picture or upload from your gallery.</p>
          </div>
        )}
        </div>
      </div>

      {/* Fullscreen Modal */}
      {fullscreenPhoto && (
        <div 
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/95 p-4 backdrop-blur-sm touch-none overflow-hidden"
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
        >
          <button 
            onClick={() => { setFullscreenPhoto(null); resetZoom(); }}
            className="absolute right-4 top-4 z-[110] flex h-10 w-10 items-center justify-center rounded-full bg-zinc-800/80 text-white transition-colors hover:bg-zinc-700 active:scale-95"
          >
            <X size={24} />
          </button>

          {/* Desktop Navigation Arrows */}
          <button 
            onClick={(e) => { e.stopPropagation(); navigatePrev(); }}
            className="hidden sm:flex absolute left-4 top-1/2 -translate-y-1/2 z-[110] h-12 w-12 items-center justify-center rounded-full bg-zinc-800/80 text-white transition-colors hover:bg-zinc-700 active:scale-95"
            disabled={photos.findIndex(p => p.url === fullscreenPhoto) <= 0}
            style={{ opacity: photos.findIndex(p => p.url === fullscreenPhoto) <= 0 ? 0.3 : 1 }}
          >
            <ChevronLeft size={32} />
          </button>

          <button 
            onClick={(e) => { e.stopPropagation(); navigateNext(); }}
            className="hidden sm:flex absolute right-4 top-1/2 -translate-y-1/2 z-[110] h-12 w-12 items-center justify-center rounded-full bg-zinc-800/80 text-white transition-colors hover:bg-zinc-700 active:scale-95"
            disabled={photos.findIndex(p => p.url === fullscreenPhoto) >= photos.length - 1}
            style={{ opacity: photos.findIndex(p => p.url === fullscreenPhoto) >= photos.length - 1 ? 0.3 : 1 }}
          >
            <ChevronRight size={32} />
          </button>

          {zoomLevel > 1 && (
            <div className="absolute top-4 left-4 z-[110]">
              <button 
                onClick={resetZoom}
                className="flex items-center gap-2 rounded-full bg-zinc-800/80 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-700 active:scale-95"
              >
                Reset Zoom
              </button>
            </div>
          )}

          <div 
            style={{ 
              transform: `translate(${panOffset.x}px, ${panOffset.y}px) scale(${zoomLevel})`,
              transition: touchStateRef.current.isPinching || touchStateRef.current.isPanning ? 'none' : 'transform 0.2s ease-out',
              willChange: 'transform'
            }}
            className="flex items-center justify-center w-full h-full"
          >
            <img 
              src={fullscreenPhoto} 
              alt="Fullscreen" 
              className="max-h-full max-w-full rounded-md object-contain shadow-2xl pointer-events-none select-none"
            />
          </div>
        </div>
      )}

      {/* Delete Folder Confirmation Modal */}
      {showDeleteFolderModal && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-zinc-800 bg-zinc-900 p-6 shadow-2xl">
            <h2 className="text-xl font-bold text-white mb-2">Delete Folder?</h2>
            <p className="text-zinc-400 mb-6">
              Are you sure you want to delete this folder and all its photos? This action cannot be undone.
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setShowDeleteFolderModal(false)}
                disabled={deleting}
                className="rounded-lg bg-zinc-800 px-4 py-2 text-sm font-medium text-zinc-200 transition-colors hover:bg-zinc-700 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={confirmDeleteCategory}
                disabled={deleting}
                className="flex items-center justify-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-red-700 disabled:opacity-50"
              >
                {deleting ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
                OK
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bulk Delete Confirmation Modal */}
      {bulkDeleteThreshold && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-zinc-800 bg-zinc-900 p-6 shadow-2xl">
            <h2 className="text-xl font-bold text-white mb-2">Confirm Bulk Delete</h2>
            <p className="text-zinc-400 mb-6">
              Are you sure you want to delete photos older than <strong className="text-red-400">{bulkDeleteLabel}</strong> in THIS folder? This cannot be undone.
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setBulkDeleteThreshold(null)}
                disabled={isBulkDeleting}
                className="rounded-lg bg-zinc-800 px-4 py-2 text-sm font-medium text-zinc-200 transition-colors hover:bg-zinc-700 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={confirmBulkDelete}
                disabled={isBulkDeleting}
                className="flex items-center justify-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-red-700 disabled:opacity-50"
              >
                {isBulkDeleting ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
                Yes, Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Selected Photos Bottom Bar */}
      {selectedPhotos.size > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[150] flex items-center gap-4 rounded-full bg-zinc-900 border border-zinc-700 px-5 py-3 shadow-2xl">
          <span className="text-sm font-medium text-white whitespace-nowrap">{selectedPhotos.size} selected</span>
          <div className="w-px h-5 bg-zinc-700"></div>
          <button 
            onClick={clearSelection}
            disabled={isDeletingSelected}
            className="text-sm font-medium text-zinc-400 hover:text-white transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={deleteSelectedPhotos}
            disabled={isDeletingSelected}
            className="flex items-center gap-1.5 rounded-full bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50 transition-colors"
          >
            {isDeletingSelected ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
            Delete
          </button>
        </div>
      )}
    </div>
  );
}
