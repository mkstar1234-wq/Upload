const fs = require('fs');
let file = fs.readFileSync('src/pages/Folder.tsx', 'utf8');

file = file.replace(
  /  if \(loading\) {\n    return \(\n      <div className="space-y-6">\n        <div className="h-24 animate-pulse rounded-xl bg-zinc-900\/40 border border-zinc-800" \/>\n        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">\n          \{\[1, 2, 3, 4, 5, 6\]\.map\(i => \(\n            <div key=\{i\} className="aspect-square animate-pulse rounded-lg bg-zinc-900\/40 border border-zinc-800" \/>\n          \)\)\}\n        <\/div>\n      <\/div>\n    \);\n  }/,
  ''
);

file = file.replace(
  /        \{groups\.length > 0 \? \(/,
  `        {loading ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {[1, 2, 3, 4, 5, 6].map(i => (
              <div key={i} className="aspect-square animate-pulse rounded-lg bg-zinc-900/40 border border-zinc-800" />
            ))}
          </div>
        ) : groups.length > 0 ? (`
);

fs.writeFileSync('src/pages/Folder.tsx', file);
