
import React, { useState, useEffect } from 'react';
import { TimeRow, WeeklySchedule } from '../types';
import { calculateDailyMinutes, calculateBalance, minutesToTime, timeToMinutes } from '../utils';
import { Download, RefreshCw, Database, Loader2, Calendar, User, Clock, ChevronLeft, ChevronRight } from 'lucide-react';
import { saveTrainingData } from '../services/trainingService';

interface TimecardEditorProps {
  initialData: TimeRow[];
  imageUrls: string[];
  files: File[] | null;
  onReset: () => void;
  darkMode?: boolean;
}

const DAYS_OF_WEEK = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

const TimecardEditor: React.FC<TimecardEditorProps> = ({ initialData, imageUrls, files, onReset, darkMode = false }) => {
  const [rows, setRows] = useState<TimeRow[]>(initialData);
  const [summary, setSummary] = useState({ totalHours: 0, balance: 0, missingDays: 0 });
  const [employeeName, setEmployeeName] = useState('');
  
  // Reference Month State (Defaults to current YYYY-MM)
  const [referenceMonth, setReferenceMonth] = useState(new Date().toISOString().slice(0, 7));

  // Weekly Schedule Configuration
  const [schedule, setSchedule] = useState<WeeklySchedule>({
    0: '00:00', // Dom
    1: '08:00', // Seg
    2: '08:00',
    3: '08:00',
    4: '08:00',
    5: '08:00',
    6: '00:00', // Sab
  });

  const [activeImageIndex, setActiveImageIndex] = useState(0);

  const [isSaving, setIsSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'success' | 'error'>('idle');

  useEffect(() => {
    let totalMins = 0;
    let balanceMins = 0;
    let missing = 0;

    const [yearStr, monthStr] = referenceMonth.split('-');
    const year = parseInt(yearStr);
    const monthIndex = parseInt(monthStr) - 1; 

    rows.forEach(row => {
      // Logic for Day Type
      const label = row.dayLabel?.toUpperCase() || '';
      
      let isSunday = label.includes('DOM');
      let isSaturday = label.includes('SAB');
      let isFolga = label.includes('FOLGA') || label.includes('FERIADO');

      // Determine day index (0=Sun, 6=Sat)
      let dayIndex = -1;
      let dayNum = parseInt(row.day);
      if (!isNaN(dayNum)) {
        const d = new Date(year, monthIndex, dayNum, 12, 0, 0);
        dayIndex = d.getDay();
        if (dayIndex === 0) isSunday = true;
        if (dayIndex === 6) isSaturday = true;
      }

      // Get target minutes for this specific day of the week
      const targetTimeStr = dayIndex >= 0 ? schedule[dayIndex as keyof WeeklySchedule] : '08:00';
      const targetMinutes = timeToMinutes(targetTimeStr) || 0;

      // Check if row is empty (Aboned/Implicit Folga)
      const hasContent = [row.entry1, row.exit1, row.entry2, row.exit2, row.entry3, row.exit3]
        .some(v => v && v.trim() !== '' && v !== '[?]' && v !== '--');
      
      const isImplicitFolga = !isSunday && !isSaturday && !hasContent;
      // If the target is 0, it's effectively a day off unless worked
      const isDayOff = isSunday || isSaturday || isFolga || isImplicitFolga || row.isWeekend || targetMinutes === 0;

      const dailyMins = calculateDailyMinutes(
        row.entry1, row.exit1, 
        row.entry2, row.exit2,
        row.entry3, row.exit3
      );
      
      const dailyBal = calculateBalance(dailyMins, targetMinutes, isDayOff);
      
      totalMins += dailyMins;
      balanceMins += dailyBal;

      if (!isDayOff && dailyBal < 0) {
        missing++;
      }
    });

    setSummary({
      totalHours: totalMins,
      balance: balanceMins,
      missingDays: missing
    });
    
  }, [rows, referenceMonth, schedule]);

  // Handle auto-formatting for time inputs (HH:MM)
  const handleTimeInput = (id: string, field: keyof TimeRow, value: string) => {
    // Remove non-numeric chars except :
    let clean = value.replace(/[^\d:]/g, '');
    
    // Auto-insert colon if user typed 3 or more digits without one
    if (!clean.includes(':') && clean.length > 2) {
      clean = clean.slice(0, 2) + ':' + clean.slice(2);
    }
    
    // Limit length to 5 (00:00)
    if (clean.length > 5) clean = clean.slice(0, 5);

    setRows(prev => prev.map(row => {
      if (row.id === id) {
        return { ...row, [field]: clean };
      }
      return row;
    }));
    if (saveStatus !== 'idle') setSaveStatus('idle');
  };

  const handleScheduleChange = (dayIndex: number, value: string) => {
     let clean = value.replace(/[^\d:]/g, '');
     if (!clean.includes(':') && clean.length > 2) {
       clean = clean.slice(0, 2) + ':' + clean.slice(2);
     }
     if (clean.length > 5) clean = clean.slice(0, 5);

     setSchedule(prev => ({
       ...prev,
       [dayIndex]: clean
     }));
  };

  const handleSaveAndLearn = async () => {
    if (!files || files.length === 0) return;
    setIsSaving(true);
    setSaveStatus('idle');

    try {
      // Just save the first file for now in training data context, or loop
      await saveTrainingData(files[0], rows);
      setSaveStatus('success');
      setTimeout(() => setSaveStatus('idle'), 3000);
    } catch (error) {
      console.error(error);
      setSaveStatus('error');
    } finally {
      setIsSaving(false);
    }
  };

  const handleExport = (format: 'csv' | 'json') => {
    if (format === 'json') {
      const exportData = {
        employee: employeeName,
        month: referenceMonth,
        schedule,
        rows
      };
      const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `ponto_${employeeName || 'funcionario'}_${referenceMonth}.json`;
      a.click();
    } else {
      const headers = ['Data', 'Dia', 'Ent 1', 'Sai 1', 'Ent 2', 'Sai 2', 'Ent 3', 'Sai 3', 'Total Horas', 'Saldo'];
      const csvContent = [
        `Funcionario: ${employeeName}`,
        `Referencia: ${referenceMonth}`,
        headers.join(','),
        ...rows.map(r => {
           const mins = calculateDailyMinutes(r.entry1, r.exit1, r.entry2, r.exit2, r.entry3, r.exit3);
           
           const [yearStr, monthStr] = referenceMonth.split('-');
           const d = new Date(parseInt(yearStr), parseInt(monthStr)-1, parseInt(r.day), 12,0,0);
           const dayIdx = d.getDay();
           const target = timeToMinutes(schedule[dayIdx as keyof WeeklySchedule] || '08:00') || 0;
           
           const bal = calculateBalance(mins, target, r.isWeekend);
           
           return `${r.date},${r.dayLabel || r.dayOfWeek},${r.entry1},${r.exit1},${r.entry2},${r.exit2},${r.entry3},${r.exit3},${minutesToTime(mins)},${minutesToTime(bal)}`;
        })
      ].join('\n');
      
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `ponto_${employeeName || 'funcionario'}_${referenceMonth}.csv`;
      a.click();
    }
  };

  const getCellStyle = (value: string, type: 'blue' | 'green' | 'yellow') => {
    const isUncertain = value.includes('?') || value === '[?]';
    let baseClass = `w-14 px-1 py-1 border rounded focus:ring-1 text-center font-medium transition-all ${darkMode ? 'bg-gray-700 border-gray-600 text-white' : 'bg-white border-gray-300 text-gray-800'} `;
    
    if (isUncertain) return baseClass + "border-red-500 bg-red-50 text-red-700 ring-2 ring-red-200 focus:ring-red-500 font-bold animate-pulse";
    
    if (darkMode) {
       if (type === 'blue') return baseClass + "focus:ring-blue-500";
       if (type === 'green') return baseClass + "focus:ring-green-500";
       if (type === 'yellow') return baseClass + "focus:ring-yellow-500";
    } else {
       if (type === 'blue') return baseClass + "focus:ring-blue-500";
       if (type === 'green') return baseClass + "focus:ring-green-500";
       if (type === 'yellow') return baseClass + "focus:ring-yellow-500";
    }
    return baseClass;
  };

  return (
    <div className="flex flex-col h-[calc(100vh-100px)] gap-6">
      {/* Header Actions */}
      <div className={`flex flex-col gap-4 p-4 rounded-lg shadow-sm border ${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'}`}>
        
        {/* Top Row: Employee & Date */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div className="flex items-center gap-4 flex-1">
             <div className="relative flex-1 max-w-sm">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <User className="h-5 w-5 text-gray-400" />
                </div>
                <input
                  type="text"
                  className={`block w-full pl-10 pr-3 py-2 border rounded-md leading-5 placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 sm:text-sm ${darkMode ? 'bg-gray-700 border-gray-600 text-white' : 'bg-white border-gray-300 text-gray-900'}`}
                  placeholder="Nome do Funcionário"
                  value={employeeName}
                  onChange={(e) => setEmployeeName(e.target.value)}
                />
             </div>

             <div className={`flex items-center gap-2 p-2 rounded border ${darkMode ? 'bg-gray-700 border-gray-600' : 'bg-gray-50 border-gray-200'}`}>
              <Calendar className="w-4 h-4 text-gray-500" />
              <input 
                type="month" 
                value={referenceMonth}
                onChange={(e) => setReferenceMonth(e.target.value)}
                className={`bg-transparent border-none text-sm font-bold focus:ring-0 cursor-pointer ${darkMode ? 'text-white' : 'text-gray-900'}`}
              />
            </div>
          </div>

          <div className="flex gap-2">
            <button
                onClick={handleSaveAndLearn}
                disabled={isSaving || !files}
                className={`flex items-center px-4 py-2 rounded-md transition-all border text-sm ${
                  saveStatus === 'success' ? 'bg-green-100 text-green-700 border-green-200' : 
                  darkMode ? 'bg-gray-700 text-white border-gray-600' : 'bg-white text-gray-700 border-gray-300'
                }`}
              >
                {isSaving ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Salavando...</> : <><Database className="w-4 h-4 mr-2 text-indigo-500" />Ensinar IA</>}
            </button>
            <button onClick={() => handleExport('csv')} className="flex items-center px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 transition-colors shadow-sm text-sm">
              <Download className="w-4 h-4 mr-2" /> Exportar
            </button>
            <button onClick={onReset} className="flex items-center px-4 py-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-md text-sm border border-transparent">
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Middle Row: Expected Hours Configuration */}
        <div className={`p-3 rounded-lg border ${darkMode ? 'bg-gray-900/50 border-gray-700' : 'bg-gray-50 border-gray-100'}`}>
          <div className="flex items-center gap-2 mb-2">
             <Clock className="w-4 h-4 text-indigo-500" />
             <span className={`text-sm font-semibold ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>Horas Previstas (Carga Horária)</span>
             <span className="text-xs text-gray-400 font-normal">- Dias de folga devem ser 00:00</span>
          </div>
          <div className="flex flex-wrap gap-4">
             {DAYS_OF_WEEK.map((day, index) => (
               <div key={index} className="flex flex-col items-center gap-1">
                 <span className={`text-xs uppercase font-bold ${darkMode ? 'text-gray-500' : 'text-gray-400'}`}>{day}</span>
                 <input 
                    type="text" 
                    value={schedule[index as keyof WeeklySchedule]}
                    onChange={(e) => handleScheduleChange(index, e.target.value)}
                    className={`w-16 p-1 text-center text-sm border rounded focus:ring-1 focus:ring-indigo-500 ${darkMode ? 'bg-gray-700 border-gray-600 text-white' : 'bg-white border-gray-300 text-gray-800'}`}
                 />
               </div>
             ))}
          </div>
        </div>

        {/* Bottom Row: Stats */}
        <div className={`flex space-x-6 text-sm px-4 py-2 rounded-lg border ${darkMode ? 'bg-gray-700 border-gray-600' : 'bg-indigo-50 border-indigo-100'}`}>
          <div>
            <span className="text-gray-500">Total Horas:</span>
            <span className={`ml-2 font-bold ${darkMode ? 'text-white' : 'text-gray-900'}`}>{minutesToTime(summary.totalHours)}</span>
          </div>
          <div>
            <span className="text-gray-500">Saldo Banco:</span>
            <span className={`ml-2 font-bold ${summary.balance >= 0 ? 'text-green-600' : 'text-red-500'}`}>
              {minutesToTime(summary.balance)}
            </span>
          </div>
          {summary.missingDays > 0 && (
             <div className="text-red-500 font-medium">
                {summary.missingDays} dias com déficit
             </div>
          )}
        </div>
      </div>

      <div className="flex flex-1 gap-6 overflow-hidden">
        {/* Left: Image Viewer with Multi-support */}
        <div className="w-1/3 bg-gray-900 rounded-lg overflow-hidden flex flex-col shadow-lg relative group">
           {imageUrls.length > 1 && (
             <div className="absolute top-2 left-0 right-0 z-10 flex justify-center gap-2">
                {imageUrls.map((_, idx) => (
                  <button 
                    key={idx}
                    onClick={() => setActiveImageIndex(idx)}
                    className={`px-3 py-1 rounded-full text-xs font-bold shadow-md transition-all ${
                      activeImageIndex === idx 
                      ? 'bg-indigo-600 text-white scale-110' 
                      : 'bg-white/80 text-gray-800 hover:bg-white'
                    }`}
                  >
                    Pag {idx + 1}
                  </button>
                ))}
             </div>
           )}
           
           <div className="flex-1 relative overflow-auto flex items-center justify-center bg-black">
              <img 
                src={imageUrls[activeImageIndex]} 
                alt={`Página ${activeImageIndex + 1}`} 
                className="max-w-full max-h-full object-contain" 
              />
           </div>
           
           {imageUrls.length > 1 && (
             <>
               <button 
                  onClick={() => setActiveImageIndex(prev => Math.max(0, prev - 1))}
                  className="absolute left-2 top-1/2 -translate-y-1/2 bg-black/50 text-white p-2 rounded-full hover:bg-black/70 disabled:opacity-30 transition-all"
                  disabled={activeImageIndex === 0}
               >
                 <ChevronLeft className="w-6 h-6" />
               </button>
               <button 
                  onClick={() => setActiveImageIndex(prev => Math.min(imageUrls.length - 1, prev + 1))}
                  className="absolute right-2 top-1/2 -translate-y-1/2 bg-black/50 text-white p-2 rounded-full hover:bg-black/70 disabled:opacity-30 transition-all"
                  disabled={activeImageIndex === imageUrls.length - 1}
               >
                 <ChevronRight className="w-6 h-6" />
               </button>
             </>
           )}
        </div>

        {/* Right: Editable Table */}
        <div className={`flex-1 flex flex-col rounded-lg shadow-lg border overflow-hidden ${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'}`}>
          <div className="overflow-auto scrollbar-thin flex-1">
            <table className="w-full text-sm text-left">
              <thead className={`text-xs uppercase sticky top-0 z-10 ${darkMode ? 'bg-gray-700 text-gray-300' : 'bg-gray-50 text-gray-700'}`}>
                <tr>
                  <th className="px-3 py-3 text-center w-12">Dia</th>
                  <th className="px-1 py-3 text-center opacity-75">Ent 1</th>
                  <th className="px-1 py-3 text-center opacity-75">Sai 1</th>
                  <th className="px-1 py-3 text-center opacity-75">Ent 2</th>
                  <th className="px-1 py-3 text-center opacity-75">Sai 2</th>
                  <th className="px-1 py-3 text-center opacity-75">Ent 3</th>
                  <th className="px-1 py-3 text-center opacity-75">Sai 3</th>
                  <th className="px-3 py-3 text-right">Horas</th>
                  <th className="px-3 py-3 text-right font-bold text-gray-600">Saldo</th>
                </tr>
              </thead>
              <tbody className={`divide-y ${darkMode ? 'divide-gray-700' : 'divide-gray-200'}`}>
                {rows.map((row: any) => {
                  const [yearStr, monthStr] = referenceMonth.split('-');
                  const year = parseInt(yearStr);
                  const monthIndex = parseInt(monthStr) - 1;
                  
                  // Re-calc Date for display logic
                  let isSunday = false;
                  let isSaturday = false;
                  let dayIndex = 0;
                  
                  const d = new Date(year, monthIndex, parseInt(row.day), 12,0,0);
                  if (!isNaN(d.getTime())) {
                     dayIndex = d.getDay();
                     if (dayIndex === 0) isSunday = true;
                     if (dayIndex === 6) isSaturday = true;
                  }

                  const label = row.dayLabel?.toUpperCase() || '';
                  const isFolga = label.includes('FOLGA') || label.includes('FERIADO');
                  
                  // Target Minutes from Schedule
                  const targetTimeStr = schedule[dayIndex as keyof WeeklySchedule] || '08:00';
                  const targetMinutes = timeToMinutes(targetTimeStr) || 0;

                  const hasContent = [row.entry1, row.exit1, row.entry2, row.exit2, row.entry3, row.exit3]
                    .some(v => v && v.trim() !== '' && v !== '[?]' && v !== '--');
                  
                  // Implicit Folga if no content and target is 0 OR it's a weekend without schedule
                  // But strictly, if target > 0, we expect content.
                  const isImplicitFolga = !hasContent && targetMinutes === 0;

                  // Calc stats
                  const dailyMins = calculateDailyMinutes(row.entry1, row.exit1, row.entry2, row.exit2, row.entry3, row.exit3);
                  const dailyBal = calculateBalance(dailyMins, targetMinutes, isFolga || isImplicitFolga);
                  
                  const totalWorked = minutesToTime(dailyMins);
                  const saldoStr = minutesToTime(dailyBal);
                  const isPositive = dailyBal >= 0;

                  // Styling
                  let rowClass = `transition-colors ${darkMode ? 'hover:bg-gray-700' : 'hover:bg-gray-50'} `;
                  
                  if (isSunday) {
                    rowClass += darkMode ? "bg-purple-900/30 border-l-4 border-purple-500 " : "bg-purple-100 border-l-4 border-purple-500 "; 
                  } else if (isSaturday) {
                    rowClass += darkMode ? "bg-orange-900/30 " : "bg-orange-50 ";
                  } else if (isFolga) {
                     rowClass += "opacity-75 ";
                  }

                  return (
                    <tr key={row.id} className={rowClass}>
                      <td className="px-3 py-2 whitespace-nowrap text-center">
                        <div className={`font-bold text-lg ${isSunday ? 'text-purple-600 dark:text-purple-400' : darkMode ? 'text-white' : 'text-gray-900'}`}>
                          {row.day}
                        </div>
                        {isSunday && <div className="text-[10px] text-purple-600 font-bold uppercase tracking-wider">DOM</div>}
                        {isSaturday && <div className="text-[10px] text-orange-600 font-bold uppercase tracking-wider">SAB</div>}
                        {(isFolga || isImplicitFolga) && <div className="text-[10px] text-gray-500 font-bold uppercase tracking-wider">FOLGA</div>}
                      </td>
                      <td className="px-1 py-2 text-center"><input type="text" value={row.entry1} onChange={(e) => handleTimeInput(row.id, 'entry1', e.target.value)} className={getCellStyle(row.entry1, 'blue')} disabled={isImplicitFolga} /></td>
                      <td className="px-1 py-2 text-center"><input type="text" value={row.exit1} onChange={(e) => handleTimeInput(row.id, 'exit1', e.target.value)} className={getCellStyle(row.exit1, 'blue')} disabled={isImplicitFolga} /></td>
                      <td className="px-1 py-2 text-center"><input type="text" value={row.entry2} onChange={(e) => handleTimeInput(row.id, 'entry2', e.target.value)} className={getCellStyle(row.entry2, 'green')} disabled={isImplicitFolga} /></td>
                      <td className="px-1 py-2 text-center"><input type="text" value={row.exit2} onChange={(e) => handleTimeInput(row.id, 'exit2', e.target.value)} className={getCellStyle(row.exit2, 'green')} disabled={isImplicitFolga} /></td>
                      <td className="px-1 py-2 text-center"><input type="text" value={row.entry3} onChange={(e) => handleTimeInput(row.id, 'entry3', e.target.value)} className={getCellStyle(row.entry3, 'yellow')} disabled={isImplicitFolga} /></td>
                      <td className="px-1 py-2 text-center"><input type="text" value={row.exit3} onChange={(e) => handleTimeInput(row.id, 'exit3', e.target.value)} className={getCellStyle(row.exit3, 'yellow')} disabled={isImplicitFolga} /></td>
                      
                      <td className={`px-3 py-2 text-right font-mono font-medium ${darkMode ? 'text-gray-300' : 'text-gray-600'}`}>{isImplicitFolga ? '-' : totalWorked}</td>
                      <td className={`px-3 py-2 text-right font-mono font-bold ${isPositive ? 'text-green-600' : 'text-red-500'}`}>{saldoStr}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};
export default TimecardEditor;
