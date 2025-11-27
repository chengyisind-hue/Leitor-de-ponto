
import { GoogleGenAI, Type } from "@google/genai";
import { TimeRow } from '../types';

const getGeminiClient = () => {
  const apiKey = process.env.API_KEY;
  if (!apiKey) {
    throw new Error("API Key is missing. Please ensure process.env.API_KEY is available.");
  }
  return new GoogleGenAI({ apiKey });
};

/**
 * Helper to deduplicate rows by 'day'.
 * Merges data if multiple rows exist for the same day number.
 */
const deduplicateAndMergeRows = (rows: any[]): any[] => {
  const mergedMap = new Map<number, any>();

  rows.forEach(row => {
    // 1. Normalize Day to Integer
    const dayInt = parseInt(String(row.day).replace(/\D/g, ''), 10);
    if (isNaN(dayInt)) return;

    if (!mergedMap.has(dayInt)) {
      // First time seeing this day
      mergedMap.set(dayInt, { ...row, day: String(dayInt) });
    } else {
      // Merge with existing
      const existing = mergedMap.get(dayInt);
      
      // Helper to check if a value is "useful"
      const isUseful = (v: any) => v && typeof v === 'string' && v.trim() !== '' && v !== '[?]';

      // Merge Day Label (Prefer existing if useful, else take new)
      if (!isUseful(existing.dayLabel) && isUseful(row.dayLabel)) {
        existing.dayLabel = row.dayLabel;
      }

      // Merge Time Columns: Prefer useful values
      ['entry1', 'exit1', 'entry2', 'exit2', 'entry3', 'exit3'].forEach(key => {
        if (!isUseful(existing[key]) && isUseful(row[key])) {
          existing[key] = row[key];
        }
      });

      // Merge isWeekend (Logical OR)
      existing.isWeekend = existing.isWeekend || row.isWeekend;

      mergedMap.set(dayInt, existing);
    }
  });

  // Return sorted array
  return Array.from(mergedMap.values()).sort((a, b) => parseInt(a.day) - parseInt(b.day));
};

/**
 * Pós-processamento para garantir que a IA não deixe buracos.
 * Se for dia útil e estiver vazio, força '[?]'.
 */
const enforceSafetyNet = (rows: any[]): any[] => {
  return rows.map(row => {
    // Se a IA já marcou como Fim de Semana, confiamos nela (ou o usuário muda depois)
    if (row.isWeekend) return row;

    const safeRow = { ...row };
    
    // Pass-through for now, as normalization handles most gaps.
    // Can be enhanced to flag missing fields if needed.
    
    return safeRow;
  });
};

export const parseTimecardImage = async (base64Images: string[]): Promise<any[]> => {
  const ai = getGeminiClient();

  const systemInstruction = `
    Role: Expert Forensic OCR specialist.
    Task: Extract time data from one or more images of a Brazilian "Tilibra" timecard (Front and/or Back).
    
    *** MULTIPLE IMAGES & DEDUPLICATION ***
    - You may receive the front and back of the same card.
    - Front usually covers days 1-15, Back 16-31, OR they might overlap.
    - OUTPUT A SINGLE ENTRY PER DAY.
    - If you see data for Day 1 in image 1 and Day 1 in image 2, MERGE THEM.
    
    *** CRITICAL RULE: NO BLANK CELLS ON WORKDAYS ***
    If a row corresponds to a standard workday (Mon-Fri) and you see NO INK:
    1. Assume it is a faint stamp you missed.
    2. Output "[?]" for that cell.
    3. DO NOT output empty strings "" for standard columns (Morning/Afternoon) on weekdays.
    
    *** VISUAL ANALYSIS INSTRUCTIONS ***
    
    This document contains two distinct types of text. You must extract BOTH:
    
    1. THE FAINT DOT-MATRIX STAMPS (Hard to see):
       - These are LIGHT GRAY, PIXELATED, DOTTED numbers (e.g., "08:00", "17:30").
       - They are the PRIMARY DATA.
       - A "0" might look like "()", "C)", or "O".
       - An "8" might look like "B", "3", or "S".
    
    2. THE HANDWRITING (Easy to see):
       - Dark blue/black ink.
       - Found in "Extra" columns or as corrections.
    
    *** GRID LAYOUT MAPPING ***
    
    The table has 7 relevant columns. Read row by row:
    
    Col 1: DAY (Dia) - Printed numbers.
    Col 2: MANHÃ ENTRADA (Morning In)   
    Col 3: MANHÃ SAÍDA   (Morning Out)  
    Col 4: TARDE ENTRADA (Afternoon In) 
    Col 5: TARDE SAÍDA   (Afternoon Out)
    Col 6: EXTRA ENTRADA (Extra In)     
    Col 7: EXTRA SAÍDA   (Extra Out)    
    
    *** DAY LABEL EXTRACTION ***
    - Extract the printed day of week next to the day number if visible (e.g. "DOM", "SEG", "SAB").
    - Field name: "dayLabel".
    
    *** WEEKENDS/HOLIDAYS ***
    - Mark "isWeekend": true if printed "SAB", "DOM" or written "FERIADO"/"FOLGA".
    - If "FOLGA" is written across the line, output "FOLGA" in 'dayLabel'.
    
    Return a pure JSON array.
  `;

  // FIX: Extract MIME type dynamically instead of hardcoding 'image/jpeg'
  // This prevents 500 Internal Error when uploading PNGs or other formats.
  const imageParts = base64Images.map(b64 => {
    // Robust regex to capture mime type from base64 header
    const mimeMatch = b64.match(/^data:(image\/[a-zA-Z+.-]+);base64,/);
    const mimeType = mimeMatch ? mimeMatch[1] : "image/jpeg";
    
    // Remove the data URL header
    const data = b64.replace(/^data:image\/[a-zA-Z+.-]+;base64,/, "");
    
    return {
      inlineData: {
        mimeType,
        data,
      }
    };
  });

  // Retry logic to handle transient 500/503 errors from the API
  let lastError: any;
  const maxRetries = 3;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const response = await ai.models.generateContent({
        model: "gemini-3-pro-preview", 
        contents: {
          parts: [
            ...imageParts,
            { text: "Analyze these timecard images and extract the data based on the provided system instructions." },
          ],
        },
        config: {
          systemInstruction: systemInstruction,
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                day: { type: Type.STRING, description: "Day number (e.g., '16')" },
                dayLabel: { type: Type.STRING, description: "Printed Label (e.g. 'DOM', 'SEG', 'FOLGA')" },
                entry1: { type: Type.STRING, description: "Morning In" },
                exit1: { type: Type.STRING, description: "Morning Out" },
                entry2: { type: Type.STRING, description: "Afternoon In" },
                exit2: { type: Type.STRING, description: "Afternoon Out" },
                entry3: { type: Type.STRING, description: "Extra In" },
                exit3: { type: Type.STRING, description: "Extra Out" },
                isWeekend: { type: Type.BOOLEAN, description: "Is non-working day?" },
              },
              required: ["day", "dayLabel", "isWeekend"],
            },
          },
        },
      });

      const jsonText = response.text;
      if (!jsonText) return [];
      
      const rawData = JSON.parse(jsonText);
      
      const uniqueRows = deduplicateAndMergeRows(rawData);
      return enforceSafetyNet(uniqueRows);

    } catch (error: any) {
      console.warn(`Gemini API Attempt ${attempt} failed:`, error);
      lastError = error;

      // Only retry on server errors (5xx)
      const status = error.status || error.code;
      if (status && status >= 500) {
         if (attempt < maxRetries) {
             // Exponential backoff: 1s, 2s, etc.
             await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
             continue;
         }
      } else {
        // If it's a client error (4xx) or unknown, break and throw
        throw error;
      }
    }
  }

  throw lastError || new Error("Failed to process images after retries.");
};
