const fs = require('fs');
let file = fs.readFileSync('vite.config.ts', 'utf8');

file = file.replace(
  /navigateFallback: 'index.html',/,
  `navigateFallback: basePath + 'index.html',`
);

fs.writeFileSync('vite.config.ts', file);
