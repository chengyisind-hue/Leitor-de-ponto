
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
  isAboned?: boolean; // User can waive the day
  
  // New flags for DSR/Sunday logic
  isSundayNoRest?: boolean; // If true, indicates a Sunday worked without compensation in the week
  sundayMode?: 'auto' | 'extra' | 'off'; // New Tri-state: Auto (Default), Force Extra, Force Off
  isCompensatoryRest?: boolean; // Day that was a Fault but converted to Rest because Sunday was worked
  manuallyDisabledDsr?: boolean; // User manually reverted the auto-DSR back to a Fault
  forceDsr?: boolean; // User manually forced a Fault to become a DSR
  
  // Internal calcs for display even if aboned
  _calculatedNormal?: number;
  _calculatedSpecial?: number;
  
  notes?: string;
}

export interface ProcessingStatus {
  step: 'idle' | 'uploading' | 'processing' | 'calculating' | 'done' | 'error' | 'saving';
  message: string;
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

// New: Multi-employee support structure
export interface EmployeeSession {
  id: string;
  name: string;
  imageUrls: string[]; // Each employee has their own images
  files?: File[]; // Original files for Training
  rows: TimeRow[];
  schedule: WeeklySchedule;
  
  status?: 'processing' | 'ready' | 'error'; // Async processing status
  
  // Configurable Percentages
  percentNormal: number; // default 50
  percentSpecial: number; // default 100
  
  summary: {
    totalExtrasNormal: number;
    totalExtrasSpecial: number;
    totalDeficitMinutes: number; // Atrasos (parcial)
    totalFaltasDays: number; // Dias inteiros faltosos
    totalDsrDescontado: number; // Dias de DSR perdidos
  };
}

export interface TrainingDataPayload {
  imageFile: File;
  rows: TimeRow[];
}

export interface Holiday {
  id: string;
  day: number;
  month: number;
  name: string;
  year?: number; // If null, applies to every year
  isSystem?: boolean; // Added to handle UI logic for system vs custom holidays
}