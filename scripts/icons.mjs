import fs from 'node:fs/promises';
import sharp from 'sharp';
import { fileURLToPath } from 'node:url';
const svg = await fs.readFile(new URL('../build/icon.svg',import.meta.url));
await sharp(svg).resize(512,512).png().toFile(fileURLToPath(new URL('../build/icon.png',import.meta.url)));
const sizes=[16,32,48,64,128,256], images=await Promise.all(sizes.map(size=>sharp(svg).resize(size,size).png().toBuffer()));
const header=Buffer.alloc(6+sizes.length*16);header.writeUInt16LE(1,2);header.writeUInt16LE(sizes.length,4);let offset=header.length;
for(let i=0;i<sizes.length;i++){const at=6+i*16;header[at]=sizes[i]===256?0:sizes[i];header[at+1]=header[at];header.writeUInt16LE(1,at+4);header.writeUInt16LE(32,at+6);header.writeUInt32LE(images[i].length,at+8);header.writeUInt32LE(offset,at+12);offset+=images[i].length;}
await fs.writeFile(new URL('../build/icon.ico',import.meta.url),Buffer.concat([header,...images]));
