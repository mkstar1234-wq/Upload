import React, { useState, useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { db } from '../firebase';
import { ref, push, set, onValue, update, increment, get } from 'firebase/database';
import { Folder as FolderIcon, Plus, ChevronRight, Loader2, Camera, Image as ImageIcon } from 'lucide-react';
import { safeFormatDate } from '../lib/utils';
import { processAndUploadImages } from '../lib/imageHandler';
import { showToast } from '../components/Toast';

interface Category {
  id: string;
  name: string;
  createdAt: number;
}

interface FolderStats {
  [key: string]: {
    count?: number;
    sizeInBytes?: number;
  };
}

export default function Home() {
  const [categories, setCategories] = useState<Category[]>(() => {
    try {
      const cached = localStorage.getItem('nanoSnap_categories');
      return cached ? JSON.parse(cached) : [];
    } catch { return []; }
  });
  const [folderStats, setFolderStats] = useState<FolderStats>(() => {
    try {
      const cached = localStorage.getItem('nanoSnap_folderStats');
      return cached ? JSON.parse(cached) : {};
    } catch { return {}; }
  });
  const [loading, setLoading] = useState(!localStorage.getItem('nanoSnap_categories'));
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  
  const [uploadTargetId, setUploadTargetId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  const filteredCategories = categories.filter(c => 
    (c.name || "").toLowerCase().includes(searchQuery.toLowerCase())
  );
  const [uploadingId, setUploadingId] = useState<string | null>(null);
  const [targetSize, setTargetSize] = useState(50);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  
  const navigate = useNavigate();

    useEffect(() => {
    // Fetch target size
    get(ref(db, 'settings/compressionTarget')).then((snapshot) => {
      if (snapshot.exists()) setTargetSize(snapshot.val());
    }).catch(err => console.error("Error fetching compressionTarget:", err));

    const foldersRef = ref(db, 'folders');
    const unsubscribeFolders = onValue(foldersRef, (snapshot) => {
      const data = snapshot.val();
      if (data && typeof data === 'object') {
        const parsedCategories = Object.keys(data).map(key => ({
          id: key,
          ...(typeof data[key] === 'object' && data[key] !== null ? data[key] : {})
        })).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
        setCategories(parsedCategories);
        localStorage.setItem('nanoSnap_categories', JSON.stringify(parsedCategories));
      } else if (navigator.onLine) {
        setCategories([]);
        localStorage.setItem('nanoSnap_categories', '[]');
      }
      setLoading(false);
    }, (error) => {
      console.error("Firebase read failed:", error);
      setLoading(false);
    });

    const statsRef = ref(db, 'stats/folders');
    const unsubscribeStats = onValue(statsRef, (snapshot) => {
      const data = snapshot.val();
      if (data && typeof data === 'object') {
        setFolderStats(data);
        localStorage.setItem('nanoSnap_folderStats', JSON.stringify(data));
      } else if (navigator.onLine) {
        setFolderStats({});
        localStorage.setItem('nanoSnap_folderStats', '{}');
      }
    }, (error) => console.error("Error fetching stats:", error));

    return () => {
      unsubscribeFolders();
      unsubscribeStats();
    };
  }, []);

  const handleCreateFolder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCategoryName.trim() || isCreating) return;

    setIsCreating(true);
    try {
      const foldersRef = ref(db, 'folders');
      const newFolderRef = push(foldersRef);
      
      const updates: any = {};
      updates[`folders/${newFolderRef.key}`] = {
        name: newCategoryName.trim(),
        createdAt: Date.now()
      };
      updates[`stats/folders/${newFolderRef.key}`] = {
        count: 0,
        sizeInBytes: 0
      };
      
      await update(ref(db), updates);
      
      setNewCategoryName('');
      if (newFolderRef.key) {
        navigate(`/folder/${newFolderRef.key}`);
      }
    } catch (error) {
      console.error("Failed to create folder:", error);
      showToast("Error creating folder. Make sure Firebase is configured.", "error");
    } finally {
      setIsCreating(false);
    }
  };

  const triggerUpload = (e: React.MouseEvent, folderId: string, type: 'camera' | 'gallery') => {
    e.preventDefault();
    e.stopPropagation();
    setUploadTargetId(folderId);
    
    setTimeout(() => {
      if (type === 'camera') cameraInputRef.current?.click();
      else fileInputRef.current?.click();
    }, 0);
  };

  const handleUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    const folderId = uploadTargetId;
    if (!files || files.length === 0 || !folderId) return;

    setUploadingId(folderId);

    try {
      await processAndUploadImages(Array.from(files), folderId, targetSize, db);
    } catch (error: any) {
      console.error(error);
      showToast("Upload Failed: " + error.message, "error");
    } finally {
      setUploadingId(null);
      setUploadTargetId(null);
      if (event.target) event.target.value = '';
    }
  };

  return (
    <div className="space-y-6">
      {/* Hidden inputs for inline upload */}
      <input 
        type="file" 
        accept="image/*" 
        capture="environment"
        ref={cameraInputRef}
        className="hidden" 
        onChange={handleUpload}
      />
      <input 
        type="file" 
        accept="image/*" 
        multiple
        ref={fileInputRef}
        className="hidden" 
        onChange={handleUpload}
      />

      <section>
        <h2 className="mb-4 text-xl font-medium text-zinc-100">Create New Category</h2>
        <form onSubmit={handleCreateFolder} className="flex gap-2">
          <input
            type="text"
            placeholder="e.g. Vacation 2026, Receipts..."
            value={newCategoryName}
            onChange={(e) => setNewCategoryName(e.target.value)}
            className="flex-1 rounded-xl border border-zinc-800 bg-zinc-900/50 px-4 py-3 text-zinc-100 outline-none placeholder:text-zinc-500 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all"
            disabled={isCreating}
          />
          <button
            type="submit"
            disabled={!newCategoryName.trim() || isCreating}
            className="flex items-center justify-center rounded-xl bg-indigo-600 px-5 font-medium text-white transition-colors hover:bg-indigo-700 disabled:opacity-50 disabled:hover:bg-indigo-600"
          >
            {isCreating ? <Loader2 className="animate-spin" size={20} /> : <Plus size={20} />}
          </button>
        </form>
      </section>

      <section>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-medium text-zinc-400">Your Categories</h2>
          {categories.length > 0 && (
            <input
              type="text"
              placeholder="Search folders..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-48 rounded-lg border border-zinc-800 bg-zinc-900/50 px-3 py-1.5 text-sm text-zinc-200 outline-none placeholder:text-zinc-500 focus:border-indigo-500 transition-colors"
            />
          )}
        </div>
        
        {loading ? (
          <div className="grid gap-3">
            {[1, 2, 3].map(i => (
              <div key={i} className="animate-pulse rounded-xl border border-zinc-800 bg-zinc-900/40 p-4 h-[120px]" />
            ))}
          </div>
        ) : filteredCategories.length > 0 ? (
          <div className="grid gap-3">
            {filteredCategories.map((category) => (
              <div
                key={category.id}
                onClick={() => navigate(`/folder/${category.id}`)}
                className="group flex flex-col rounded-xl border border-zinc-800 bg-zinc-900/40 p-4 transition-colors hover:bg-zinc-800/80 cursor-pointer"
              >
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-zinc-800 text-indigo-400 group-hover:bg-indigo-500/20 transition-colors">
                      <FolderIcon size={20} />
                    </div>
                    <div>
                      <h3 className="font-medium text-zinc-200">{category.name || 'Untitled Category'}</h3>
                      <div className="flex items-center gap-2 text-xs text-zinc-500">
                        <span>
                          {category.createdAt ? safeFormatDate(category.createdAt, { 
                            month: 'short', day: 'numeric', year: 'numeric' 
                          }) : 'No date'}
                        </span>
                        <span className="h-1 w-1 rounded-full bg-zinc-700"></span>
                        <span>{folderStats[category.id]?.count || 0} {(folderStats[category.id]?.count === 1) ? 'photo' : 'photos'}</span>
                      </div>
                    </div>
                  </div>
                  <ChevronRight className="text-zinc-600 group-hover:text-zinc-300 transition-colors" size={20} />
                </div>
                
                <div className="flex items-center gap-2 border-t border-zinc-800/50 pt-3">
                  <button 
                    onClick={(e) => triggerUpload(e, category.id, 'gallery')}
                    disabled={uploadingId === category.id}
                    className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-zinc-800 py-2 text-xs font-medium text-zinc-300 transition-colors hover:bg-zinc-700 active:scale-95 disabled:opacity-50"
                  >
                    {uploadingId === category.id ? <Loader2 size={14} className="animate-spin" /> : <ImageIcon size={14} />}
                    Gallery (Multiple)
                  </button>
                  <button 
                    onClick={(e) => triggerUpload(e, category.id, 'camera')}
                    disabled={uploadingId === category.id}
                    className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-indigo-500/20 py-2 text-xs font-medium text-indigo-400 transition-colors hover:bg-indigo-500/30 active:scale-95 disabled:opacity-50"
                  >
                    {uploadingId === category.id ? <Loader2 size={14} className="animate-spin" /> : <Camera size={14} />}
                    Camera
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-zinc-800 py-16 text-center">
            <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-zinc-900 text-zinc-500">
              <FolderIcon size={24} />
            </div>
            <p className="text-zinc-400">No categories found.</p>
            <p className="text-sm text-zinc-600">Create one above to get started.</p>
          </div>
        )}
      </section>
    </div>
  );
}
