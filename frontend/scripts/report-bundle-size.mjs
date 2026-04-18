import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';

const root = '../anolis_workbench/frontend/dist';
const assetsDir = join(root, 'assets');

function formatKiB(bytes) {
  return `${(bytes / 1024).toFixed(1)} KiB`;
}

function getFiles(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) {
      out.push(...getFiles(full));
    } else {
      out.push(full);
    }
  }
  return out;
}

const files = getFiles(root);
let totalRaw = 0;
let totalGzip = 0;
const rows = [];

for (const file of files) {
  const raw = readFileSync(file);
  const rawBytes = raw.byteLength;
  const gzipBytes = gzipSync(raw).byteLength;
  totalRaw += rawBytes;
  totalGzip += gzipBytes;
  if (file.includes(`${assetsDir}`) && /\.(js|css)$/.test(file)) {
    rows.push({ file, rawBytes, gzipBytes });
  }
}

rows.sort((a, b) => b.rawBytes - a.rawBytes);

console.log('Frontend bundle size report');
console.log(`Total dist (raw):  ${formatKiB(totalRaw)}`);
console.log(`Total dist (gzip): ${formatKiB(totalGzip)}`);
console.log('Top JS/CSS assets:');
for (const row of rows.slice(0, 10)) {
  console.log(`- ${row.file}: raw ${formatKiB(row.rawBytes)}, gzip ${formatKiB(row.gzipBytes)}`);
}
