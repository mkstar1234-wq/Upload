import { useState, useEffect } from 'react';
import { db } from '../firebase';
import { ref, get, set, onValue, off } from 'firebase/database';
import { Save, Loader2, Info, Database } from 'lucide-react';
import { showToast } from '../components/Toast';

export default function SettingsPage() {
  const [targetSize, setTargetSize] = useState<number>(50);
  const [swipeGesture, setSwipeGesture] = useState<'horizontal' | 'vertical'>('horizontal');
  const [erudaEnabled, setErudaEnabled] = useState<boolean>(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const [totalBytes, setTotalBytes] = useState<number | null>(null);
  const [totalPhotos, setTotalPhotos] = useState<number | null>(null);

  useEffect(() => {
    // Fetch current setting
    const fetchSettings = async () => {
      try {
        const [targetSnap, swipeSnap] = await Promise.all([
          get(ref(db, 'settings/compressionTarget')),
          get(ref(db, 'settings/swipeGesture'))
        ]);
        if (targetSnap.exists()) {
          setTargetSize(targetSnap.val());
        }
        if (swipeSnap.exists()) {
          setSwipeGesture(swipeSnap.val());
        }
        // Load Eruda from localStorage
        try {
          const erudaLocal = localStorage.getItem('erudaEnabled') === 'true';
          setErudaEnabled(erudaLocal);
        } catch (e) {
          console.error("Failed to load Eruda settings from localStorage:", e);
        }
      } catch (err) {
        console.error("Failed to load settings:", err);
      } finally {
        setLoading(false);
      }
    };
    fetchSettings();
    
    // Listen to global stats
    const statsRef = ref(db, 'stats/global');
    const unsubscribe = onValue(statsRef, (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.val();
        setTotalBytes(data?.sizeInBytes || 0);
        setTotalPhotos(data?.count || 0);
      } else {
        setTotalBytes(0);
        setTotalPhotos(0);
      }
    }, (err) => console.error("Failed to load settings stats:", err));
    
    return () => {
      unsubscribe();
    };
  }, []);

  const handleSave = async () => {
    setSaving(true);
    setSaved(false);
    try {
      await set(ref(db, 'settings/compressionTarget'), targetSize);
      await set(ref(db, 'settings/swipeGesture'), swipeGesture);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      console.error("Failed to save settings:", err);
      showToast("Failed to save settings. Please check your Firebase configuration.", "error");
    } finally {
      setSaving(false);
    }
  };

  
  
  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  if (loading) {
    return (
      <div className="mx-auto max-w-md space-y-6">
        <div className="h-[200px] animate-pulse rounded-2xl bg-zinc-900/40 border border-zinc-800" />
        <div className="h-[150px] animate-pulse rounded-2xl bg-zinc-900/40 border border-zinc-800" />
        <div className="h-[150px] animate-pulse rounded-2xl bg-zinc-900/40 border border-zinc-800" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-md space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-zinc-100">Settings</h1>
        <p className="mt-1 text-sm text-zinc-400">Configure global application preferences.</p>
      </div>

      <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-5">
        <div className="mb-4 flex items-center justify-between">
          <label htmlFor="compression" className="font-medium text-zinc-200">
            Target Upload Size
          </label>
          <span className="rounded bg-indigo-500/20 px-2 py-1 text-sm font-bold text-indigo-400">
            {targetSize} KB
          </span>
        </div>
        
        <input
          id="compression"
          type="range"
          min="10"
          max="50"
          step="1"
          value={targetSize}
          onChange={(e) => setTargetSize(Number(e.target.value))}
          className="h-2 w-full cursor-pointer appearance-none rounded-lg bg-zinc-800 accent-indigo-500 outline-none"
        />
        
        <div className="mt-2 flex justify-between text-xs font-medium text-zinc-500">
          <span>10 KB (Lowest Quality)</span>
          <span>50 KB (Better Quality)</span>
        </div>
        
        <div className="mt-6 flex items-start gap-3 rounded-lg bg-blue-500/10 p-3 text-sm text-blue-400">
          <Info size={18} className="mt-0.5 shrink-0" />
          <p>
            Nano Snap will aggressively compress images locally in your browser to meet this target size before saving to Firebase Realtime Database. 
            Lower sizes significantly save database usage but reduce image clarity.
          </p>
        </div>
      </div>

      <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-5">
        <div className="mb-4">
          <label className="font-medium text-zinc-200">
            Photo Swipe Gesture
          </label>
          <p className="text-xs text-zinc-500 mt-1">Choose how to navigate photos in fullscreen mode.</p>
        </div>
        
        <div className="flex gap-4">
          <label className="flex items-center gap-2 cursor-pointer">
            <input 
              type="radio" 
              name="swipeGesture" 
              value="horizontal" 
              checked={swipeGesture === 'horizontal'} 
              onChange={() => setSwipeGesture('horizontal')}
              className="accent-indigo-500"
            />
            <span className="text-sm font-medium text-zinc-300">Left / Right</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input 
              type="radio" 
              name="swipeGesture" 
              value="vertical" 
              checked={swipeGesture === 'vertical'} 
              onChange={() => setSwipeGesture('vertical')}
              className="accent-indigo-500"
            />
            <span className="text-sm font-medium text-zinc-300">Up / Down</span>
          </label>
        </div>
      </div>

      <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-5">
        <div className="mb-4">
          <label className="font-medium text-zinc-200">
            Developer Console (Eruda)
          </label>
          <p className="text-xs text-zinc-500 mt-1">Enable a floating developer console for debugging on mobile devices.</p>
        </div>
        
        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              const newValue = !erudaEnabled;
              setErudaEnabled(newValue);
              try {
                localStorage.setItem('erudaEnabled', String(newValue));
              } catch (e) {
                console.error("Failed to save Eruda settings to localStorage:", e);
              }
              window.dispatchEvent(new Event('eruda-toggle'));
            }}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
              erudaEnabled ? 'bg-indigo-500' : 'bg-zinc-700'
            }`}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                erudaEnabled ? 'translate-x-6' : 'translate-x-1'
              }`}
            />
          </button>
          <span className="text-sm font-medium text-zinc-300">
            {erudaEnabled ? 'Enabled' : 'Disabled'}
          </span>
        </div>
      </div>

      <button
        onClick={handleSave}
        disabled={saving}
        className="flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 py-3 font-medium text-white transition-colors hover:bg-indigo-700 active:scale-[0.98] disabled:opacity-50"
      >
        {saving ? (
          <Loader2 className="animate-spin" size={20} />
        ) : (
          <Save size={20} />
        )}
        {saving ? 'Saving...' : 'Save Settings'}
      </button>

      {saved && (
        <p className="text-center text-sm font-medium text-emerald-400">
          Settings saved successfully!
        </p>
      )}

      {/* Storage Tracker */}
      <div className="mt-8 rounded-xl border border-zinc-800 bg-zinc-900/50 p-5">
        <div className="mb-4 flex items-center gap-2">
          <Database size={20} className="text-zinc-400" />
          <h2 className="text-lg font-medium text-zinc-100">Database Storage</h2>
        </div>
        <p className="mb-4 text-sm text-zinc-400">
          Check how much data is being used by uploaded Base64 photos in the Realtime Database.
        </p>
        
        <div className="flex items-center justify-between border-t border-zinc-800 pt-4">
          
          
          {totalBytes !== null && totalPhotos !== null && (
            <span className="text-lg font-bold text-indigo-400">
              {formatBytes(totalBytes)} | {totalPhotos} Photos
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
