













/**
 * Converts various time string formats to minutes (number).
 * Handles: "08:00", "8:00", "0800", "800", "08.00", "8h00", "08 00"
 * Also handles OCR artifacts from dot-matrix fonts: "10:S3", "O8:00", "I0:00"
 * Returns null if invalid or ambiguous like "[?]".
 */
export const timeToMinutes = (time: string): number | null => {
  if (!time) return null;
  // Safety check for uncertainty markers
  if (time.includes('?') || time.includes('[') || time.includes(']')) return null;
  
  // 1. CLEAN UP OCR ARTIFACTS
  let cleanTime = time.toLowerCase().trim();
  
  cleanTime = cleanTime.replace(/[oö]/g, '0'); // O -> 0
  cleanTime = cleanTime.replace(/[lIi|]/g, '1'); // l, I, | -> 1
  cleanTime = cleanTime.replace(/[s]/g, '5'); // S -> 5
  cleanTime = cleanTime.replace(/[b]/g, '8'); // B -> 8
  cleanTime = cleanTime.replace(/g/g, '9');   // g -> 9
  
  // 2. NORMALIZE SEPARATORS
  cleanTime = cleanTime.replace(/[.h\s]/g, ':');
  cleanTime = cleanTime.replace(/:+/g, ':');

  // 3. HANDLE MISSING COLONS
  if (!cleanTime.includes(':')) {
    if (cleanTime.length === 4) {
      cleanTime = cleanTime.slice(0, 2) + ':' + cleanTime.slice(2);
    } else if (cleanTime.length === 3) {
      cleanTime = cleanTime.slice(0, 1) + ':' + cleanTime.slice(1);
    }
  }

  const parts = cleanTime.split(':');
  if (parts.length < 2) return null;

  const hours = parseInt(parts[0], 10);
  const minutes = parseInt(parts[1], 10);

  if (isNaN(hours) || isNaN(minutes)) return null;
  if (hours < 0 || hours > 24 || minutes < 0 || minutes > 59) return null;

  return hours * 60 + minutes;
};

/**
 * Converts minutes (number) to "HH:MM" string.
 */
export const minutesToTime = (totalMinutes: number): string => {
  const isNegative = totalMinutes < 0;
  const absoluteMinutes = Math.abs(totalMinutes);
  const hours = Math.floor(absoluteMinutes / 60);
  const mins = absoluteMinutes % 60;
  return `${isNegative ? '-' : ''}${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
};

/**
 * Core Logic: Merges consecutive periods if the gap between them is < 20 mins (Coffee Break).
 * UPDATED: Changed from 30 to 20 minutes as requested.
 * Example: 08:00-10:00 and 10:15-12:00. Gap is 15min. 
 * Result: 08:00-12:00 (The inner exit/entry are removed).
 */
const mergeCoffeeBreaks = (times: number[]): number[] => {
  if (times.length < 4) return times; // Need at least 2 pairs to have a gap

  const merged = [...times];
  let restart = true;

  while (restart) {
    restart = false;
    // Look at Gaps: Exit[i] vs Entry[i+1]
    // Structure: Entry(0), Exit(1), Entry(2), Exit(3)...
    // We check gap between index 1 and 2, 3 and 4, etc.
    for (let i = 1; i < merged.length - 2; i += 2) {
      const exitTime = merged[i];
      const nextEntryTime = merged[i+1];
      const gap = nextEntryTime - exitTime;

      // RULE: Gap < 20 minutes is considered a paid coffee break.
      // We merge the blocks by removing these two timestamps.
      if (gap > 0 && gap < 20) {
        merged.splice(i, 2); // Remove exitTime and nextEntryTime
        restart = true;
        break;
      }
    }
  }
  return merged;
};

/**
 * Filter Helper: Removes very short work blocks (< 10 mins) which are likely OCR noise
 * or double stamping.
 */
const removeShortWorkBlocks = (times: number[]): number[] => {
  const filtered = [...times];
  let restart = true;

  while (restart) {
    restart = false;
    for (let i = 0; i < filtered.length - 1; i += 2) {
      const start = filtered[i];
      const end = filtered[i+1];
      const duration = end - start;

      // Noise filter
      if (duration < 10) {
        filtered.splice(i, 2); 
        restart = true;
        break;
      }
    }
  }
  return filtered;
};

/**
 * Centralized processing function used by both normalization and calculation
 */
const processTimeEntries = (
  entry1: string, exit1: string,
  entry2: string, exit2: string,
  entry3: string, exit3: string
): number[] => {
  // 1. Extract and Clean
  let processed = [entry1, exit1, entry2, exit2, entry3, exit3]
    .map(t => timeToMinutes(t))
    .filter((t): t is number => t !== null);

  // 2. Sort Chronologically (Fixes inverted times immediately)
  processed.sort((a, b) => a - b);

  // 3. Remove duplicate reads (threshold 5 mins)
  // Ex: AI reads 08:00 and 08:01 for the same slot
  for (let i = 0; i < processed.length - 1; i++) {
    if (processed[i+1] - processed[i] < 5) {
      processed.splice(i + 1, 1);
      i--; // Re-check index
    }
  }

  // 4. Merge Coffee Breaks (Gaps < 20 mins)
  processed = mergeCoffeeBreaks(processed);

  // 5. Remove nonsensical short work blocks
  processed = removeShortWorkBlocks(processed);

  return processed;
};

/**
 * NEW: Takes a raw list of timestamp strings (from AI),
 * Cleans them, merges coffee breaks, and maps them to the table columns.
 */
export const processRawTimestampsToColumns = (rawTimestamps: string[]) => {
  // 1. Convert to minutes
  let mins = rawTimestamps
    .map(t => timeToMinutes(t))
    .filter((t): t is number => t !== null);

  // 2. Sort Chronologically (CRITICAL: Fixes inverted times like 13:34 before 13:07)
  mins.sort((a, b) => a - b);

  // 3. Remove duplicate reads (threshold 5 mins)
  // Likely AI seeing same stamp twice or stamp + handwriting correction
  for (let i = 0; i < mins.length - 1; i++) {
    if (mins[i+1] - mins[i] < 5) {
      mins.splice(i + 1, 1);
      i--;
    }
  }

  // 4. Merge Coffee Breaks (Gaps < 20 mins)
  mins = mergeCoffeeBreaks(mins);

  // 5. Remove Noise
  mins = removeShortWorkBlocks(mins);

  // 6. Map to Columns
  return {
    entry1: mins[0] !== undefined ? minutesToTime(mins[0]) : '',
    exit1: mins[1] !== undefined ? minutesToTime(mins[1]) : '',
    entry2: mins[2] !== undefined ? minutesToTime(mins[2]) : '',
    exit2: mins[3] !== undefined ? minutesToTime(mins[3]) : '',
    entry3: mins[4] !== undefined ? minutesToTime(mins[4]) : '',
    exit3: mins[5] !== undefined ? minutesToTime(mins[5]) : '',
  };
};

/**
 * Helper: Normalizes a row by extracting all valid times, sorting them,
 * AND applying the merge logic. Kept for backward compatibility with manual edits.
 */
export const normalizeAndSortRow = (
  entry1: string, exit1: string,
  entry2: string, exit2: string,
  entry3: string, exit3: string
) => {
  const processedMinutes = processTimeEntries(entry1, exit1, entry2, exit2, entry3, exit3);

  return {
    entry1: processedMinutes[0] !== undefined ? minutesToTime(processedMinutes[0]) : '',
    exit1: processedMinutes[1] !== undefined ? minutesToTime(processedMinutes[1]) : '',
    entry2: processedMinutes[2] !== undefined ? minutesToTime(processedMinutes[2]) : '',
    exit2: processedMinutes[3] !== undefined ? minutesToTime(processedMinutes[3]) : '',
    entry3: processedMinutes[4] !== undefined ? minutesToTime(processedMinutes[4]) : '',
    exit3: processedMinutes[5] !== undefined ? minutesToTime(processedMinutes[5]) : '',
  };
};

/**
 * Calculates total worked minutes with STRICT LOGIC based on user rules.
 */
export const calculateDailyMinutes = (
  entry1: string, exit1: string,
  entry2: string, exit2: string,
  entry3: string, exit3: string
): number => {
  
  // Use the full logic: Sort -> Merge Coffee -> Remove Noise
  const processed = processTimeEntries(entry1, exit1, entry2, exit2, entry3, exit3);

  // Check for odd number of timestamps (Missing entry or exit)
  let total = 0;
  const loopLimit = processed.length % 2 === 0 ? processed.length : processed.length - 1;

  for (let i = 0; i < loopLimit; i += 2) {
    const start = processed[i];
    const end = processed[i+1];
    if (end > start) {
      total += (end - start);
    }
  }

  return total;
};

/**
 * Returns a list of warning codes for a given row
 */
export const getLaborWarnings = (
  entry1: string, exit1: string,
  entry2: string, exit2: string,
  entry3: string, exit3: string,
  totalMinutesWorked: number
): string[] => {
  const warnings: string[] = [];
  
  const rawMins = [entry1, exit1, entry2, exit2, entry3, exit3]
    .map(t => timeToMinutes(t))
    .filter((t): t is number => t !== null);
    
  if (rawMins.length > 0 && rawMins.length % 2 !== 0) {
    warnings.push("Batidas Ímpares (falta entrada ou saída)");
  }

  if (totalMinutesWorked > 12 * 60) {
    warnings.push("Jornada excede 12 horas");
  }

  // Use processed data (merged coffee) for lunch checks
  const processed = processTimeEntries(entry1, exit1, entry2, exit2, entry3, exit3);

  if (processed.length >= 4) {
    let hasValidLunch = false;
    let maxInterval = 0;

    for (let i = 1; i < processed.length - 1; i += 2) {
      const exit = processed[i];
      const entry = processed[i+1];
      const diff = entry - exit;

      if (diff > maxInterval) maxInterval = diff;

      if (diff >= 60) hasValidLunch = true;
    }

    if (maxInterval > 150) { 
       warnings.push("Intervalo muito longo (>2h30)");
    }
    
    if (totalMinutesWorked > 360 && maxInterval < 30) {
       warnings.push("Sem intervalo de almoço adequado");
    }
  }

  return warnings;
};

export const calculateBalance = (workedMinutes: number, targetMinutes: number, isDayOffOrAboned: boolean): number => {
  if (isDayOffOrAboned) {
    return workedMinutes; 
  }
  return workedMinutes - targetMinutes;
};

// ----------------------------------------------------------------------
// HOLIDAY LOGIC (São Paulo / Brazil)
// ----------------------------------------------------------------------

import { Holiday } from './types';

// Helper: Calculate Easter Sunday for a given year (Meeus/Jones/Butcher's Algorithm)
const getEasterDate = (year: number): Date => {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31) - 1; // Month is 0-indexed in JS
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month, day);
};

// Add days to a date
const addDays = (date: Date, days: number): Date => {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
};

/**
 * Returns the list of standard system holidays for a given year
 * Feriados Nacionais e de São Paulo
 */
export const getStandardHolidays = (year: number): Holiday[] => {
  const holidays: Holiday[] = [
    { id: 'sys-1', day: 1, month: 1, name: "Confraternização Universal" },
    { id: 'sys-2', day: 25, month: 1, name: "Aniversário de São Paulo" },
    { id: 'sys-3', day: 21, month: 4, name: "Tiradentes" },
    { id: 'sys-4', day: 1, month: 5, name: "Dia do Trabalho" },
    { id: 'sys-5', day: 9, month: 7, name: "Revolução Constitucionalista" }, // Estadual SP
    { id: 'sys-6', day: 7, month: 9, name: "Independência do Brasil" },
    { id: 'sys-7', day: 12, month: 10, name: "Nossa Sra. Aparecida" },
    { id: 'sys-8', day: 2, month: 11, name: "Finados" },
    { id: 'sys-9', day: 15, month: 11, name: "Proclamação da República" },
    { id: 'sys-10', day: 20, month: 11, name: "Dia da Consciência Negra" },
    { id: 'sys-11', day: 25, month: 12, name: "Natal" },
  ];

  // Mobile Holidays
  const easter = getEasterDate(year);
  const carnival = addDays(easter, -47); // Carnaval (Tuesday)
  const goodFriday = addDays(easter, -2); // Sexta-feira Santa
  const corpusChristi = addDays(easter, 60); // Corpus Christi

  holidays.push({ id: 'sys-easter', day: easter.getDate(), month: easter.getMonth() + 1, name: "Páscoa", year });
  holidays.push({ id: 'sys-carnival', day: carnival.getDate(), month: carnival.getMonth() + 1, name: "Carnaval", year });
  holidays.push({ id: 'sys-goodFriday', day: goodFriday.getDate(), month: goodFriday.getMonth() + 1, name: "Sexta-feira Santa", year });
  holidays.push({ id: 'sys-corpus', day: corpusChristi.getDate(), month: corpusChristi.getMonth() + 1, name: "Corpus Christi", year });

  return holidays;
};

export const getHolidayName = (day: number, month: number, year: number, customHolidays: Holiday[] = []): string | null => {
  // 1. Check Custom Holidays First
  const custom = customHolidays.find(h => 
    h.day === day && 
    h.month === month && 
    (h.year === undefined || h.year === null || h.year === year)
  );
  if (custom) return custom.name;

  // 2. Check Standard Holidays
  const standardHolidays = getStandardHolidays(year);
  const standard = standardHolidays.find(h => h.day === day && h.month === month);
  
  if (standard) return standard.name;

  return null;
};

/**
 * Generate month options for dropdown (2 months before, current, 5 months after)
 */
export const generateMonthOptions = (): { value: string; label: string }[] => {
  const today = new Date();
  const options = [];
  
  // Start 2 months back
  for (let i = -2; i <= 5; i++) {
    const d = new Date(today.getFullYear(), today.getMonth() + i, 1);
    const monthStr = String(d.getMonth() + 1).padStart(2, '0');
    const yearStr = d.getFullYear();
    options.push({
      value: `${yearStr}-${monthStr}`,
      label: `${monthStr}/${yearStr}`
    });
  }
  return options;
};
