
import { createClient } from '@supabase/supabase-js';
import { Holiday } from '../types';

// ------------------------------------------------------------------
// CONFIGURAÇÃO DO SUPABASE
// ------------------------------------------------------------------

/**
 * Helper para buscar variáveis de ambiente em diferentes frameworks (Vite, Next, CRA).
 * No Vercel, variáveis de frontend precisam de prefixos como VITE_ ou NEXT_PUBLIC_.
 */
const getEnvVar = (key: string): string | undefined => {
  // 1. Tenta Vite (import.meta.env)
  try {
    // @ts-ignore
    if (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env[`VITE_${key}`]) {
      // @ts-ignore
      return import.meta.env[`VITE_${key}`];
    }
  } catch (e) {}

  // 2. Tenta Process.env (CRA, Next.js, Node)
  try {
    if (typeof process !== 'undefined' && process.env) {
      // Tenta prefixos comuns
      return process.env[`REACT_APP_${key}`] || 
             process.env[`NEXT_PUBLIC_${key}`] || 
             process.env[`VITE_${key}`] || 
             process.env[key];
    }
  } catch (e) {}

  return undefined;
};

// Tenta pegar das variáveis de ambiente configuradas no Vercel
const envUrl = getEnvVar('SUPABASE_URL');
const envKey = getEnvVar('SUPABASE_ANON_KEY');

// FALLBACK: Se não houver variáveis configuradas, usa as chaves hardcoded (DEV/TESTE)
// IMPORTANTE: Em produção real, remova esses fallbacks e configure as variáveis no painel da Vercel.
const SUPABASE_URL = envUrl || 'https://rwmweqfttiphppqiadgx.supabase.co';
const SUPABASE_ANON_KEY = envKey || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJ3bXdlcWZ0dGlwaHBwcWlhZGd4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQxNTcyODksImV4cCI6MjA3OTczMzI4OX0.w3UxtiuUPA8dQOcODffubxWrcrv27oWP46MgV9bXKOI';

if (!SUPABASE_URL || !SUPABASE_URL.startsWith('http')) {
  console.warn('WARNING: Invalid Supabase URL provided. Database features may not work.');
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ------------------------------------------------------------------
// HOLIDAY METHODS
// ------------------------------------------------------------------

export const fetchHolidays = async (): Promise<Holiday[]> => {
  try {
    const { data, error } = await supabase
      .from('custom_holidays')
      .select('*');
    
    if (error) {
      // Silent fail for local usage without DB setup
      console.warn("Fetch holidays failed (using local fallback)", error.message);
      return [];
    }
    return data || [];
  } catch (e) {
    return [];
  }
};

export const saveHoliday = async (holiday: Omit<Holiday, 'id'>) => {
  try {
    const { data, error } = await supabase
      .from('custom_holidays')
      .insert([holiday])
      .select();

    if (error) throw error;
    return data?.[0];
  } catch (e: any) {
    const msg = e.message || (typeof e === 'object' ? JSON.stringify(e) : String(e));
    console.warn(`Supabase saveHoliday failed (using local fallback): ${msg}`);
    // Return a fake object so UI can continue optimistically
    return { ...holiday, id: `local-${Date.now()}` };
  }
};

export const deleteHoliday = async (id: string) => {
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
