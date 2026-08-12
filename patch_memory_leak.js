const fs = require('fs');
let file = fs.readFileSync('src/pages/Folder.tsx', 'utf8');

file = file.replace(
  /    const loadOffline = async \(\) => \{[\s\S]*?    \};\n\n    loadOffline\(\);\n    const intervalId = setInterval\(loadOffline, 3000\);\n\n    return \(\) => \{\n      isMounted = false;\n      clearInterval\(intervalId\);\n      objectUrls\.forEach\(url => URL\.revokeObjectURL\(url\)\);\n    \};/,
  `    const loadOffline = async () => {
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
    };`
);

fs.writeFileSync('src/pages/Folder.tsx', file);
