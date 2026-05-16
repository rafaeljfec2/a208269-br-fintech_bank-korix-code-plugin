#!/usr/bin/env node
import sharp from 'sharp';
import { readFileSync } from 'fs';

const svgBuffer = readFileSync('src/webview/assets/tr-icon.svg');

await sharp(svgBuffer)
  .resize(128, 128)
  .png()
  .toFile('resources/icon.png');

console.log('✓ Icon converted to PNG (128x128)');
