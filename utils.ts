
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
 * Filter Helper: Removes short duration pairs (Coffee Breaks < 20 mins).
 */
const filterShortPairs = (minutesArray: number[]): number[] => {
  const filtered = [...minutesArray];
  let restart = true;

  while (restart) {
    restart = false;
    // Iterate pairwise
    for (let i = 0; i < filtered.length - 1; i += 2) {
      const start = filtered[i];
      const end = filtered[i+1];
      const duration = end - start;

      // REGRA DE OURO: Pausas/Batidas menores que 20 minutos = café = ignorar.
      if (duration < 20) {
        filtered.splice(i, 2); // Remove both Entry and Exit
        restart = true;
        break;
      }
    }
  }
  return filtered;
};

/**
 * Helper: Normalizes a row by extracting all valid times, sorting them chronologically,
 * REMOVING SHORT INTERVALS (< 20m), and returning an object with entry1...exit3 populated.
 */
export const normalizeAndSortRow = (
  entry1: string, exit1: string,
  entry2: string, exit2: string,
  entry3: string, exit3: string
) => {
  const rawValues = [entry1, exit1, entry2, exit2, entry3, exit3];
  const validTimes: { original: string, minutes: number }[] = [];
  
  rawValues.forEach(val => {
    if (!val || val.trim() === '' || val === '[?]' || val === '--') return;
    const mins = timeToMinutes(val);
    if (mins !== null) {
      validTimes.push({ original: val, minutes: mins });
    }
  });

  // 1. Sort Chronologically
  validTimes.sort((a, b) => a.minutes - b.minutes);

  // 2. Filter out short pairs (< 20 mins) from the visual representation too
  // We extract just the minutes to use our filter logic
  let minutesOnly = validTimes.map(v => v.minutes);
  
  // Logic to remove pairs from the minutes array
  let restart = true;
  while (restart) {
    restart = false;
    for (let i = 0; i < minutesOnly.length - 1; i += 2) {
      if ((minutesOnly[i+1] - minutesOnly[i]) < 20) {
         minutesOnly.splice(i, 2);
         // Also remove from validTimes to keep sync
         validTimes.splice(i, 2);
         restart = true;
         break;
      }
    }
  }

  return {
    entry1: validTimes[0] ? minutesToTime(validTimes[0].minutes) : '',
    exit1: validTimes[1] ? minutesToTime(validTimes[1].minutes) : '',
    entry2: validTimes[2] ? minutesToTime(validTimes[2].minutes) : '',
    exit2: validTimes[3] ? minutesToTime(validTimes[3].minutes) : '',
    entry3: validTimes[4] ? minutesToTime(validTimes[4].minutes) : '',
    exit3: validTimes[5] ? minutesToTime(validTimes[5].minutes) : '',
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
  // 1. Extract and Clean
  let processed = [entry1, exit1, entry2, exit2, entry3, exit3]
    .map(t => timeToMinutes(t))
    .filter((t): t is number => t !== null);

  // 2. Sort Chronologically
  processed.sort((a, b) => a - b);

  // --- REGRA 1: ERRO DE 3 HORÁRIOS ---
  // Se houver exatamente 3 horários, a linha está incompleta/inválida. Retorna 0.
  if (processed.length === 3) {
    return 0;
  }

  // --- REGRA 2: 5 HORÁRIOS (Corrigir Duplicidade Instantânea) ---
  // Se houver 5 tempos, procura duplicidade de leitura (<5min) e remove.
  if (processed.length === 5) {
    for (let i = 0; i < processed.length - 1; i++) {
      const diff = processed[i+1] - processed[i];
      if (diff < 5) { // 5 min threshold for duplicate OCR read
        processed.splice(i, 1);
        break; 
      }
    }
  }

  // --- REGRA 3: LIMIAR DE 20 MINUTOS (IGNORAR CAFÉ) ---
  // Remove pares (Entrada -> Saída) com duração menor que 20 minutos.
  processed = filterShortPairs(processed);

  // --- CÁLCULO FINAL ---
  let total = 0;
  for (let i = 0; i < processed.length - 1; i += 2) {
    const start = processed[i];
    const end = processed[i+1];
    
    // Safety check just in case logic fails, though sorting prevents this mostly
    if (end > start) {
      total += (end - start);
    }
  }

  return total;
};

/**
 * Calculates Overtime/Deficit based on expected daily standard.
 * @param workedMinutes Total minutes worked
 * @param targetMinutes Expected minutes for this day (from schedule)
 * @param isDayOffOrAboned Is this a forced day off (holiday/weekend without schedule)?
 */
export const calculateBalance = (workedMinutes: number, targetMinutes: number, isDayOffOrAboned: boolean): number => {
  // Se for folga/feriado e não trabalhou: Saldo 0.
  // Se trabalhou na folga: Tudo é extra (targetMinutes deve ser 0 nesses casos vindo da config).
  
  // Se o dia exige 0 minutos (Domingo/Sábado configurado como folga)
  if (targetMinutes === 0) {
      // Se trabalhou, é tudo positivo. Se não trabalhou, é 0.
      return workedMinutes; 
  }

  // Se não trabalhou nada e o dia tinha previsão > 0
  if (workedMinutes === 0) {
    if (isDayOffOrAboned) return 0; // Ex: Atestado
    return -targetMinutes; // Falta integral
  }

  return workedMinutes - targetMinutes;
};
