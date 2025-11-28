
import React, { useState, useEffect, useRef } from 'react';
import { TimeRow, WeeklySchedule, EmployeeSession, Holiday } from '../types';
import { calculateDailyMinutes, minutesToTime, timeToMinutes, getHolidayName, generateMonthOptions, processRawTimestampsToColumns, getStandardHolidays, getLaborWarnings } from '../utils';
import { Loader2, Clock, ChevronLeft, ChevronRight, AlertTriangle, Plus, Trash2, Users, Maximize2, Minimize2, Settings, X, BrainCircuit, LayoutTemplate, GripVertical, GripHorizontal, Lock, FilePlus, UploadCloud, Save, CheckCircle2 } from 'lucide-react';
import { saveTrainingData } from '../services/trainingService';
import { parseTimecardImage } from '../services/geminiService';
import { fetchHolidays, saveHoliday, deleteHoliday } from '../services/supabaseClient';
import OnboardingTour from './OnboardingTour';

interface TimecardEditorProps {
  initialData: TimeRow[];
  imageUrls: string[];
  files: File[] | null;
  onReset: () => void;
  darkMode: boolean;
  setDarkMode: (val: boolean) => void;
}

const DAYS_OF_WEEK = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

// Simple ID generator for internal use
const generateId = () => Math.random().toString(36).substr(2, 9);

interface AppearanceConfig {
  rowHeight: 'compact' | 'normal' | 'relaxed';
  colWidth: 'normal' | 'wide';
  imagePosition: 'left' | 'right';
}

const TimecardEditor: React.FC<TimecardEditorProps> = ({ initialData, imageUrls, files, onReset, darkMode, setDarkMode }) => {
  // --- STATE ---
  
  // Multi-employee Management
  const [employees, setEmployees] = useState<EmployeeSession[]>([]);
  const [activeEmployeeId, setActiveEmployeeId] = useState<string>('');

  // Global UI State
  const [referenceMonth, setReferenceMonth] = useState(new Date().toISOString().slice(0, 7)); // YYYY-MM
  const [activeImageIndex, setActiveImageIndex] = useState(0);
  
  // Image Viewer State
  const [imageScale, setImageScale] = useState(1);
  const [imagePosition, setImagePosition] = useState({ x: 0, y: 0 });
  const [isDraggingImage, setIsDraggingImage] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  
  // Resizable Panels State
  const [imagePanelWidth, setImagePanelWidth] = useState(450); 
  const [isResizingImagePanel, setIsResizingImagePanel] = useState(false);
  
  const [summaryPanelHeight, setSummaryPanelHeight] = useState(110);
  const [isResizingSummaryPanel, setIsResizingSummaryPanel] = useState(false);

  const [isSidebarOpen, setSidebarOpen] = useState(true);
  const [isImageVisible, setImageVisible] = useState(true);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [settingsTab, setSettingsTab] = useState<'general' | 'holidays' | 'appearance'>('general');
  
  // Add Employee Modal State
  const [showAddEmployeeModal, setShowAddEmployeeModal] = useState(false);
  const [newEmployeeName, setNewEmployeeName] = useState('');
  
  // Training State
  const [isTraining, setIsTraining] = useState(false);
  
  // Appearance Settings
  const [appearance, setAppearance] = useState<AppearanceConfig>({
    rowHeight: 'normal',
    colWidth: 'normal',
    imagePosition: 'right'
  });

  // Holidays State
  const [customHolidays, setCustomHolidays] = useState<Holiday[]>([]);
  const [newHolidayName, setNewHolidayName] = useState('');
  const [newHolidayDateStr, setNewHolidayDateStr] = useState(''); // "dd/mm" or "dd/mm/yyyy"
  
  // Input Refs
  const fileInputRef = useRef<HTMLInputElement>(null);
  const appendFileInputRef = useRef<HTMLInputElement>(null);

  // --- INITIALIZATION ---
  
  // Load Holidays on mount
  useEffect(() => {
    fetchHolidays().then(data => {
      if (data.length > 0) setCustomHolidays(data);
    });
  }, []);

  // Initialize first employee from Props (App.tsx scan)
  useEffect(() => {
    if (initialData.length > 0 && employees.length === 0) {
      const firstId = 'emp-1';
      const newEmployee: EmployeeSession = {
        id: firstId,
        name: 'Funcionário 1',
        imageUrls: imageUrls,
        files: files || [],
        rows: initialData,
        schedule: {
          0: '00:00', 1: '08:00', 2: '08:00', 3: '08:00', 4: '08:00', 5: '08:00', 6: '00:00'
        },
        status: 'ready',
        percentNormal: 50,
        percentSpecial: 100,
        summary: {
          totalExtrasNormal: 0,
          totalExtrasSpecial: 0,
          totalDeficitMinutes: 0,
          totalFaltasDays: 0,
          totalDsrDescontado: 0
        }
      };
      setEmployees([newEmployee]);
      setActiveEmployeeId(firstId);
    }
  }, [initialData, imageUrls, files]);

  // Reset image view when switching employees or images
  useEffect(() => {
    setImageScale(1);
    setImagePosition({ x: 0, y: 0 });
  }, [activeEmployeeId, activeImageIndex]);


  // --- LOGIC: RESIZING PANELS ---
  
  // Image Panel Resize (Horizontal)
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizingImagePanel) return;
      
      let newWidth;
      if (appearance.imagePosition === 'right') {
        newWidth = window.innerWidth - e.clientX;
      } else {
        newWidth = e.clientX - (isSidebarOpen ? 256 : 0);
      }
      
      if (newWidth < 200) newWidth = 200;
      if (newWidth > window.innerWidth * 0.7) newWidth = window.innerWidth * 0.7;
      
      setImagePanelWidth(newWidth);
    };

    const handleMouseUp = () => {
      setIsResizingImagePanel(false);
      document.body.style.cursor = 'default';
    };

    if (isResizingImagePanel) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = 'col-resize';
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizingImagePanel, appearance.imagePosition, isSidebarOpen]);

  // Summary Panel Resize (Vertical)
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizingSummaryPanel) return;
      
      // Calculate new height based on mouse Y relative to the top of table area
      // Roughly: e.clientY minus header height (64px)
      let newHeight = e.clientY - 64;
      
      if (newHeight < 60) newHeight = 60; // Minimum to see values
      if (newHeight > 400) newHeight = 400; // Max height
      
      setSummaryPanelHeight(newHeight);
    };

    const handleMouseUp = () => {
      setIsResizingSummaryPanel(false);
      document.body.style.cursor = 'default';
    };

    if (isResizingSummaryPanel) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = 'row-resize';
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizingSummaryPanel]);


  // --- LOGIC: CALCULATION & DSR ---
  useEffect(() => {
    if (employees.length === 0) return;

    setEmployees(prevEmployees => prevEmployees.map(emp => {
      // Don't calculate if processing or errored
      if (emp.status === 'processing') return emp;

      const [yearStr, monthStr] = referenceMonth.split('-');
      const year = parseInt(yearStr);
      const month = parseInt(monthStr);

      let accExtrasNormal = 0;
      let accExtrasSpecial = 0;
      let accDeficitMinutes = 0;
      let accFaltasDays = 0;
      let accDsrDescontado = 0;

      const weeksMap = new Map<number, { 
        rows: TimeRow[], 
        hasHoliday: boolean, 
        holidayIsSunday: boolean, 
        hasFault: boolean,
        workedDays: number,
        sundayRow?: TimeRow & { _tempMins: number; _tempTarget: number; _tempWeek: number; }
      }>();

      // First Pass
      const enrichedRows = emp.rows.map(row => {
        const dayNum = parseInt(row.day);
        if (isNaN(dayNum)) return { ...row, _tempMins: 0, _tempTarget: 0, _tempIsFalta: false, _tempWeek: 0, _tempDayIndex: 0, _tempIsHoliday: false, _isCompensatoryRest: false };

        const d = new Date(year, month - 1, dayNum, 12, 0, 0);
        const dayIndex = d.getDay();
        const holidayName = getHolidayName(dayNum, month, year, customHolidays);
        const isHoliday = !!holidayName;

        const onejan = new Date(year, 0, 1);
        const millis = d.getTime() - onejan.getTime();
        const weekNum = Math.ceil(( (millis/86400000) + onejan.getDay() + 1) / 7);

        const targetTimeStr = emp.schedule[dayIndex as keyof WeeklySchedule] || '08:00';
        const targetMinutes = timeToMinutes(targetTimeStr) || 0;

        const dailyMins = calculateDailyMinutes(row.entry1, row.exit1, row.entry2, row.exit2, row.entry3, row.exit3);
        const label = row.dayLabel?.toUpperCase() || '';
        const isExplicitFolga = label.includes('FOLGA');
        const isFalta = targetMinutes > 0 && dailyMins === 0 && !isHoliday && !row.isAboned && !isExplicitFolga;

        if (!weeksMap.has(weekNum)) weeksMap.set(weekNum, { rows: [], hasHoliday: false, holidayIsSunday: false, hasFault: false, workedDays: 0 });
        const weekData = weeksMap.get(weekNum)!;
        weekData.rows.push(row);
        if (isHoliday) {
           weekData.hasHoliday = true;
           if (dayIndex === 0) weekData.holidayIsSunday = true;
        }
        if (dailyMins > 0 || row.isAboned || isExplicitFolga || isHoliday) weekData.workedDays++;
        
        // Reset flags for recalculation
        return { 
          ...row, 
          isSundayNoRest: false, 
          isCompensatoryRest: false,
          _tempMins: dailyMins, 
          _tempTarget: targetMinutes, 
          _tempIsFalta: isFalta, 
          _tempWeek: weekNum, 
          _tempDayIndex: dayIndex, 
          _tempIsHoliday: isHoliday, 
          _isCompensatoryRest: false 
        };
      });

      // Second Pass: DSR Logic
      const adjustedRows = [...enrichedRows];
      weeksMap.forEach(weekData => {
         // Auto-detect Sunday Work lacking rest
         if (weekData.sundayRow && weekData.sundayRow._tempMins > 0) {
            // Find a fault in the week to convert to Rest
            const restCandidate = adjustedRows.find(r => r._tempWeek === weekData.sundayRow!._tempWeek && r._tempIsFalta && r._tempDayIndex !== 0);
            if (restCandidate) {
               if (!restCandidate.manuallyDisabledDsr) {
                   restCandidate._tempIsFalta = false;
                   restCandidate._isCompensatoryRest = true;
               }
            } else {
               const sundayRowRef = adjustedRows.find(r => r.id === weekData.sundayRow!.id);
               if (sundayRowRef) sundayRowRef.isSundayNoRest = true;
            }
         }
      });
      
      adjustedRows.forEach(r => {
        if (r.forceDsr) r._tempIsFalta = false;
        if (r._tempIsFalta) {
          const w = weeksMap.get(r._tempWeek!);
          if (w) w.hasFault = true;
        }
      });

      // Third Pass: Calc Finals
      const finalRows = adjustedRows.map(row => {
        const dailyMins = row._tempMins!;
        const targetMinutes = row._tempTarget!;
        const isFalta = row._tempIsFalta!;
        const isHoliday = row._tempIsHoliday!;
        const dayIndex = row._tempDayIndex!;
        let isSundayNoRest = row.isSundayNoRest;

        // Internal calc vars
        let rowNormalExtras = 0;
        let rowSpecialExtras = 0;
        let rowDeficit = 0;

        // Deficit Logic
        if (isFalta) {
           if (!row.isAboned) accFaltasDays += 1;
        } else if (dailyMins < targetMinutes && targetMinutes > 0 && !isHoliday && !row._isCompensatoryRest) {
           rowDeficit = (targetMinutes - dailyMins);
           if (!row.isAboned) accDeficitMinutes += rowDeficit;
        }

        // Overtime Logic
        const isSunday = dayIndex === 0;
        const sundayMode = row.sundayMode || 'auto';
        
        let is100PercentDay = false;
        
        if (sundayMode === 'extra') {
          is100PercentDay = true;
        } else if (sundayMode === 'off') {
          is100PercentDay = false; // Treat as normal or just ignore special 100% rule
        } else {
          // Auto
          is100PercentDay = isHoliday || (isSunday && targetMinutes === 0) || isSundayNoRest;
        }

        if (is100PercentDay) {
          rowSpecialExtras = dailyMins;
        } else {
          if (dailyMins > targetMinutes) {
            rowNormalExtras = (dailyMins - targetMinutes);
          }
        }

        // Accumulate Extras (only if NOT aboned)
        if (!row.isAboned) {
          accExtrasNormal += rowNormalExtras;
          accExtrasSpecial += rowSpecialExtras;
        }

        return { 
          ...row, 
          isSundayNoRest, 
          isCompensatoryRest: row._isCompensatoryRest, 
          totalWorked: minutesToTime(dailyMins),
          _calculatedNormal: rowNormalExtras,
          _calculatedSpecial: rowSpecialExtras
        };
      });

      weeksMap.forEach(week => {
        if (week.hasFault) {
          accDsrDescontado += 1;
          // Only deduct extra DSR if holiday was NOT on Sunday
          if (week.hasHoliday && !week.holidayIsSunday) {
            accDsrDescontado += 1;
          }
        }
      });

      return {
        ...emp,
        rows: finalRows,
        summary: {
          totalExtrasNormal: accExtrasNormal,
          totalExtrasSpecial: accExtrasSpecial,
          totalDeficitMinutes: accDeficitMinutes,
          totalFaltasDays: accFaltasDays,
          totalDsrDescontado: accDsrDescontado
        }
      };
    }));

  }, [referenceMonth, customHolidays, employees.map(e => e.schedule).join(), employees.map(e => JSON.stringify(e.rows)).join()]);


  // --- HANDLERS ---

  const handleOpenAddEmployeeModal = () => {
    setNewEmployeeName('');
    setShowAddEmployeeModal(true);
  };

  const processFiles = async (files: File[], isAppend: boolean = false) => {
    // ASYNC HANDLING: No global loading state.
    // We update the specific employee status.
    
    // Close modal immediately to unblock UI
    setShowAddEmployeeModal(false);

    let targetEmployeeId: string;
    let base64Results: string[] = [];

    // Pre-processing: Read files to base64
    try {
      const promises = files.map(file => new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = (e) => resolve(e.target?.result as string);
          reader.onerror = reject;
          reader.readAsDataURL(file);
      }));
      base64Results = await Promise.all(promises);
    } catch (e) {
      alert("Erro ao ler arquivos.");
      return;
    }

    if (isAppend) {
       // Append to Active Employee
       targetEmployeeId = activeEmployeeId;
       updateActiveEmployee({ status: 'processing' });
    } else {
       // Create New Employee Placeholder
       const newId = `emp-${Date.now()}`;
       targetEmployeeId = newId;
       
       const newEmpPlaceholder: EmployeeSession = {
         id: newId,
         name: newEmployeeName || `Funcionário ${employees.length + 1}`,
         imageUrls: base64Results, // Show images immediately if desired
         files: files,
         rows: [], // Empty initially
         schedule: { 0: '00:00', 1: '08:00', 2: '08:00', 3: '08:00', 4: '08:00', 5: '08:00', 6: '00:00' },
         status: 'processing', // MARK AS PROCESSING
         percentNormal: 50, percentSpecial: 100,
         summary: { totalExtrasNormal: 0, totalExtrasSpecial: 0, totalDeficitMinutes: 0, totalFaltasDays: 0, totalDsrDescontado: 0 }
       };

       setEmployees(prev => [...prev, newEmpPlaceholder]);
       // NOTE: We do NOT switch activeEmployeeId here, per user request to allow multi-tasking.
       // User can click the new employee in sidebar if they want to see the loading spinner.
    }

    // Run AI Processing in Background
    try {
      const rawRows = await parseTimecardImage(base64Results);
      if (!rawRows || rawRows.length === 0) throw new Error("Não foi possível ler os dados.");

      const processedRows: TimeRow[] = rawRows.map((row: any) => {
        const rawTimestamps = Array.isArray(row.timestamps) ? row.timestamps : [];
        const normalized = processRawTimestampsToColumns(rawTimestamps);
        const originalEntries = [...rawTimestamps].sort();

        return {
          id: generateId(),
          day: row.day || '00', date: '', dayOfWeek: '', dayLabel: row.dayLabel || '',
          entry1: normalized.entry1, exit1: normalized.exit1, entry2: normalized.entry2, exit2: normalized.exit2, entry3: normalized.entry3, exit3: normalized.exit3,
          originalEntry1: originalEntries[0] || '', originalExit1: originalEntries[1] || '', originalEntry2: originalEntries[2] || '', originalExit2: originalEntries[3] || '', originalEntry3: originalEntries[4] || '', originalExit3: originalEntries[5] || '',
          totalWorked: '00:00', balance: '00:00', overtime: '00:00', deficit: '00:00', isWeekend: row.isWeekend || false
        };
      });

      // Update the specific employee
      setEmployees(prev => prev.map(emp => {
        if (emp.id !== targetEmployeeId) return emp;
        
        let finalRows = processedRows;
        let finalImages = emp.imageUrls;
        let finalFiles = emp.files;

        if (isAppend) {
           finalRows = [...emp.rows, ...processedRows].sort((a,b) => parseInt(a.day) - parseInt(b.day));
           finalImages = [...emp.imageUrls, ...base64Results];
           finalFiles = [...(emp.files || []), ...files];
        }

        return {
          ...emp,
          rows: finalRows,
          imageUrls: finalImages,
          files: finalFiles,
          status: 'ready' // MARK AS READY
        };
      }));

      // if (isAppend) alert(`${processedRows.length} linhas adicionadas!`);

    } catch (err: any) {
      console.error(err);
      setEmployees(prev => prev.map(emp => {
        if (emp.id !== targetEmployeeId) return emp;
        return { ...emp, status: 'error' };
      }));
      alert(`Erro ao processar funcionário: ${err.message}`);
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
      if (appendFileInputRef.current) appendFileInputRef.current.value = '';
    }
  }

  const handleModalDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
       const files = Array.from(e.dataTransfer.files).filter((f: any) => f.type.startsWith('image/')) as File[];
       if (files.length > 0) {
          if (!newEmployeeName.trim()) {
             alert("Digite o nome antes.");
             return;
          }
          processFiles(files, false);
       }
    }
  };

  const handleAppendFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
     if (e.target.files && e.target.files.length > 0) processFiles(Array.from(e.target.files), true);
  };
  const handleCreateEmployeeFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
     if (e.target.files && e.target.files.length > 0) processFiles(Array.from(e.target.files), false);
  };

  const handleDeleteEmployee = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (employees.length <= 1) return;
    const newEmps = employees.filter(emp => emp.id !== id);
    setEmployees(newEmps);
    if (activeEmployeeId === id) setActiveEmployeeId(newEmps[0].id);
  };

  const updateActiveEmployee = (updates: Partial<EmployeeSession>) => {
    setEmployees(prev => prev.map(emp => emp.id === activeEmployeeId ? { ...emp, ...updates } : emp));
  };

  const handleTimeInput = (rowId: string, field: keyof TimeRow, value: string) => {
    let clean = value.replace(/[^\d:]/g, '');
    if (!clean.includes(':') && clean.length > 2) clean = clean.slice(0, 2) + ':' + clean.slice(2);
    if (clean.length > 5) clean = clean.slice(0, 5);
    const activeEmp = employees.find(e => e.id === activeEmployeeId);
    if (!activeEmp) return;
    const newRows = activeEmp.rows.map(row => row.id === rowId ? { ...row, [field]: clean } : row);
    updateActiveEmployee({ rows: newRows });
  };

  const toggleAbono = (rowId: string) => {
    const activeEmp = employees.find(e => e.id === activeEmployeeId);
    if (!activeEmp) return;
    updateActiveEmployee({ rows: activeEmp.rows.map(row => row.id === rowId ? { ...row, isAboned: !row.isAboned } : row) });
  };
  
  const cycleSundayMode = (rowId: string) => {
    const activeEmp = employees.find(e => e.id === activeEmployeeId);
    if (!activeEmp) return;
    const row = activeEmp.rows.find(r => r.id === rowId);
    if (!row) return;

    // Cycle: Auto -> Extra -> Off -> Auto
    const current = row.sundayMode || 'auto';
    let next: 'auto' | 'extra' | 'off' = 'auto';
    if (current === 'auto') next = 'extra';
    else if (current === 'extra') next = 'off';
    else next = 'auto';

    updateActiveEmployee({ rows: activeEmp.rows.map(r => r.id === rowId ? { ...r, sundayMode: next } : r) });
  };

  const cycleDsrStatus = (rowId: string) => {
    const activeEmp = employees.find(e => e.id === activeEmployeeId);
    if (!activeEmp) return;
    const row = activeEmp.rows.find(r => r.id === rowId);
    if (!row) return;

    let updates: Partial<TimeRow> = {};
    if (row.forceDsr) updates = { forceDsr: false, manuallyDisabledDsr: false };
    else if (row.manuallyDisabledDsr) updates = { manuallyDisabledDsr: false, forceDsr: true };
    else if (row.isCompensatoryRest) updates = { manuallyDisabledDsr: true };
    else updates = { forceDsr: true };

    updateActiveEmployee({ rows: activeEmp.rows.map(r => r.id === rowId ? { ...r, ...updates } : r) });
  };

  const handleScheduleChange = (dayIndex: number, value: string) => {
     let clean = value.replace(/[^\d:]/g, '');
     if (!clean.includes(':') && clean.length > 2) clean = clean.slice(0, 2) + ':' + clean.slice(2);
     if (clean.length > 5) clean = clean.slice(0, 5);
     const activeEmp = employees.find(e => e.id === activeEmployeeId);
     if (!activeEmp) return;
     updateActiveEmployee({ schedule: { ...activeEmp.schedule, [dayIndex]: clean } });
  };
  
  const handleTeachAI = async () => {
    const activeEmp = employees.find(e => e.id === activeEmployeeId);
    if (!activeEmp || !activeEmp.files || activeEmp.files.length === 0) {
      alert("Nenhum arquivo original encontrado.");
      return;
    }
    setIsTraining(true);
    try {
      if (activeEmp.files.length > 0) {
        await saveTrainingData(activeEmp.files[0], activeEmp.rows);
      }
      alert(`Correções salvas para treinar a IA.`);
    } catch (e: any) {
      alert("Erro: " + e.message);
    } finally {
      setIsTraining(false);
    }
  };

  // --- IMAGE VIEWER HANDLERS ---
  const handleImageWheel = (e: React.WheelEvent) => {
    e.stopPropagation();
    const delta = e.deltaY > 0 ? -0.2 : 0.2;
    setImageScale(s => Math.min(Math.max(0.5, s + delta), 6));
  };
  const handleImageMouseDown = (e: React.MouseEvent) => { e.preventDefault(); setIsDraggingImage(true); setDragStart({ x: e.clientX - imagePosition.x, y: e.clientY - imagePosition.y }); };
  const handleImageMouseMove = (e: React.MouseEvent) => { if (!isDraggingImage) return; e.preventDefault(); setImagePosition({ x: e.clientX - dragStart.x, y: e.clientY - dragStart.y }); };
  const handleImageMouseUp = () => setIsDraggingImage(false);

  // --- HOLIDAYS ---
  const handleAddHoliday = async () => {
    if (!newHolidayName || !newHolidayDateStr) return;
    
    // Parse "dd/mm" or "dd/mm/yyyy"
    const parts = newHolidayDateStr.split('/');
    if (parts.length < 2) {
      alert("Formato de data inválido. Use dd/mm ou dd/mm/aaaa");
      return;
    }

    const day = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10);
    const year = parts[2] ? parseInt(parts[2], 10) : undefined;

    if (isNaN(day) || isNaN(month) || day < 1 || day > 31 || month < 1 || month > 12) {
       alert("Data inválida.");
       return;
    }

    const holidayPayload = { day, month, name: newHolidayName, year };
    const tempId = generateId();
    setCustomHolidays(prev => [...prev, { ...holidayPayload, id: tempId }]);
    setNewHolidayName('');
    setNewHolidayDateStr('');

    try { await saveHoliday(holidayPayload); } catch (e) { console.error(e); }
  };
  const handleDeleteHoliday = async (id: string) => {
    setCustomHolidays(prev => prev.filter(h => h.id !== id));
    await deleteHoliday(id);
  };

  // --- RENDER HELPERS ---
  const activeEmp = employees.find(e => e.id === activeEmployeeId) || employees[0];
  const dateOptions = generateMonthOptions();
  const [yearStr] = referenceMonth.split('-');
  const systemHolidays = getStandardHolidays(parseInt(yearStr));
  // Fix TS error by ensuring array elements are compatible with Holiday type (with optional isSystem)
  const allHolidaysForDisplay = [...customHolidays, ...systemHolidays.map(h => ({ ...h, isSystem: true }))].sort((a, b) => a.month !== b.month ? a.month - b.month : a.day - b.day);
  
  const getRowHeightClass = () => appearance.rowHeight === 'compact' ? 'h-8 text-xs' : appearance.rowHeight === 'relaxed' ? 'h-14 text-base' : 'h-11 text-sm';
  const getColWidthClass = () => appearance.colWidth === 'wide' ? 'w-24' : 'w-16';

  // --- RESPONSIVE FONT SIZE CALCULATOR ---
  // Calculates font size based on summaryPanelHeight
  // Base height is approx 110px. 
  // REDUCED SIZES as per request
  const titleFontSize = Math.max(10, Math.min(14, summaryPanelHeight * 0.09)); // Max 14px
  const valueFontSize = Math.max(16, Math.min(32, summaryPanelHeight * 0.22)); // Max 32px

  if (!activeEmp) return <div className="p-10 flex justify-center"><Loader2 className="animate-spin text-indigo-600"/></div>;

  return (
    <div className={`flex h-[calc(100vh-64px)] overflow-hidden ${darkMode ? 'bg-gray-900' : 'bg-white'} transition-colors relative`}>
      <OnboardingTour />
      
      {/* HIDDEN INPUTS */}
      <input type="file" multiple accept="image/*" ref={fileInputRef} onChange={handleCreateEmployeeFileChange} className="hidden" />
      <input type="file" multiple accept="image/*" ref={appendFileInputRef} onChange={handleAppendFileChange} className="hidden" />

      {/* MODALS */}
      {showAddEmployeeModal && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/50 backdrop-blur-sm" onDragOver={e => e.preventDefault()} onDrop={handleModalDrop}>
          <div className={`w-[500px] flex flex-col rounded-xl shadow-2xl p-8 ${darkMode ? 'bg-gray-800 text-white' : 'bg-white text-gray-900'}`}>
             <h3 className="text-2xl font-bold mb-6">Novo Funcionário</h3>
             <div className="mb-6">
                <label className="text-sm font-medium mb-2 block opacity-70">Nome do Colaborador</label>
                <input autoFocus value={newEmployeeName} onChange={(e) => setNewEmployeeName(e.target.value)} placeholder="Ex: Maria Silva" className="w-full p-4 border rounded-lg bg-transparent border-gray-300 dark:border-gray-600 focus:ring-2 focus:ring-indigo-500 outline-none text-lg" onKeyDown={(e) => e.key === 'Enter' && fileInputRef.current?.click()} />
             </div>
             <div onClick={() => newEmployeeName && fileInputRef.current?.click()} className={`border-2 border-dashed rounded-xl p-8 text-center transition-all cursor-pointer mb-6 ${!newEmployeeName ? 'opacity-50 cursor-not-allowed border-gray-300' : 'border-indigo-400 hover:bg-indigo-50 dark:hover:bg-gray-700 hover:border-indigo-500'}`}>
                <UploadCloud className="mx-auto w-12 h-12 text-indigo-500 mb-2" />
                <p className="font-medium">Clique para selecionar ou Arraste fotos aqui</p>
             </div>
             <div className="flex justify-end gap-3"><button onClick={() => setShowAddEmployeeModal(false)} className="px-5 py-2.5 text-gray-500 hover:bg-gray-100 rounded-lg font-medium">Cancelar</button></div>
          </div>
        </div>
      )}

      {showSettingsModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className={`w-[600px] h-[550px] flex flex-col rounded-xl shadow-2xl ${darkMode ? 'bg-gray-800 border border-gray-700 text-white' : 'bg-white text-gray-900'}`}>
             <div className="p-4 border-b dark:border-gray-700 flex justify-between items-center"><h3 className="text-xl font-bold">Configurações</h3><button onClick={() => setShowSettingsModal(false)}><X/></button></div>
             <div className="flex border-b dark:border-gray-700">
               {['general', 'appearance', 'holidays'].map(tab => (
                 <button key={tab} onClick={() => setSettingsTab(tab as any)} className={`flex-1 p-3 text-sm font-medium capitalize ${settingsTab === tab ? 'border-b-2 border-indigo-600 text-indigo-600' : 'text-gray-500'}`}>{tab === 'general' ? 'Geral' : tab === 'appearance' ? 'Aparência' : 'Feriados'}</button>
               ))}
             </div>
             <div className="flex-1 p-6 overflow-y-auto">
               {/* SETTINGS CONTENT */}
               {settingsTab === 'general' && (
                 <div className="space-y-6">
                    <div className="flex items-center justify-between p-3 rounded border dark:border-gray-700"><span>Modo Escuro</span><button onClick={() => setDarkMode(!darkMode)} className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${darkMode ? 'bg-indigo-600' : 'bg-gray-300'}`}><span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${darkMode ? 'translate-x-6' : 'translate-x-1'}`} /></button></div>
                    <div className="grid grid-cols-2 gap-4">
                        <div><label className="block text-sm mb-1">Extra Normal</label><div className="flex gap-2"><input type="number" value={activeEmp.percentNormal} onChange={(e) => updateActiveEmployee({ percentNormal: Number(e.target.value) })} className="w-full p-2 border rounded bg-transparent"/><span>%</span></div></div>
                        <div><label className="block text-sm mb-1">Extra Especial</label><div className="flex gap-2"><input type="number" value={activeEmp.percentSpecial} onChange={(e) => updateActiveEmployee({ percentSpecial: Number(e.target.value) })} className="w-full p-2 border rounded bg-transparent"/><span>%</span></div></div>
                    </div>
                 </div>
               )}
               {settingsTab === 'appearance' && (
                 <div className="space-y-6">
                    <div className="space-y-2"><label className="block text-sm font-medium">Posição</label><div className="grid grid-cols-2 gap-2"><button onClick={() => setAppearance({...appearance, imagePosition: 'left'})} className={`p-3 border rounded ${appearance.imagePosition === 'left' ? 'bg-indigo-50 border-indigo-500 text-indigo-700' : ''}`}>Esquerda</button><button onClick={() => setAppearance({...appearance, imagePosition: 'right'})} className={`p-3 border rounded ${appearance.imagePosition === 'right' ? 'bg-indigo-50 border-indigo-500 text-indigo-700' : ''}`}>Direita</button></div></div>
                    <div className="space-y-2"><label className="block text-sm font-medium">Tamanho Letra</label><input type="range" min="0" max="2" value={appearance.rowHeight === 'compact' ? 0 : appearance.rowHeight === 'normal' ? 1 : 2} onChange={(e) => setAppearance({...appearance, rowHeight: Number(e.target.value) === 0 ? 'compact' : Number(e.target.value) === 1 ? 'normal' : 'relaxed'})} className="w-full"/></div>
                    <div className="space-y-2"><label className="block text-sm font-medium">Largura Campos</label><div className="grid grid-cols-2 gap-2"><button onClick={() => setAppearance({...appearance, colWidth: 'normal'})} className={`p-3 border rounded ${appearance.colWidth === 'normal' ? 'bg-indigo-50 border-indigo-500 text-indigo-700' : ''}`}>Normal</button><button onClick={() => setAppearance({...appearance, colWidth: 'wide'})} className={`p-3 border rounded ${appearance.colWidth === 'wide' ? 'bg-indigo-50 border-indigo-500 text-indigo-700' : ''}`}>Larga</button></div></div>
                 </div>
               )}
               {settingsTab === 'holidays' && (
                 <div className="space-y-4">
                    <div className="flex gap-2 items-end">
                       {/* Single Date Input */}
                       <div className="flex-none w-28">
                         <input 
                           type="text" 
                           value={newHolidayDateStr} 
                           onChange={e => setNewHolidayDateStr(e.target.value)} 
                           className="w-full p-2 border rounded bg-transparent text-center" 
                           placeholder="dd/mm/aaaa"
                           maxLength={10}
                         />
                       </div>
                       <input type="text" value={newHolidayName} onChange={e => setNewHolidayName(e.target.value)} className="flex-1 p-2 border rounded bg-transparent" placeholder="Nome do Feriado"/>
                       <button onClick={handleAddHoliday} className="p-2 bg-indigo-600 text-white rounded hover:bg-indigo-700"><Plus/></button>
                    </div>
                    <div className="border rounded dark:border-gray-700 overflow-hidden">
                       <table className="w-full text-sm"><tbody className="divide-y dark:divide-gray-700">{allHolidaysForDisplay.map((h, i) => (<tr key={i} className={h.isSystem ? 'bg-gray-50 dark:bg-gray-800/50 text-gray-500' : ''}><td className="p-2 w-24 text-center">{h.day.toString().padStart(2,'0')}/{h.month.toString().padStart(2,'0')}{h.year ? `/${h.year}` : ''}</td><td className="p-2 flex gap-2">{h.name}{h.isSystem && <Lock size={12}/>}</td><td className="p-2 text-right">{!h.isSystem && <button onClick={() => handleDeleteHoliday(h.id)} className="text-red-500 p-1 hover:bg-red-50 rounded"><Trash2 size={14}/></button>}</td></tr>))}</tbody></table>
                    </div>
                 </div>
               )}
             </div>
          </div>
        </div>
      )}

      {/* SIDEBAR */}
      {isSidebarOpen && (
        <div className={`w-64 border-r flex flex-col ${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'}`}>
          <div className="p-4 border-b flex justify-between items-center dark:border-gray-700">
            <h2 className={`font-semibold flex items-center gap-2 ${darkMode ? 'text-white' : 'text-gray-900'}`}><Users size={18}/> Funcionários</h2>
            <button onClick={handleOpenAddEmployeeModal} className="text-indigo-600 hover:bg-indigo-50 dark:hover:bg-gray-700 p-1 rounded transition-colors"><Plus size={20}/></button>
          </div>
          <div className="flex-1 overflow-y-auto">
             {employees.map(emp => (
               <div key={emp.id} onClick={() => setActiveEmployeeId(emp.id)} className={`p-4 border-b cursor-pointer transition-colors group ${activeEmployeeId === emp.id ? 'bg-indigo-50 border-l-4 border-l-indigo-600 dark:bg-gray-700' : 'border-l-4 border-l-transparent hover:bg-gray-50 dark:hover:bg-gray-800 dark:border-gray-700'}`}>
                 <div className="flex justify-between items-start mb-1">
                    <div className="flex items-center gap-2 overflow-hidden">
                      {emp.status === 'processing' && <Loader2 size={14} className="animate-spin text-indigo-500 shrink-0"/>}
                      {emp.status === 'error' && <AlertTriangle size={14} className="text-red-500 shrink-0"/>}
                      <span className={`font-medium truncate ${activeEmployeeId === emp.id ? 'text-indigo-700 dark:text-indigo-300' : 'text-gray-700 dark:text-gray-300'}`}>{emp.name}</span>
                    </div>
                    <button onClick={(e) => handleDeleteEmployee(emp.id, e)} className="text-gray-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"><Trash2 size={14}/></button>
                 </div>
                 {emp.status === 'processing' ? (
                   <div className="text-xs text-indigo-400 mt-2">Processando imagens...</div>
                 ) : (
                   <>
                    <div className="grid grid-cols-2 gap-2 mt-2">
                        <div className="bg-red-50 dark:bg-red-900/20 p-1.5 rounded"><div className="text-[10px] text-red-500 font-semibold uppercase">Faltas</div><div className="text-sm font-bold text-red-700 dark:text-red-400">{emp.summary.totalFaltasDays}</div></div>
                        <div className="bg-orange-50 dark:bg-orange-900/20 p-1.5 rounded"><div className="text-[10px] text-orange-500 font-semibold uppercase">Atrasos</div><div className="text-sm font-bold text-orange-700 dark:text-orange-400">{minutesToTime(emp.summary.totalDeficitMinutes)}h</div></div>
                    </div>
                    {activeEmployeeId === emp.id && (<button onClick={(e) => { e.stopPropagation(); appendFileInputRef.current?.click(); }} className="w-full mt-3 flex items-center justify-center gap-2 bg-indigo-100 hover:bg-indigo-200 dark:bg-gray-600 text-indigo-700 dark:text-white py-1.5 rounded text-xs font-medium"><FilePlus size={14}/> Adicionar</button>)}
                   </>
                 )}
               </div>
             ))}
          </div>
        </div>
      )}

      {/* MAIN CONTENT AREA */}
      <div className="flex-1 flex flex-col h-full overflow-hidden">
        
        {/* HEADER TOOLBAR */}
        <div className={`h-16 border-b flex items-center justify-between px-4 shrink-0 ${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'}`}>
           <div className="flex items-center gap-3">
              <button onClick={() => setSidebarOpen(!isSidebarOpen)} className="p-2 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"><LayoutTemplate size={20}/></button>
              <select value={referenceMonth} onChange={(e) => setReferenceMonth(e.target.value)} className={`border rounded-lg p-2 text-sm font-medium outline-none ${darkMode ? 'bg-gray-700 border-gray-600' : 'bg-gray-50 border-gray-300'}`}>{dateOptions.map(opt => (<option key={opt.value} value={opt.value}>{opt.label}</option>))}</select>
              <div id="header-schedule" className="flex items-center gap-1 ml-4 border-l pl-4 dark:border-gray-600 overflow-x-auto no-scrollbar"><Clock size={16} className="text-gray-400 mr-2 shrink-0"/>{DAYS_OF_WEEK.map((day, idx) => (<div key={day} className="flex flex-col items-center"><span className="text-[10px] text-gray-500 font-medium uppercase">{day}</span><input type="text" value={activeEmp.schedule[idx as keyof WeeklySchedule] || '00:00'} onChange={(e) => handleScheduleChange(idx, e.target.value)} className={`w-12 text-center text-xs p-1 rounded border outline-none ${(activeEmp.schedule[idx as keyof WeeklySchedule] === '00:00') ? 'bg-gray-100 text-gray-400' : 'bg-green-50 text-green-800 border-green-200 font-bold'}`}/></div>))}</div>
           </div>
           <div className="flex items-center gap-2">
              <button id="btn-train-ai" onClick={handleTeachAI} className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${isTraining ? 'bg-yellow-100 text-yellow-700' : 'bg-indigo-50 text-indigo-700 hover:bg-indigo-100'}`} disabled={isTraining}>{isTraining ? <Loader2 size={16} className="animate-spin"/> : <BrainCircuit size={16}/>}<span>{isTraining ? 'Salvando...' : 'Treinar IA'}</span></button>
              <button onClick={() => setShowSettingsModal(true)} className="p-2 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"><Settings size={20}/></button>
              <button onClick={() => setImageVisible(!isImageVisible)} className="p-2 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg">{isImageVisible ? <Maximize2 size={20}/> : <Minimize2 size={20}/>}</button>
              <button onClick={onReset} className="p-2 text-red-500 hover:bg-red-50 rounded-lg"><X size={20}/></button>
           </div>
        </div>

        {/* WORKSPACE */}
        <div className={`flex-1 flex overflow-hidden ${appearance.imagePosition === 'left' ? 'flex-row-reverse' : 'flex-row'}`}>
          
          {/* LEFT/CENTER: TABLE */}
          <div className="flex-1 flex flex-col min-w-[300px]">
            
             {/* Resizable Summary Cards */}
             <div style={{ height: summaryPanelHeight }} className="shrink-0 bg-gray-50/50 dark:bg-gray-800/30 border-b dark:border-gray-700 overflow-hidden relative transition-none">
               {activeEmp.status === 'processing' ? (
                 <div className="flex h-full items-center justify-center gap-3">
                   <Loader2 className="w-8 h-8 animate-spin text-indigo-500"/>
                   <span className="text-lg text-gray-500">Processando dados do funcionário...</span>
                 </div>
               ) : (
                <div className="grid grid-cols-4 gap-4 p-4 h-full">
                    {/* CARD 1: EXTRAS NORMAL */}
                    <div className="bg-white dark:bg-gray-800 p-3 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 border-l-4 border-l-green-500 flex flex-col justify-center overflow-hidden">
                        <div style={{ fontSize: titleFontSize }} className="text-gray-500 font-bold uppercase mb-1 whitespace-nowrap">Ext Normal ({activeEmp.percentNormal}%)</div>
                        <div style={{ fontSize: valueFontSize }} className="font-bold text-gray-800 dark:text-white leading-none">{minutesToTime(activeEmp.summary.totalExtrasNormal)}</div>
                    </div>
                    {/* CARD 2: EXTRAS SPECIAL */}
                    <div className="bg-white dark:bg-gray-800 p-3 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 border-l-4 border-l-blue-500 flex flex-col justify-center overflow-hidden">
                        <div style={{ fontSize: titleFontSize }} className="text-gray-500 font-bold uppercase mb-1 whitespace-nowrap">Ext Especial ({activeEmp.percentSpecial}%)</div>
                        <div style={{ fontSize: valueFontSize }} className="font-bold text-gray-800 dark:text-white leading-none">{minutesToTime(activeEmp.summary.totalExtrasSpecial)}</div>
                    </div>
                    {/* CARD 3: FALTAS */}
                    <div className="bg-white dark:bg-gray-800 p-3 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 border-l-4 border-l-red-500 flex flex-col justify-center overflow-hidden">
                        <div style={{ fontSize: titleFontSize }} className="text-gray-500 font-bold uppercase mb-1 whitespace-nowrap">Faltas (Dias)</div>
                        <div className="flex items-baseline gap-2">
                            <div style={{ fontSize: valueFontSize }} className="font-bold text-red-600 leading-none">{activeEmp.summary.totalFaltasDays}</div>
                            {activeEmp.summary.totalDsrDescontado > 0 && (
                            <div style={{ fontSize: Math.max(10, titleFontSize * 0.9) }} className="font-bold text-red-400 whitespace-nowrap">+ {activeEmp.summary.totalDsrDescontado} DSR</div>
                            )}
                        </div>
                    </div>
                    {/* CARD 4: ATRASOS */}
                    <div className="bg-white dark:bg-gray-800 p-3 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 border-l-4 border-l-orange-500 flex flex-col justify-center overflow-hidden">
                        <div style={{ fontSize: titleFontSize }} className="text-gray-500 font-bold uppercase mb-1 whitespace-nowrap">Atrasos (Parcial)</div>
                        <div style={{ fontSize: valueFontSize }} className="font-bold text-orange-600 leading-none">{minutesToTime(activeEmp.summary.totalDeficitMinutes)}</div>
                    </div>
                </div>
               )}
               
               {/* Vertical Splitter for Summary */}
               <div 
                 className="absolute bottom-0 left-0 right-0 h-1.5 hover:h-2 cursor-row-resize bg-gray-200 dark:bg-gray-700 hover:bg-indigo-400 flex items-center justify-center z-10"
                 onMouseDown={() => setIsResizingSummaryPanel(true)}
               >
                 <GripHorizontal size={12} className="text-gray-400"/>
               </div>
             </div>

             {/* Table */}
             <div id="table-workspace" className="flex-1 overflow-auto relative scrollbar-thin">
                <table className="w-full border-collapse text-sm">
                   <thead className="sticky top-0 z-10 bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-200 font-bold shadow-sm">
                      <tr>
                         <th className="p-2 border dark:border-gray-700 w-10"></th>
                         <th className="p-2 border dark:border-gray-700 text-left w-16">Dia</th>
                         <th className="p-2 border dark:border-gray-700 w-20">Ent 1</th>
                         <th className="p-2 border dark:border-gray-700 w-20">Sai 1</th>
                         <th className="p-2 border dark:border-gray-700 w-20">Ent 2</th>
                         <th className="p-2 border dark:border-gray-700 w-20">Sai 2</th>
                         <th className="p-2 border dark:border-gray-700 w-20">Ent 3</th>
                         <th className="p-2 border dark:border-gray-700 w-20">Sai 3</th>
                         <th className="p-2 border dark:border-gray-700 w-20 bg-gray-50 dark:bg-gray-700">Total</th>
                         <th className="p-2 border dark:border-gray-700 w-20 text-green-700">Ext {activeEmp.percentNormal}%</th>
                         <th className="p-2 border dark:border-gray-700 w-20 text-blue-700">Ext {activeEmp.percentSpecial}%</th>
                         <th className="p-2 border dark:border-gray-700 w-24 text-red-600">DEB/FLT</th>
                      </tr>
                   </thead>
                   <tbody className="divide-y dark:divide-gray-700 bg-white dark:bg-gray-900">
                      {activeEmp.rows.map((row) => {
                         const [yearStr, monthStr] = referenceMonth.split('-');
                         const dayNum = parseInt(row.day);
                         
                         const holidayName = getHolidayName(dayNum, parseInt(monthStr), parseInt(yearStr), customHolidays);
                         const isHoliday = !!holidayName;
                         
                         const dateObj = new Date(parseInt(yearStr), parseInt(monthStr)-1, dayNum);
                         const isSunday = dateObj.getDay() === 0;
                         const dayLabel = row.dayLabel || DAYS_OF_WEEK[dateObj.getDay()];

                         const scheduleTime = activeEmp.schedule[(dateObj.getDay()) as keyof WeeklySchedule] || '00:00';
                         const hasSchedule = scheduleTime !== '00:00';
                         
                         const dailyMins = timeToMinutes(row.totalWorked) || 0;
                         const target = timeToMinutes(scheduleTime) || 0;

                         // Color Logic
                         let rowBg = '';
                         if (row.isAboned) rowBg = 'bg-gray-200 dark:bg-gray-700 text-gray-500'; // Gray when aboned
                         else if (isHoliday) rowBg = 'bg-purple-100 dark:bg-purple-900/40'; // Vivid Purple
                         else if (isSunday) rowBg = 'bg-yellow-100 dark:bg-yellow-900/40'; // Vivid Yellow
                         else if (row.isCompensatoryRest) rowBg = 'bg-blue-50 dark:bg-blue-900/20'; // DSR Rest
                         else if (target > 0 && dailyMins === 0 && !row.dayLabel?.includes('FOLGA')) rowBg = 'bg-red-50 dark:bg-red-900/20'; // Fault
                         else if (!hasSchedule) rowBg = 'bg-gray-50 dark:bg-gray-800/50';

                         const laborWarnings = getLaborWarnings(
                             row.entry1, row.exit1, row.entry2, row.exit2, row.entry3, row.exit3, 
                             dailyMins
                         );
                         
                         const isDsrDay = row.forceDsr || row.isCompensatoryRest;
                         const sundayMode = row.sundayMode || 'auto';

                         // ABONO VISUAL LOGIC:
                         // Even if aboned, we want to show the calculated value, but dimmed/strikethrough.
                         // _calculatedNormal comes from logic. We just need to check if we should display it.
                         // The calc logic in useEffect ensures _calculatedNormal is computed BEFORE the `if (!row.isAboned) acc...` check.
                         // So row._calculatedNormal holds the potential value.

                         return (
                            <tr key={row.id} className={`${rowBg} hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors ${getRowHeightClass()}`}>
                               <td className="border dark:border-gray-700 text-center"><input type="checkbox" checked={!!row.isAboned} onChange={() => toggleAbono(row.id)} className="w-4 h-4 rounded text-indigo-600 cursor-pointer"/></td>
                               <td className="border dark:border-gray-700 px-2 relative group align-top py-1">
                                  <div className="flex flex-col w-full overflow-hidden">
                                    <div className="flex items-baseline gap-1">
                                      <span className={`font-bold text-lg ${row.isAboned ? 'text-gray-500' : 'text-gray-900 dark:text-gray-100'}`}>{row.day}</span>
                                      <span className={`text-[10px] font-bold uppercase ${row.isAboned ? 'text-gray-400' : 'text-gray-500'}`}>{dayLabel}</span>
                                    </div>
                                    {holidayName && (
                                      <div title={holidayName} className={`text-[9px] font-bold leading-tight uppercase mt-0.5 truncate w-full cursor-help ${row.isAboned ? 'text-purple-300' : 'text-purple-700'}`}>
                                        {holidayName}
                                      </div>
                                    )}
                                  </div>
                               </td>
                               {isDsrDay ? (
                                 <td colSpan={6} className="border dark:border-gray-700 text-center bg-gray-50/50 dark:bg-gray-800/50">
                                   <span className="text-gray-400 font-bold tracking-widest text-lg">FOLGA</span>
                                 </td>
                               ) : (
                                 ['entry1', 'exit1', 'entry2', 'exit2', 'entry3', 'exit3'].map((field) => (
                                    <td key={field} className={`border dark:border-gray-700 p-0 relative`}>
                                       <input type="text" value={row[field as keyof TimeRow] as string} onChange={(e) => handleTimeInput(row.id, field as keyof TimeRow, e.target.value)} className={`w-full h-full text-center bg-transparent outline-none focus:bg-white dark:focus:bg-gray-700 focus:ring-2 focus:ring-inset focus:ring-indigo-500 font-mono ${row.isAboned ? 'text-gray-500 line-through decoration-gray-400' : 'text-gray-900 dark:text-gray-100'} ${getColWidthClass()}`} maxLength={5} disabled={!!row.isAboned}/>
                                    </td>
                                 ))
                               )}
                               <td className={`border dark:border-gray-700 text-center font-bold font-mono bg-gray-50/50 dark:bg-gray-800/50 relative ${row.isAboned ? 'text-gray-400 line-through' : 'text-gray-900 dark:text-gray-100'}`}>
                                  {row.totalWorked}
                                  {laborWarnings.length > 0 && !row.isAboned && (
                                     <div className="absolute top-0 right-0 p-0.5 cursor-help" title={laborWarnings.join('\n')}>
                                        <AlertTriangle size={10} className="text-orange-500" />
                                     </div>
                                  )}
                               </td>
                               <td className={`border dark:border-gray-700 text-center font-mono text-xs font-semibold ${row.isAboned ? 'text-gray-400 line-through decoration-gray-400 opacity-60' : 'text-green-700'}`}>
                                  {(row._calculatedNormal && row._calculatedNormal > 0) ? minutesToTime(row._calculatedNormal) : '-'}
                               </td>
                               <td className={`border dark:border-gray-700 text-center font-mono text-xs px-1 ${row.isAboned ? 'text-gray-400 opacity-60' : 'text-blue-700'}`}>
                                  <div className="flex items-center justify-center gap-1">
                                     <span className={`font-semibold ${row.isAboned ? 'line-through decoration-gray-400' : ''}`}>
                                        {(row._calculatedSpecial && row._calculatedSpecial > 0) ? minutesToTime(row._calculatedSpecial) : '-'}
                                     </span>
                                     {(isSunday && target > 0 && !row.isAboned) && (
                                        <button onClick={() => cycleSundayMode(row.id)} className={`text-[9px] px-1 rounded border min-w-[32px] ${
                                          sundayMode === 'extra' ? 'bg-blue-100 text-blue-700 border-blue-300 font-bold' : 
                                          sundayMode === 'off' ? 'bg-gray-200 text-gray-500 border-gray-300' : 
                                          'bg-white text-gray-500 border-gray-200'
                                        }`}>
                                          {sundayMode === 'extra' ? 'EXTRA' : sundayMode === 'off' ? 'OFF' : 'AUTO'}
                                        </button>
                                     )}
                                     {row.isSundayNoRest && sundayMode === 'auto' && !isHoliday && !row.isAboned && (
                                       <div title="Domingo trabalhado sem folga compensatória na semana">
                                         <AlertTriangle size={12} className="text-red-500" />
                                       </div>
                                     )}
                                  </div>
                               </td>
                               <td className="border dark:border-gray-700 text-center font-mono text-xs px-1">
                                  {/* DSR & Falta Logic with Abono support */}
                                  {row.forceDsr ? <button onClick={() => cycleDsrStatus(row.id)} className="bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded text-[10px] font-bold border border-indigo-200 hover:bg-indigo-200 w-full" disabled={!!row.isAboned}>DSR (M)</button>
                                  : row.manuallyDisabledDsr ? <button onClick={() => cycleDsrStatus(row.id)} className="bg-red-100 text-red-700 px-2 py-0.5 rounded text-[10px] font-bold border border-red-200 hover:bg-red-200 w-full truncate" disabled={!!row.isAboned}>1 DIA (M)</button>
                                  : row.isCompensatoryRest ? <button onClick={() => cycleDsrStatus(row.id)} className="bg-blue-100 text-blue-700 px-2 py-0.5 rounded text-[10px] font-bold border border-blue-200 hover:bg-blue-200 w-full" disabled={!!row.isAboned}>DSR (Auto)</button>
                                  : (target > 0 && dailyMins === 0 && !isHoliday && !row.dayLabel?.includes('FOLGA')) 
                                    ? (row.isAboned ? 
                                        <span className="text-gray-400 line-through decoration-gray-400 font-bold text-[10px]">1 DIA</span> 
                                        : <button onClick={() => cycleDsrStatus(row.id)} className="bg-red-100 text-red-700 px-2 py-0.5 rounded text-[10px] font-bold border border-red-200 hover:bg-red-200 w-full">1 DIA</button>)
                                  : (dailyMins < target && target > 0 && !isHoliday) 
                                    ? <span className={`font-semibold ${row.isAboned ? 'text-gray-400 line-through decoration-gray-400' : 'text-red-600'}`}>-{minutesToTime(target - dailyMins)}</span>
                                  : <span className="text-gray-300">-</span>}
                               </td>
                            </tr>
                         );
                      })}
                   </tbody>
                </table>
             </div>
          </div>

          {/* RESIZER HANDLE */}
          {isImageVisible && (
             <div className="w-1.5 hover:w-2 bg-gray-200 dark:bg-gray-700 hover:bg-indigo-400 cursor-col-resize flex items-center justify-center transition-all z-20 shrink-0" onMouseDown={() => setIsResizingImagePanel(true)}>
                <GripVertical size={12} className="text-gray-400"/>
             </div>
          )}

          {/* RIGHT/LEFT: IMAGE PANEL */}
          {isImageVisible && (
            <div id="image-panel" style={{ width: imagePanelWidth }} className={`flex flex-col border-l dark:border-gray-700 bg-gray-200 dark:bg-gray-900 shrink-0 relative overflow-hidden`}>
              <div className="absolute top-4 right-4 z-10 flex flex-col gap-2">
                 <div className="bg-black/50 backdrop-blur text-white text-xs px-2 py-1 rounded shadow">Zoom: {Math.round(imageScale * 80)}%</div>
                 {activeEmp.imageUrls.length > 1 && (
                    <div className="flex gap-1 bg-white dark:bg-gray-700 p-1 rounded shadow border dark:border-gray-600">
                      <button onClick={() => setActiveImageIndex(Math.max(0, activeImageIndex - 1))} disabled={activeImageIndex === 0} className="p-1 hover:bg-gray-100 rounded disabled:opacity-30"><ChevronLeft size={16}/></button>
                      <span className="text-xs self-center font-mono">{activeImageIndex + 1}/{activeEmp.imageUrls.length}</span>
                      <button onClick={() => setActiveImageIndex(Math.min(activeEmp.imageUrls.length - 1, activeImageIndex + 1))} disabled={activeImageIndex === activeEmp.imageUrls.length - 1} className="p-1 hover:bg-gray-100 rounded disabled:opacity-30"><ChevronRight size={16}/></button>
                    </div>
                 )}
              </div>
              
              <div 
                className={`flex-1 overflow-hidden relative ${isDraggingImage ? 'cursor-grabbing' : 'cursor-grab'} flex items-center justify-center`}
                onWheel={handleImageWheel}
                onMouseDown={handleImageMouseDown}
                onMouseMove={handleImageMouseMove}
                onMouseUp={handleImageMouseUp}
                onMouseLeave={handleImageMouseUp}
              >
                 <div 
                    className="origin-center transition-transform duration-75 ease-out will-change-transform shadow-2xl"
                    style={{ transform: `translate(${imagePosition.x}px, ${imagePosition.y}px) scale(${imageScale})` }}
                 >
                    {activeEmp.imageUrls[activeImageIndex] ? (
                       <img src={activeEmp.imageUrls[activeImageIndex]} alt="Timecard Source" className="max-w-none pointer-events-none select-none shadow-lg" draggable={false}/>
                    ) : <div className="p-10 text-gray-400">Nenhuma imagem selecionada</div>}
                 </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default TimecardEditor;
