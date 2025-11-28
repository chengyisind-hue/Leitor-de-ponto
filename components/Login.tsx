import React, { useState } from 'react';
import { Lock, Mail, ArrowRight, FileText, Loader2, ServerCrash, AlertTriangle } from 'lucide-react';
import { signIn, isSupabaseConfigured } from '../services/supabaseClient';

interface LoginProps {
  onLogin: () => void;
  darkMode: boolean;
}

const Login: React.FC<LoginProps> = ({ onLogin, darkMode }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const { data, error } = await signIn(email, password);
      
      if (error) {
        if (error.message === 'Invalid login credentials') {
          setError('E-mail ou senha incorretos.');
        } else {
          setError(error.message);
        }
      }
      // Sucesso é tratado pelo listener onAuthStateChange no App.tsx
    } catch (err: any) {
      setError('Ocorreu um erro inesperado ao tentar entrar.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={`min-h-screen flex items-center justify-center ${darkMode ? 'bg-gray-900' : 'bg-gray-50'}`}>
      <div className={`max-w-md w-full p-8 rounded-2xl shadow-xl ${darkMode ? 'bg-gray-800' : 'bg-white'}`}>
        <div className="text-center mb-8">
          <div className="bg-indigo-600 w-16 h-16 rounded-xl flex items-center justify-center mx-auto mb-4 shadow-lg transform -rotate-6">
            <FileText className="text-white w-8 h-8" />
          </div>
          <h2 className={`text-3xl font-bold ${darkMode ? 'text-white' : 'text-gray-900'}`}>PontoScan AI</h2>
          <p className={`text-sm mt-2 ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>Acesse para gerenciar pontos</p>
        </div>

        {!isSupabaseConfigured && (
          <div className="mb-6 p-4 bg-yellow-50 border border-yellow-200 rounded-lg text-left">
            <div className="flex items-center gap-2 mb-2 text-yellow-800 font-bold text-sm">
              <AlertTriangle size={16} />
              Configuração Necessária
            </div>
            <p className="text-xs text-yellow-700 mb-2">
              As variáveis de ambiente do Supabase não foram encontradas. Se você está na Vercel, adicione:
            </p>
            <ul className="text-[10px] font-mono bg-yellow-100 p-2 rounded text-yellow-900 space-y-1">
              <li>VITE_SUPABASE_URL</li>
              <li>VITE_SUPABASE_ANON_KEY</li>
            </ul>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>E-mail</label>
            <div className="relative">
              <Mail className="absolute left-3 top-3 text-gray-400 w-5 h-5" />
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                disabled={!isSupabaseConfigured}
                className={`w-full pl-10 pr-4 py-3 rounded-lg border focus:ring-2 focus:ring-indigo-500 outline-none transition-colors ${
                  darkMode 
                    ? 'bg-gray-700 border-gray-600 text-white placeholder-gray-400' 
                    : 'bg-white border-gray-300 text-gray-900'
                } ${!isSupabaseConfigured ? 'opacity-50 cursor-not-allowed' : ''}`}
                placeholder="seu@email.com"
              />
            </div>
          </div>

          <div>
            <label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>Senha</label>
            <div className="relative">
              <Lock className="absolute left-3 top-3 text-gray-400 w-5 h-5" />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                disabled={!isSupabaseConfigured}
                className={`w-full pl-10 pr-4 py-3 rounded-lg border focus:ring-2 focus:ring-indigo-500 outline-none transition-colors ${
                  darkMode 
                    ? 'bg-gray-700 border-gray-600 text-white placeholder-gray-400' 
                    : 'bg-white border-gray-300 text-gray-900'
                } ${!isSupabaseConfigured ? 'opacity-50 cursor-not-allowed' : ''}`}
                placeholder="••••••••"
              />
            </div>
          </div>

          {error && (
            <div className="p-3 rounded bg-red-50 text-red-600 text-sm font-medium flex items-start gap-2 border border-red-100">
              <ServerCrash size={18} className="shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          <button
            type="submit"
            disabled={loading || !isSupabaseConfigured}
            className={`w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 rounded-lg shadow-lg hover:shadow-xl transition-all flex items-center justify-center gap-2 group ${loading || !isSupabaseConfigured ? 'opacity-70 cursor-not-allowed' : ''}`}
          >
            {loading ? <Loader2 className="animate-spin w-5 h-5" /> : (
              <>
                Entrar
                <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
              </>
            )}
          </button>
        </form>
        
        <div className="mt-8 pt-6 border-t dark:border-gray-700 text-center space-y-2">
          <p className="text-xs text-gray-400">Autenticação Segura via Supabase</p>
          <p className="text-[10px] text-gray-300 bg-gray-100 dark:bg-gray-700 inline-block px-2 py-1 rounded-full">v2.1 (Production)</p>
        </div>
      </div>
    </div>
  );
};

export default Login;