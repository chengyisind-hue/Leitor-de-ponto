import React, { useState } from 'react';
import { FileText, CheckCircle2, AlertTriangle, User, Upload } from 'lucide-react';
import UploadZone from './components/UploadZone';
import TimecardEditor from './components/TimecardEditor';
import Login from './components/Login';
import { ProcessingStatus, TimeRow } from './types';
import { parseTimecardImage } from './services/geminiService';
import { processRawTimestampsToColumns } from './utils';

// Simple ID generator
const generateId = () => Math.random().toString(36).substr(2, 9);

const App: React.FC = () => {
  // Auth State
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  
  const [status, setStatus] = useState<ProcessingStatus>({ step: 'idle', message: '' });
  const [data, setData] = useState<TimeRow[]>([]);
  
  // Now managing arrays for multiple files
  const [currentImages, setCurrentImages] = useState<string[]>([]);
  const [currentFiles, setCurrentFiles] = useState<File[] | null>(null);
  
  // Settings State
  const [darkMode, setDarkMode] = useState(false);

  const handleFileSelect = async (files: File[]) => {
    setStatus({ step: 'uploading', message: 'Lendo arquivos...' });
    setCurrentFiles(files);
    
    // Read all files to Base64
    const promises = files.map(file => {
      return new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => resolve(e.target?.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
    });

    try {
      const base64Results = await Promise.all(promises);
      setCurrentImages(base64Results);
      
      setStatus({ step: 'processing', message: 'A IA está unificando os dados dos cartões...' });
      
      // Pass array of strings
      const rawRows = await parseTimecardImage(base64Results);
        
      if (!rawRows || rawRows.length === 0) {
        throw new Error("Nenhum dado foi encontrado nas imagens. Verifique se estão legíveis.");
      }

      const processedRows: TimeRow[] = rawRows.map((row: any) => {
        const rawTimestamps = Array.isArray(row.timestamps) ? row.timestamps : [];
        const normalized = processRawTimestampsToColumns(rawTimestamps);
        const originalEntries = [...rawTimestamps].sort();

        return {
          id: generateId(),
          day: row.day || '00',
          date: '', 
          dayOfWeek: '', 
          dayLabel: row.dayLabel || '', 
          
          entry1: normalized.entry1,
          exit1: normalized.exit1,
          entry2: normalized.entry2,
          exit2: normalized.exit2,
          entry3: normalized.entry3,
          exit3: normalized.exit3,

          originalEntry1: originalEntries[0] || '',
          originalExit1: originalEntries[1] || '',
          originalEntry2: originalEntries[2] || '',
          originalExit2: originalEntries[3] || '',
          originalEntry3: originalEntries[4] || '',
          originalExit3: originalEntries[5] || '',

          totalWorked: '00:00', 
          balance: '00:00', 
          overtime: '00:00',
          deficit: '00:00',
          isWeekend: row.isWeekend || false
        };
      });

      setData(processedRows);
      setStatus({ step: 'done', message: 'Concluído!' });

    } catch (error: any) {
      console.error(error);
      const errorMsg = error.message || 'Falha ao processar as imagens.';
      setStatus({ step: 'error', message: errorMsg });
    }
  };

  const handleReset = () => {
    setData([]);
    setCurrentImages([]);
    setCurrentFiles(null);
    setStatus({ step: 'idle', message: '' });
  };

  if (!isAuthenticated) {
    return <Login onLogin={() => setIsAuthenticated(true)} darkMode={darkMode} />;
  }

  return (
    // Added 'dark' class conditional here to activate Tailwind's dark: modifiers
    <div className={`min-h-screen font-sans transition-colors duration-200 ${darkMode ? 'dark bg-gray-900 text-white' : 'bg-white text-gray-900'}`}>
      
      {/* Navigation */}
      <nav className={`${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'} border-b sticky top-0 z-50`}>
        <div className="w-full px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            <div className="flex items-center gap-3">
              <div className="bg-indigo-600 p-2 rounded-lg">
                <FileText className="h-6 w-6 text-white" />
              </div>
              <div>
                <span className={`text-xl font-bold tracking-tight ${darkMode ? 'text-white' : 'text-gray-900'}`}>PontoScan AI</span>
                <span className="ml-2 text-xs bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full font-medium">MULTI</span>
              </div>
            </div>
            <div className="flex items-center space-x-4">
              <div className={`flex items-center gap-2 pl-4 border-l ${darkMode ? 'border-gray-700' : 'border-gray-200'}`}>
                <div className="h-8 w-8 rounded-full bg-gray-200 flex items-center justify-center">
                  <User className="h-5 w-5 text-gray-500" />
                </div>
                <div className="text-sm">
                  <p className={`font-medium ${darkMode ? 'text-gray-200' : 'text-gray-700'}`}>DP Contabilidade</p>
                  <p className="text-xs text-gray-500">Admin</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <main className="w-full h-[calc(100vh-64px)] overflow-hidden">
        
        {status.step === 'idle' || status.step === 'error' || status.step === 'uploading' ? (
          <div className="max-w-4xl mx-auto py-12 px-4 overflow-y-auto h-full">
            <div className="text-center mb-10">
              <h1 className={`text-4xl font-extrabold mb-4 ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                Digitalize Frente e Verso em Segundos
              </h1>
              <p className={`text-lg ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                Arraste as fotos do cartão (frente e verso). Nossa IA unifica os dias, 
                permite configurar a carga horária e exportar o cálculo final.
              </p>
            </div>

            <UploadZone 
              onFileSelect={handleFileSelect} 
              isProcessing={status.step === 'uploading'} 
            />

            {status.step === 'error' && (
              <div className="mt-6 p-4 bg-red-50 border border-red-200 rounded-lg flex items-center gap-3 text-red-700">
                <AlertTriangle className="h-5 w-5" />
                <p>{status.message}</p>
              </div>
            )}

            <div className="mt-16 grid grid-cols-1 md:grid-cols-3 gap-8">
              {[
                { icon: FileText, color: 'blue', title: 'Múltiplos Arquivos', desc: 'Envie frente e verso de uma só vez. A IA organiza a sequência cronológica.' },
                { icon: CheckCircle2, color: 'green', title: 'Carga Flexível', desc: 'Configure as horas previstas por dia da semana (Seg-Sex, Sáb) para cálculo exato de extras.' },
                { icon: Upload, color: 'purple', title: 'Exportação Completa', desc: 'Exporte relatórios com nome do funcionário, cálculos e saldo final.' }
              ].map((item, idx) => (
                <div key={idx} className={`p-6 rounded-xl shadow-sm border ${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'}`}>
                  <div className={`w-10 h-10 rounded-lg flex items-center justify-center mb-4 bg-${item.color}-100`}>
                    <item.icon className={`text-${item.color}-600 w-5 h-5`} />
                  </div>
                  <h3 className={`font-bold mb-2 ${darkMode ? 'text-white' : 'text-gray-900'}`}>{item.title}</h3>
                  <p className={`text-sm ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>{item.desc}</p>
                </div>
              ))}
            </div>
          </div>
        ) : (
          /* Editor View */
          data.length > 0 ? (
            <TimecardEditor 
              initialData={data} 
              imageUrls={currentImages}
              files={currentFiles} 
              onReset={handleReset}
              darkMode={darkMode}
              setDarkMode={setDarkMode}
            />
          ) : (
             <div className="flex flex-col items-center justify-center h-full">
                <div className="animate-spin rounded-full h-16 w-16 border-t-2 border-b-2 border-indigo-600 mb-4"></div>
                <h2 className={`text-xl font-semibold ${darkMode ? 'text-white' : 'text-gray-700'}`}>{status.message}</h2>
                <p className="text-gray-500 mt-2">Processando imagens com Gemini 3...</p>
             </div>
          )
        )}
      </main>
    </div>
  );
};

export default App;