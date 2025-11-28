import { createClient } from '@supabase/supabase-js';
import { Holiday } from '../types';

// ------------------------------------------------------------------
// CONFIGURAÇÃO DO SUPABASE
// ------------------------------------------------------------------

let supabaseUrl = '';
let supabaseAnonKey = '';

// 1. Tentar ler via process.env (Node/Webpack/Vercel Serverless)
try {
  if (typeof process !== 'undefined' && process.env) {
    supabaseUrl = process.env.VITE_SUPABASE_URL || '';
    supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY || '';
  }
} catch (e) {
  // Ignora erro de acesso ao process
}

// 2. Tentar ler via import.meta.env (Vite Client)
// Usamos try-catch para evitar crash se import.meta.env for undefined
if (!supabaseUrl || !supabaseAnonKey) {
  try {
    // @ts-ignore
    if (typeof import.meta !== 'undefined' && import.meta.env) {
      // @ts-ignore
      supabaseUrl = supabaseUrl || import.meta.env.VITE_SUPABASE_URL || '';
      // @ts-ignore
      supabaseAnonKey = supabaseAnonKey || import.meta.env.VITE_SUPABASE_ANON_KEY || '';
    }
  } catch (e) {
    console.warn('Erro ao acessar import.meta.env', e);
  }
}

// Verificação de status para a UI
export const isSupabaseConfigured = !!(supabaseUrl && supabaseAnonKey && supabaseUrl.startsWith('http'));

if (!isSupabaseConfigured) {
  console.warn('Supabase não configurado. Verifique as variáveis VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY.');
}

// Inicializa o cliente. Se as chaves faltarem, cria um cliente "dummy" 
// para não quebrar a renderização inicial da página.
export const supabase = createClient(
  isSupabaseConfigured ? supabaseUrl : 'https://placeholder.supabase.co', 
  isSupabaseConfigured ? supabaseAnonKey : 'placeholder'
);

// ------------------------------------------------------------------
// AUTH METHODS
// ------------------------------------------------------------------

export const signIn = async (email: string, password: string) => {
  if (!isSupabaseConfigured) {
    return { 
      data: null, 
      error: { message: 'Erro de Configuração: As variáveis de ambiente do Supabase não foram detectadas.' } 
    };
  }

  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });
  return { data, error };
};

export const signOut = async () => {
  if (!isSupabaseConfigured) return { error: null };
  const { error } = await supabase.auth.signOut();
  return { error };
};

// ------------------------------------------------------------------
// HOLIDAY METHODS
// ------------------------------------------------------------------

export const fetchHolidays = async (): Promise<Holiday[]> => {
  if (!isSupabaseConfigured) return [];
  try {
    const { data, error } = await supabase
      .from('custom_holidays')
      .select('*');
    
    if (error) {
      console.warn("Fetch holidays failed", error.message);
      return [];
    }
    return data || [];
  } catch (e) {
    return [];
  }
};

export const saveHoliday = async (holiday: Omit<Holiday, 'id'>) => {
  if (!isSupabaseConfigured) return { ...holiday, id: `local-${Date.now()}` };
  try {
    const { data, error } = await supabase
      .from('custom_holidays')
      .insert([holiday])
      .select();

    if (error) throw error;
    return data?.[0];
  } catch (e: any) {
    console.warn(`Supabase saveHoliday failed: ${e.message}`);
    return { ...holiday, id: `local-${Date.now()}` };
  }
};

export const deleteHoliday = async (id: string) => {
  if (!isSupabaseConfigured) return true;
  try {
    const { error } = await supabase
      .from('custom_holidays')
      .delete()
      .match({ id });
    
    if (error) throw error;
    return true;
  } catch (e) {
    return false;
  }
};