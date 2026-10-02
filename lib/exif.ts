import * as exifr from "exifr";

const DATE_TAGS = [
  "DateTimeOriginal",
  "CreateDate",
  "ModifyDate",
  "OffsetTimeOriginal",
  "OffsetTime",
];

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export interface CaptureDate {
  takenAt: Date;
  // Year/month in the photo's local time, not the server's
  year: string;
  month: string;
}

// Capture time from EXIF. Reads the raw "YYYY:MM:DD HH:MM:SS" string and applies
// the stored UTC offset, so the result doesn't depend on the server's timezone.
export async function getCaptureDate(buffer: Buffer): Promise<CaptureDate | null> {
  const tags = await exifr.parse(buffer, {
    pick: DATE_TAGS,
    reviveValues: false,
  });
  const raw: string | undefined =
    tags?.DateTimeOriginal || tags?.CreateDate || tags?.ModifyDate;
  const match = raw?.match(/^(\d{4}):(\d{2}):(\d{2}) (\d{2}:\d{2}:\d{2})/);
  if (!match) return null;

  const offset: string = tags.OffsetTimeOriginal || tags.OffsetTime || "";
  const takenAt = new Date(
    `${match[1]}-${match[2]}-${match[3]}T${match[4]}${offset}`
  );
  if (isNaN(takenAt.getTime())) return null;

  return { takenAt, year: match[1], month: MONTHS[Number(match[2]) - 1] };
}

// Tags derived from capture date and location, e.g. ["2026", "August 2026", "Øyer", "Norway"]
export function buildAutoTags(
  capture: CaptureDate | null,
  locality: string | null,
  country: string | null
): string[] {
  const tags: string[] = [];
  if (capture) tags.push(capture.year, `${capture.month} ${capture.year}`);
  if (locality) tags.push(locality);
  if (country && country !== locality) tags.push(country);
  return tags;
}
