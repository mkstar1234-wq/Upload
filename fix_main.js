const fs = require('fs');
let file = fs.readFileSync('src/main.tsx', 'utf8');

file = file.replace(
  /\/\/ Unregister all old service workers immediately before registering new ones\nif \('serviceWorker' in navigator\) \{\n  navigator\.serviceWorker\.getRegistrations\(\)\.then\(function\(registrations\) \{\n    for\(let registration of registrations\) \{\n      registration\.unregister\(\);\n    \}\n  \}\)\.catch\(function\(err\) \{\n    console\.log\('Service Worker registration failed: ', err\);\n  \}\);\n\}\n/,
  ''
);

fs.writeFileSync('src/main.tsx', file);
