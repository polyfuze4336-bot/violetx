// One-off icon generator: rasterizes the brand SVG into the PNG assets Next.js
// and PWAs need. Run with: node scripts/gen-icons.mjs
import sharp from "sharp";
import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";

const svg = `<svg width="512" height="512" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#6D28D9" />
      <stop offset="55%" stop-color="#9333EA" />
      <stop offset="100%" stop-color="#C026D3" />
    </linearGradient>
  </defs>
  <rect width="48" height="48" rx="13" fill="url(#g)" />
  <path d="M15 15 L33 33" stroke="#ffffff" stroke-opacity="0.7" stroke-width="5" stroke-linecap="round" />
  <path d="M14 34 L23 25 L27 29 L34 14" fill="none" stroke="#ffffff" stroke-width="5" stroke-linecap="round" stroke-linejoin="round" />
</svg>`;

const targets = [
  { path: "src/app/icon.png", size: 64 },
  { path: "src/app/apple-icon.png", size: 180 },
  { path: "public/icon-192.png", size: 192 },
  { path: "public/icon-512.png", size: 512 },
];

for (const { path, size } of targets) {
  await mkdir(dirname(path), { recursive: true });
  await sharp(Buffer.from(svg)).resize(size, size).png().toFile(path);
  console.log(`wrote ${path} (${size}x${size})`);
}
