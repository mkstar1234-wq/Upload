const fs = require('fs');
let file = fs.readFileSync('src/pages/Folder.tsx', 'utf8');

file = file.replace(
  /import \{ processAndUploadImages \} from '\.\.\/lib\/imageHandler';/,
  `import { processAndUploadImages } from '../lib/imageHandler';\nimport { getOfflinePhotos } from '../lib/offlineStore';`
);

file = file.replace(
  /const \[photos, setPhotos\] = useState<Photo\[\]>\(\(\) => \{/,
  `const [offlinePendingPhotos, setOfflinePendingPhotos] = useState<Photo[]>([]);\n  const [photos, setPhotos] = useState<Photo[]>(() => {`
);

file = file.replace(
  /  const loadMoreRef = useRef<HTMLDivElement>\(null\);/,
  `  const loadMoreRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!id) return;
    let objectUrls: string[] = [];
    let isMounted = true;

    const loadOffline = async () => {
      try {
        const allOffline = await getOfflinePhotos();
        const folderOffline = allOffline.filter(p => p.folderId === id);

        const mapped = await Promise.all(folderOffline.map(async p => {
          try {
            const res = await fetch(p.url);
            const blob = await res.blob();
            const objectUrl = URL.createObjectURL(blob);
            objectUrls.push(objectUrl);
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
          // Sort newest first
          mapped.sort((a, b) => b.createdAt - a.createdAt);
          setOfflinePendingPhotos(mapped);
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
  }, [id]);`
);

file = file.replace(
  /const filteredPhotos = showFavoritesOnly \? photos\.filter\(p => p\.isFavorite\) : photos;/,
  `const combinedPhotos = [...offlinePendingPhotos, ...photos].filter((v, i, a) => a.findIndex(t => t.id === v.id) === i);
  const filteredPhotos = showFavoritesOnly ? combinedPhotos.filter(p => p.isFavorite) : combinedPhotos;`
);

fs.writeFileSync('src/pages/Folder.tsx', file);
