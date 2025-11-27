
export interface TimeRow {
  id: string;
  day: string; // e.g., "01" or "16"
  date: string; // e.g., "01/10/2023"
  dayOfWeek: string; // e.g., "Seg", "Ter" (Calculated/Calendar)
  dayLabel?: string; // e.g., "DOM", "FERIADO" (Extracted from OCR)
  
  // Current Values (Editable)
  entry1: string; 
  exit1: string; 
  entry2: string; 
  exit2: string; 
  entry3: string; 
  exit3: string; 

  // Original AI Values (For Training/Diffing)
  originalEntry1?: string;
  originalExit1?: string;
  originalEntry2?: string;
  originalExit2?: string;
  originalEntry3?: string;
  originalExit3?: string;

  totalWorked: string; // Calculated
  balance: string; // Raw balance string for internal logic
  overtime: string; // Display: Positive balance
  deficit: string; // Display: Negative balance (Atrasos)
  
  isWeekend: boolean;
  notes?: string;
}

export interface ProcessingStatus {
  step: 'idle' | 'uploading' | 'processing' | 'calculating' | 'done' | 'error' | 'saving';
  message: string;
}

export interface Employee {
  id: string;
  name: string;
  role: string;
  company: string;
}

export interface TrainingDataPayload {
  imageFile: File;
  rows: TimeRow[];
}

export interface WeeklySchedule {
  0: string; // Dom
  1: string; // Seg
  2: string; // Ter
  3: string; // Qua
  4: string; // Qui
  5: string; // Sex
  6: string; // Sab
}
