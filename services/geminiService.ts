
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
 * Merges timestamps arrays if multiple rows exist for the same day number.
 */
const deduplicateAndMergeRows = (rows: any[]): any[] => {
  const mergedMap = new Map<number, any>();

  rows.forEach(row => {
    // 1. Normalize Day to Integer
    const dayInt = parseInt(String(row.day).replace(/\D/g, ''), 10);
    if (isNaN(dayInt)) return;

    if (!mergedMap.has(dayInt)) {
      // First time seeing this day
      mergedMap.set(dayInt, { 
        ...row, 
        day: String(dayInt),
        timestamps: Array.isArray(row.timestamps) ? row.timestamps : []
      });
    } else {
      // Merge with existing
      const existing = mergedMap.get(dayInt);
      
      // Helper to check if a value is "useful"
      const isUseful = (v: any) => v && typeof v === 'string' && v.trim() !== '' && v !== '[?]';

      // Merge Day Label (Prefer existing if useful, else take new)
      if (!isUseful(existing.dayLabel) && isUseful(row.dayLabel)) {
        existing.dayLabel = row.dayLabel;
      }

      // Merge Timestamps: Combine arrays and unique them
      const existingTs = Array.isArray(existing.timestamps) ? existing.timestamps : [];
      const newTs = Array.isArray(row.timestamps) ? row.timestamps : [];
      
      // Simple Set deduplication for exact string matches
      const combinedTs = Array.from(new Set([...existingTs, ...newTs]));
      
      existing.timestamps = combinedTs;

      // Merge isWeekend (Logical OR)
      existing.isWeekend = existing.isWeekend || row.isWeekend;

      mergedMap.set(dayInt, existing);
    }
  });

  // Return sorted array
  return Array.from(mergedMap.values()).sort((a, b) => parseInt(a.day) - parseInt(b.day));
};

export const parseTimecardImage = async (base64Images: string[]): Promise<any[]> => {
  const ai = getGeminiClient();

  // INSTRUÇÃO ATUALIZADA:
  // Focada em extrair LISTA DE HORÁRIOS (timestamps) e não colunas fixas.
  // Explicitamente instruída para lidar com "FALTA".
  const systemInstruction = `
    Role: Expert Forensic OCR specialist.
    Task: Extract time data from one or more images of a Brazilian "Tilibra" timecard.
    
    *** STRATEGY: LIST ALL TIMESTAMPS ***
    Do not try to determine if a time is "Entrance" or "Exit".
    Simply scan the row for the specific Day and extract ALL valid time strings found on that line into a list called "timestamps".
    
    *** VISUAL ANALYSIS ***
    1. Look for Dot-Matrix stamps (e.g. "08:00", "17:30"). They are often faint/gray.
    2. Look for Handwritten times (dark ink).
    3. Look for "Day" number (1-31).
    4. **CRITICAL**: If the word "FALTA" or "FALTOU" is written on the line instead of times, return an EMPTY timestamps list [].
    
    *** OUTPUT RULES ***
    - Output a JSON object per day found.
    - "day": The printed day number.
    - "timestamps": An ARRAY of strings containing all times found on that line (e.g., ["08:00", "12:00", "13:00", "17:00"]).
      - If a time is illegible but clearly exists, ignore it or output closest guess with "?".
    - "dayLabel": Printed day of week (SEG, TER, DOM) if visible.
    - "isWeekend": true if SAB/DOM or explicit "FOLGA" is written.
    
    If the line is blank, "FOLGA" or "FALTA", return an empty timestamps array.
    If you see the same day in multiple images, output them as separate objects (we will merge them later).
  `;

  const imageParts = base64Images.map(b64 => {
    const mimeMatch = b64.match(/^data:(image\/[a-zA-Z+.-]+);base64,/);
    const mimeType = mimeMatch ? mimeMatch[1] : "image/jpeg";
    const data = b64.replace(/^data:image\/[a-zA-Z+.-]+;base64,/, "");
    
    return {
      inlineData: {
        mimeType,
        data,
      }
    };
  });

  let lastError: any;
  const maxRetries = 3;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const response = await ai.models.generateContent({
        model: "gemini-3-pro-preview", 
        contents: {
          parts: [
            ...imageParts,
            { text: "Analyze these timecard images. Return JSON array with day, dayLabel, isWeekend, and timestamps list." },
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
                timestamps: { 
                  type: Type.ARRAY, 
                  items: { type: Type.STRING },
                  description: "List of all time strings found in this row, e.g. ['08:00', '12:00']"
                },
                isWeekend: { type: Type.BOOLEAN, description: "Is non-working day?" },
              },
              required: ["day", "dayLabel", "isWeekend", "timestamps"],
            },
          },
        },
      });

      const jsonText = response.text;
      if (!jsonText) return [];
      
      const rawData = JSON.parse(jsonText);
      
      // Deduplicate by Day ID and Merge Timestamps
      const uniqueRows = deduplicateAndMergeRows(rawData);
      
      return uniqueRows;

    } catch (error: any) {
      console.warn(`Gemini API Attempt ${attempt} failed:`, error);
      lastError = error;

      const status = error.status || error.code;
      if (status && status >= 500) {
         if (attempt < maxRetries) {
             await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
             continue;
         }
      } else {
        throw error;
      }
    }
  }

  throw lastError || new Error("Failed to process images after retries.");
};
