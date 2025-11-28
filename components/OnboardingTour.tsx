
import React, { useState, useEffect } from 'react';
import { X, ChevronRight, Check } from 'lucide-react';

interface TourStep {
  target: string;
  title: string;
  content: string;
  position: 'top' | 'bottom' | 'left' | 'right';
}

const STEPS: TourStep[] = [
  {
    target: 'sidebar-add-btn',
    title: 'Adicionar Funcionários',
    content: 'Comece adicionando novos funcionários e escaneando seus cartões de ponto aqui.',
    position: 'right'
  },
  {
    target: 'header-schedule',
    title: 'Horários Previstos',
    content: 'Defina a carga horária padrão de cada dia da semana para o cálculo correto de extras.',
    position: 'bottom'
  },
  {
    target: 'table-workspace',
    title: 'Edição Inteligente',
    content: 'Verifique os horários lidos. O sistema já aplicou regras de café e DSR. Clique nos campos para ajustar.',
    position: 'top'
  },
  {
    target: 'image-panel',
    title: 'Conferência Visual',
    content: 'Use o scroll do mouse para dar zoom na imagem original e conferir os dados.',
    position: 'left'
  },
  {
    target: 'btn-train-ai',
    title: 'Treinar IA',
    content: 'Após corrigir os erros, clique aqui para salvar e ensinar a IA a ser mais precisa na próxima vez.',
    position: 'bottom'
  }
];

const OnboardingTour: React.FC = () => {
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [isVisible, setIsVisible] = useState(false);
  const [coords, setCoords] = useState<{ top: number; left: number; width: number; height: number } | null>(null);

  useEffect(() => {
    const hasSeenTour = localStorage.getItem('pontoscan_tour_seen');
    if (!hasSeenTour) {
      // Delay slightly to ensure UI is rendered
      setTimeout(() => setIsVisible(true), 1000);
    }
  }, []);

  useEffect(() => {
    if (!isVisible) return;

    const updatePosition = () => {
      const step = STEPS[currentStepIndex];
      // Try to find element by ID or data-tour attribute
      const element = document.getElementById(step.target) || document.querySelector(`[data-tour="${step.target}"]`);
      
      if (element) {
        const rect = element.getBoundingClientRect();
        setCoords({
          top: rect.top,
          left: rect.left,
          width: rect.width,
          height: rect.height
        });
        element.scrollIntoView({ behavior: 'smooth', block: 'center' });
      } else {
        // Skip step if element not found
        if (currentStepIndex < STEPS.length - 1) {
          setCurrentStepIndex(prev => prev + 1);
        } else {
          handleClose();
        }
      }
    };

    updatePosition();
    window.addEventListener('resize', updatePosition);
    return () => window.removeEventListener('resize', updatePosition);
  }, [currentStepIndex, isVisible]);

  const handleNext = () => {
    if (currentStepIndex < STEPS.length - 1) {
      setCurrentStepIndex(prev => prev + 1);
    } else {
      handleClose();
    }
  };

  const handleClose = () => {
    setIsVisible(false);
    localStorage.setItem('pontoscan_tour_seen', 'true');
  };

  if (!isVisible || !coords) return null;

  const currentStep = STEPS[currentStepIndex];
  const isLastStep = currentStepIndex === STEPS.length - 1;

  // Calculate popover position
  let popoverStyle: React.CSSProperties = {};
  const gap = 16;

  if (currentStep.position === 'bottom') {
    popoverStyle = { top: coords.top + coords.height + gap, left: coords.left };
  } else if (currentStep.position === 'top') {
    popoverStyle = { top: coords.top - gap, left: coords.left, transform: 'translateY(-100%)' };
  } else if (currentStep.position === 'right') {
    popoverStyle = { top: coords.top, left: coords.left + coords.width + gap };
  } else if (currentStep.position === 'left') {
    popoverStyle = { top: coords.top, left: coords.left - gap, transform: 'translateX(-100%)' };
  }

  return (
    <div className="fixed inset-0 z-[200] pointer-events-none">
      {/* Overlay mask using clip-path could be complex, using simplified box-shadow focus */}
      <div className="absolute inset-0 bg-black/30 backdrop-blur-[1px] transition-opacity duration-300" />
      
      {/* Highlight Box with Glow */}
      <div 
        className="absolute border-2 border-indigo-400 rounded-lg transition-all duration-300 shadow-[0_0_15px_rgba(99,102,241,0.5)]"
        style={{
          top: coords.top - 4,
          left: coords.left - 4,
          width: coords.width + 8,
          height: coords.height + 8,
        }}
      />

      {/* Tooltip Card - Glassmorphism */}
      <div 
        className="absolute pointer-events-auto w-80 bg-white/90 dark:bg-gray-800/90 backdrop-blur-xl text-gray-900 dark:text-white rounded-2xl shadow-2xl p-6 border border-white/20 dark:border-gray-700/50 transition-all duration-300 transform"
        style={popoverStyle}
      >
        <div className="flex justify-between items-start mb-3">
          <div className="flex items-center gap-2">
            <span className="flex items-center justify-center w-6 h-6 rounded-full bg-indigo-100 dark:bg-indigo-900/50 text-indigo-600 dark:text-indigo-400 text-xs font-bold">
              {currentStepIndex + 1}
            </span>
            <h3 className="font-bold text-lg leading-tight">{currentStep.title}</h3>
          </div>
          <button onClick={handleClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors">
            <X size={18} />
          </button>
        </div>
        
        <p className="text-sm text-gray-600 dark:text-gray-300 mb-6 leading-relaxed">
          {currentStep.content}
        </p>
        
        <div className="flex justify-end gap-2">
          {currentStepIndex > 0 && (
            <button 
              onClick={() => setCurrentStepIndex(prev => prev - 1)}
              className="text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-white px-3 py-1.5 text-sm font-medium transition-colors"
            >
              Voltar
            </button>
          )}
          <button 
            onClick={handleNext}
            className="flex items-center gap-1.5 bg-indigo-600 text-white px-4 py-2 rounded-xl text-sm font-medium hover:bg-indigo-700 shadow-lg shadow-indigo-500/30 transition-all active:scale-95"
          >
            {isLastStep ? 'Concluir' : 'Próximo'}
            {isLastStep ? <Check size={16}/> : <ChevronRight size={16} />}
          </button>
        </div>
      </div>
    </div>
  );
};

export default OnboardingTour;
