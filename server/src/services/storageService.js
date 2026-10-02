import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { env } from '../config/env.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const UPLOAD_DIR = path.resolve(__dirname, '../../uploads');

export const ALLOWED_TYPES = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/avif': 'avif',
  'application/pdf': 'pdf',
  'audio/mpeg': 'mp3',
};

/** Magic-byte check so a renamed executable can't pass as an image. */
function sniff(buffer, mime) {
  const b = buffer.subarray(0, 12);
  const hex = b.toString('hex');
  switch (mime) {
    case 'image/jpeg':
      return hex.startsWith('ffd8ff');
    case 'image/png':
      return hex.startsWith('89504e47');
    case 'image/webp':
      return b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP';
    case 'image/avif':
      return b.toString('ascii', 4, 12).startsWith('ftypavi');
    case 'application/pdf':
      return b.toString('ascii', 0, 5) === '%PDF-';
    case 'audio/mpeg':
      return hex.startsWith('494433') || hex.startsWith('fffb') || hex.startsWith('fff3');
    default:
      return false;
  }
}

export function safeBaseName(original = 'file') {
  return (
    path
      .parse(original)
      .name.normalize('NFKD')
      .replace(/[^a-zA-Z0-9-_]/g, '-')
      .replace(/-+/g, '-')
      .slice(0, 50) || 'file'
  );
}

const drivers = {
  async local(file, folder) {
    const ext = ALLOWED_TYPES[file.mimetype];
    const name = `${safeBaseName(file.originalname)}-${crypto.randomBytes(6).toString('hex')}.${ext}`;
    const dir = path.join(UPLOAD_DIR, folder);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, name), file.buffer);
    return { url: `${env.apiUrl}/uploads/${folder}/${name}`, key: `${folder}/${name}` };
  },
  // Ready-to-complete adapters: same signature, swap via STORAGE_DRIVER.
  async cloudinary() {
    throw new Error('Cloudinary driver not configured — implement in storageService.drivers.cloudinary');
  },
  async s3() {
    throw new Error('S3 / Spaces driver not configured — implement in storageService.drivers.s3');
  },
};

export async function storeFile(file, folder = 'misc') {
  if (!ALLOWED_TYPES[file.mimetype]) throw Object.assign(new Error('File type not allowed'), { status: 400 });
  if (!sniff(file.buffer, file.mimetype)) {
    throw Object.assign(new Error('File content does not match its type'), { status: 400 });
  }
  const safeFolder = folder.replace(/[^a-z0-9-]/gi, '').slice(0, 30) || 'misc';
  const driver = drivers[env.storage.driver] || drivers.local;
  return driver(file, safeFolder);
}
