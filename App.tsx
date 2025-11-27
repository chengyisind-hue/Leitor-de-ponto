
import React, { useState } from 'react';
import { FileText, CheckCircle2, AlertTriangle, User, Settings, Upload, X, Moon, Sun } from 'lucide-react';
import UploadZone from './components/UploadZone';
import TimecardEditor from './components/TimecardEditor';
import { ProcessingStatus, TimeRow } from './types';
import { parseTimecardImage } from './services/geminiService';
import { normalizeAndSortRow } from './utils';

// Simple ID generator
const generateId = () => Math.random().toString(36).substr(2, 9);

const App: React.FC = () => {
  const [status, setStatus] = useState<ProcessingStatus>({ step: 'idle', message: '' });
  const [data, setData] = useState<TimeRow[]>([]);
  
  // Now managing arrays for multiple files
  const [currentImages, setCurrentImages] = useState<string[]>([]);
  const [currentFiles, setCurrentFiles] = useState<File[] | null>(null);
  
  // Settings State
  const [showSettings, setShowSettings] = useState(false);
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
        // *** NORMALIZATION STEP (Immediate Fix) ***
        // We apply the sorting/joining logic NOW, so the user sees a clean table immediately.
        const normalized = normalizeAndSortRow(
          row.entry1, row.exit1, 
          row.entry2, row.exit2, 
          row.entry3, row.exit3
        );

        return {
          id: generateId(),
          day: row.day || '00',
          date: '', 
          dayOfWeek: '', // Calendar calc will handle this
          dayLabel: row.dayLabel || '', // Captured from OCR (e.g. DOM, FOLGA)
          
          // Current Values (Normalized)
          entry1: normalized.entry1,
          exit1: normalized.exit1,
          entry2: normalized.entry2,
          exit2: normalized.exit2,
          entry3: normalized.entry3,
          exit3: normalized.exit3,

          // Original Values (For Training)
          originalEntry1: row.entry1 || '',
          originalExit1: row.exit1 || '',
          originalEntry2: row.entry2 || '',
          originalExit2: row.exit2 || '',
          originalEntry3: row.entry3 || '',
          originalExit3: row.exit3 || '',

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

  return (
    <div className={`min-h-screen font-sans transition-colors duration-200 ${darkMode ? 'bg-gray-900 text-white' : 'bg-gray-50 text-gray-900'}`}>
      
      {/* Settings Modal */}
      {showSettings && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className={`w-96 p-6 rounded-xl shadow-2xl ${darkMode ? 'bg-gray-800 border border-gray-700' : 'bg-white'}`}>
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-xl font-bold">Configurações</h3>
              <button onClick={() => setShowSettings(false)} className="p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-full">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="space-y-4">
              <div className="flex justify-between items-center p-3 rounded-lg border border-gray-200 dark:border-gray-700">
                <div className="flex items-center gap-3">
                  {darkMode ? <Moon className="w-5 h-5 text-purple-400" /> : <Sun className="w-5 h-5 text-orange-500" />}
                  <span>Modo Escuro</span>
                </div>
                <button 
                  onClick={() => setDarkMode(!darkMode)}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${darkMode ? 'bg-purple-600' : 'bg-gray-200'}`}
                >
                  <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${darkMode ? 'translate-x-6' : 'translate-x-1'}`} />
                </button>
              </div>
            </div>
            
            <div className="mt-6 text-center text-xs text-gray-500">
              Versão Beta 1.4
            </div>
          </div>
        </div>
      )}

      {/* Navigation */}
      <nav className={`${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'} border-b sticky top-0 z-50`}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
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
              <button onClick={() => setShowSettings(true)} className={`p-2 rounded-full hover:bg-opacity-10 ${darkMode ? 'text-gray-300 hover:bg-white' : 'text-gray-400 hover:bg-black'}`}>
                <Settings className="h-5 w-5" />
              </button>
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
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        
        {status.step === 'idle' || status.step === 'error' || status.step === 'uploading' ? (
          <div className="max-w-3xl mx-auto mt-12">
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
                <div key={idx} className={`p-6 rounded-xl shadow-sm border ${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-100'}`}>
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
            />
          ) : (
             <div className="flex flex-col items-center justify-center h-96">
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
