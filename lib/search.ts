// Plain-language gallery search: "nature photos from summer 2018".
// A small rule-based parser, no AI. Years, decades, seasons and months become
// date filters, category names become category filters, filler words are
// dropped, and every other word must appear in the tags, caption or place.
// Pure functions only, so the gallery (chips) and /api/photos (SQL) read a
// query the same way.

import { matchCategory, type Category } from "./categories.ts";

export interface SearchChip {
  label: string;
  // Query words behind this chip; removing the chip drops them from the query
  words: string[];
}

export interface ParsedSearch {
  categories: string[]; // slugs, any of them matches
  years: number[];
  months: number[]; // 1-12, from month names
  seasons: Season[];
  terms: string[]; // all of them must match tags, caption or place
  chips: SearchChip[];
}

type Season = "spring" | "summer" | "autumn" | "winter";

// Northern hemisphere. Winter runs Dec-Feb, so "winter 2018" is Dec 2018 - Feb 2019.
const SEASON_MONTHS: Record<Season, number[]> = {
  spring: [3, 4, 5],
  summer: [6, 7, 8],
  autumn: [9, 10, 11],
  winter: [12, 1, 2],
};
const SEASON_WORDS: Record<string, Season> = {
  spring: "spring",
  summer: "summer",
  autumn: "autumn",
  fall: "autumn",
  winter: "winter",
};

const MONTHS = [
  "january", "february", "march", "april", "may", "june",
  "july", "august", "september", "october", "november", "december",
];

const FILLER = new Set([
  "photo", "photos", "pic", "pics", "picture", "pictures", "image", "images",
  "shot", "shots", "snap", "snaps", "show", "me", "my", "all", "some", "any", "the", "a", "an",
  "from", "in", "of", "at", "on", "during", "taken", "with", "and", "or", "by",
  "near", "around", "for", "to", "was", "were", "when",
]);

// Within one edit (insert, delete or substitute): "phota" ~ "photo"
function nearlyEqual(a: string, b: string): boolean {
  if (a === b) return true;
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0;
  while (i < a.length && a[i] === b[i]) i++;
  if (a.length === b.length) return a.slice(i + 1) === b.slice(i + 1);
  return a.length > b.length ? a.slice(i + 1) === b.slice(i) : a.slice(i) === b.slice(i + 1);
}

// Exact word, or a one-letter typo for words long enough not to collide with
// real words ("wood" must not become "food", "wall" not "fall")
function lookup<T>(word: string, table: Record<string, T>): T | undefined {
  if (word in table) return table[word];
  if (word.length < 5) return undefined;
  const key = Object.keys(table).find((k) => k.length >= 5 && nearlyEqual(word, k));
  return key === undefined ? undefined : table[key];
}

const capitalize = (w: string) => w.charAt(0).toUpperCase() + w.slice(1);

export function parseSearch(query: string, categories: Category[]): ParsedSearch {
  const result: ParsedSearch = { categories: [], years: [], months: [], seasons: [], terms: [], chips: [] };
  const words = query.toLowerCase().split(/[^\p{L}\p{N}-]+/u).filter(Boolean);

  const categoryTable = Object.fromEntries(
    categories.flatMap((c) => [[c.slug, c], [c.label.toLowerCase(), c]])
  );
  // Only the "photo" words get typo matching; short filler like "some" would eat "rome"
  const photoWords = Object.fromEntries(
    ["photo", "photos", "picture", "pictures", "image", "images"].map((w) => [w, true])
  );
  const monthTable = Object.fromEntries(MONTHS.flatMap((m, i) => [[m, i + 1], [m.slice(0, 3), i + 1]]));

  const addCategory = (category: Category, used: string[]) => {
    if (result.categories.includes(category.slug)) return;
    result.categories.push(category.slug);
    result.chips.push({ label: category.label, words: used });
  };

  for (let i = 0; i < words.length; i++) {
    const word = words[i];

    // Two-word categories first ("street art")
    const next = words[i + 1];
    const pairSlug = next ? matchCategory(`${word} ${next}`, categories) : null;
    const pair = pairSlug ? categories.find((c) => c.slug === pairSlug) : undefined;
    if (pair) {
      addCategory(pair, [word, next]);
      i++;
      continue;
    }

    if (/^(19|20)\d{2}$/.test(word)) {
      const year = Number(word);
      if (!result.years.includes(year)) result.years.push(year);
      result.chips.push({ label: word, words: [word] });
      continue;
    }

    // "2010s" -> 2010-2019
    if (/^(19|20)\d0s$/.test(word)) {
      const start = Number(word.slice(0, 4));
      for (let y = start; y < start + 10; y++) if (!result.years.includes(y)) result.years.push(y);
      result.chips.push({ label: word, words: [word] });
      continue;
    }

    const season = lookup(word, SEASON_WORDS);
    if (season) {
      if (!result.seasons.includes(season)) result.seasons.push(season);
      result.chips.push({ label: capitalize(season), words: [word] });
      continue;
    }

    // Full names (typos allowed) or exact three-letter forms
    const month = lookup(word, monthTable);
    if (month) {
      if (!result.months.includes(month)) result.months.push(month);
      result.chips.push({ label: capitalize(MONTHS[month - 1]), words: [word] });
      continue;
    }

    const category =
      categoryTable[word] ??
      (() => {
        const slug = matchCategory(word, categories);
        return slug ? categories.find((c) => c.slug === slug) : undefined;
      })() ??
      lookup(word, categoryTable);
    if (category) {
      addCategory(category, [word]);
      continue;
    }

    if (FILLER.has(word) || lookup(word, photoWords)) continue;

    if (word.length >= 2 && !result.terms.includes(word)) {
      result.terms.push(word);
      result.chips.push({ label: `“${word}”`, words: [word] });
    }
  }

  return result;
}

// The capture dates a search allows, in the shape the SQL needs. With years,
// months and seasons pin down exact year-months; without, they match any year.
export function searchPeriods(search: ParsedSearch): {
  yearMonths: string[]; // "2018-07"
  years: number[];
  months: number[];
} {
  const months = [...new Set([...search.months, ...search.seasons.flatMap((s) => SEASON_MONTHS[s])])];
  if (search.years.length === 0) return { yearMonths: [], years: [], months };
  if (months.length === 0) return { yearMonths: [], years: search.years, months: [] };

  const pad = (m: number) => String(m).padStart(2, "0");
  const yearMonths = new Set<string>();
  for (const year of search.years) {
    for (const m of search.months) yearMonths.add(`${year}-${pad(m)}`);
    for (const season of search.seasons) {
      for (const m of SEASON_MONTHS[season]) {
        // January and February belong to the winter that started the December before
        const y = season === "winter" && m < 12 ? year + 1 : year;
        yearMonths.add(`${y}-${pad(m)}`);
      }
    }
  }
  return { yearMonths: [...yearMonths], years: [], months: [] };
}
