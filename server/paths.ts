/**
 * Where generated media lives. In production the database sits on the Railway volume (DATA_FILE=/data/…), so
 * creatives, uploads and Studio layers go next to it and survive redeploys; locally that is ./data.
 */
import { dirname, resolve } from 'node:path';

export const mediaDir = (...parts: string[]) =>
  resolve(process.env.MEDIA_DIR?.trim() || (process.env.DATA_FILE?.trim() ? dirname(process.env.DATA_FILE.trim()) : 'data'), ...parts);
