import React, { useCallback } from 'react';
import { Upload, FileUp, Loader2, Files } from 'lucide-react';

interface UploadZoneProps {
  onFileSelect: (files: File[]) => void;
  isProcessing: boolean;
}

const UploadZone: React.FC<UploadZoneProps> = ({ onFileSelect, isProcessing }) => {
  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.stopPropagation();
      if (isProcessing) return;

      if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        const fileList = Array.from(e.dataTransfer.files);
        // Explicitly cast to 'any' to avoid 'Property type does not exist on type unknown' error
        // Cast result back to File[] for the callback
        const imageFiles = fileList.filter((f: any) => f.type.startsWith('image/')) as File[];
        
        if (imageFiles.length > 0) {
          onFileSelect(imageFiles);
        } else {
          alert('Por favor, envie apenas arquivos de imagem (JPG, PNG).');
        }
      }
    },
    [onFileSelect, isProcessing]
  );

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const fileList = Array.from(e.target.files);
      onFileSelect(fileList);
    }
  };

  return (
    <div
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      className={`relative border-2 border-dashed rounded-xl p-12 text-center transition-colors cursor-pointer ${
        isProcessing
          ? 'border-gray-300 bg-gray-50 cursor-not-allowed'
          : 'border-indigo-300 hover:border-indigo-500 hover:bg-indigo-50 bg-white'
      }`}
    >
      <input
        type="file"
        accept="image/*"
        multiple
        onChange={handleChange}
        disabled={isProcessing}
        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer disabled:cursor-not-allowed"
      />
      
      <div className="flex flex-col items-center justify-center space-y-4">
        {isProcessing ? (
          <>
            <Loader2 className="w-12 h-12 text-indigo-600 animate-spin" />
            <div className="space-y-1">
              <p className="text-lg font-medium text-gray-900">Analisando imagens...</p>
              <p className="text-sm text-gray-500">A IA está processando as imagens enviadas.</p>
            </div>
          </>
        ) : (
          <>
            <div className="p-4 bg-indigo-100 rounded-full relative">
              <Files className="w-8 h-8 text-indigo-600 absolute top-3 left-3 opacity-30" />
              <FileUp className="w-8 h-8 text-indigo-600 relative z-10" />
            </div>
            <div className="space-y-1">
              <p className="text-lg font-medium text-gray-900">
                Clique ou arraste imagens
              </p>
              <p className="text-sm text-gray-500">
                Suporta múltiplos arquivos (ex: Frente e Verso)
              </p>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default UploadZone;