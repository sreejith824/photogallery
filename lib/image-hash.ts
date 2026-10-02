import { createHash } from "crypto";
import sharp from "sharp";

// Fingerprints for duplicate detection. Kept free of app imports so the Node
// scripts in scripts/ can use it too.

// Two photos whose difference hashes differ in at most this many of 64 bits
// look the same (resized, re-compressed or lightly edited copies, burst shots)
export const LOOKALIKE_MAX_DISTANCE = 4;

// Exact fingerprint of the file's bytes
export function sha256Hex(buffer: Buffer): string {
  return createHash("sha256").update(buffer).digest("hex");
}

// 64-bit difference hash: shrink to 9x8 greyscale and record whether each
// pixel is brighter than its right-hand neighbour. Survives resizing and
// re-compression; returned as 16 hex characters.
export async function differenceHash(buffer: Buffer): Promise<string> {
  const pixels = await sharp(buffer)
    .rotate()
    .greyscale()
    .resize(9, 8, { fit: "fill" })
    .raw()
    .toBuffer();

  let hex = "";
  for (let row = 0; row < 8; row++) {
    // Each row gives 8 bits = 2 hex digits
    let byte = 0;
    for (let col = 0; col < 8; col++) {
      const left = pixels[row * 9 + col];
      const right = pixels[row * 9 + col + 1];
      byte = (byte << 1) | (left > right ? 1 : 0);
    }
    hex += byte.toString(16).padStart(2, "0");
  }
  return hex;
}

// Number of differing bits between two difference hashes
export function hammingDistance(a: string, b: string): number {
  let count = 0;
  for (let i = 0; i < 16; i++) {
    let diff = parseInt(a[i], 16) ^ parseInt(b[i], 16);
    while (diff) {
      count += diff & 1;
      diff >>= 1;
    }
  }
  return count;
}
