'use strict';
const fs = require('node:fs');
const path = require('node:path');
const {randomInt} = require('node:crypto');
const imageTypes = {'.jpg':'image/jpeg','.jpeg':'image/jpeg','.png':'image/png','.gif':'image/gif','.webp':'image/webp','.avif':'image/avif','.bmp':'image/bmp','.svg':'image/svg+xml'};

function uploadConfig(settings, root) {
  const value = settings.upload_images || {};
  const count = value.count ?? 3;
  if (!Number.isInteger(count) || count < 1) throw new Error('upload_images.count must be a positive integer');
  const folder = value.folder ?? 'automation_tests/uploadimagetest';
  if (typeof folder !== 'string' || !folder.trim()) throw new Error('upload_images.folder must be a non-empty path');
  return {folder:path.resolve(root,folder),count};
}

function selectImages(config, accept='', multiple=true, pick=randomInt) {
  if (!config) throw new Error('Image upload configuration is missing');
  const tokens=accept.toLowerCase().split(',').map(s=>s.trim()).filter(Boolean);
  const files=fs.readdirSync(config.folder,{withFileTypes:true}).filter(entry=>{
    if (!entry.isFile()) return false; // Do not follow symlinks or scan subfolders.
    const ext=path.extname(entry.name).toLowerCase(), mime=imageTypes[ext];
    return !!mime && (!tokens.length || tokens.some(t=>t===ext || t===mime || t==='image/*' || t==='*/*'));
  }).map(entry=>path.join(config.folder,entry.name));
  const available=files.length;
  const count=Math.min(config.count,multiple?config.count:1,available);
  for(let i=0;i<count;i++) {
    const j=i+pick(files.length-i);
    [files[i],files[j]]=[files[j],files[i]];
  }
  return {files:files.slice(0,count),available,requested:config.count,singleFile:!multiple};
}
module.exports={uploadConfig,selectImages};
