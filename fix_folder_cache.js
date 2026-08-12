const fs = require('fs');
let file = fs.readFileSync('src/pages/Folder.tsx', 'utf8');

file = file.replace(
  /const \[photos, setPhotos\] = useState<Photo\[\]>\(\[\]\);/,
  `const [photos, setPhotos] = useState<Photo[]>(() => {
    try {
      if (!id) return [];
      const cached = localStorage.getItem(\`nanoSnap_folder_\${id}_photos\`);
      return cached ? JSON.parse(cached) : [];
    } catch { return []; }
  });`
);

file = file.replace(
  /const \[folderName, setFolderName\] = useState<string>\(''\);/,
  `const [folderName, setFolderName] = useState<string>(() => {
    try {
      if (!id) return '';
      const cached = localStorage.getItem(\`nanoSnap_folder_\${id}_name\`);
      return cached ? cached : '';
    } catch { return ''; }
  });`
);

file = file.replace(
  /const \[loading, setLoading\] = useState\(true\);/,
  `const [loading, setLoading] = useState(() => {
    try {
      if (!id) return true;
      return !localStorage.getItem(\`nanoSnap_folder_\${id}_photos\`);
    } catch { return true; }
  });`
);

file = file.replace(
  /setFolderName\(data\.name \|\| 'Untitled Folder'\);/,
  `const newName = data.name || 'Untitled Folder';
      setFolderName(newName);
      if (id) localStorage.setItem(\`nanoSnap_folder_\${id}_name\`, newName);`
);

file = file.replace(
  /setPhotos\(parsedPhotos\);\n        setHasMore\(parsedPhotos\.length === 10\);/,
  `setPhotos(parsedPhotos);
        setHasMore(parsedPhotos.length === 10);
        if (id && (!selectedMonth || selectedMonth === '')) {
          localStorage.setItem(\`nanoSnap_folder_\${id}_photos\`, JSON.stringify(parsedPhotos));
        }`
);

file = file.replace(
  /setPhotos\(\[\]\);\n        setHasMore\(false\);/,
  `setPhotos([]);
        setHasMore(false);
        if (id && (!selectedMonth || selectedMonth === '')) {
          localStorage.setItem(\`nanoSnap_folder_\${id}_photos\`, '[]');
        }`
);

fs.writeFileSync('src/pages/Folder.tsx', file);
