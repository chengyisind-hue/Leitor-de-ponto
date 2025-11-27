import { createClient } from '@supabase/supabase-js';

// ------------------------------------------------------------------
// CONFIGURAÇÃO DO SUPABASE
// ------------------------------------------------------------------

// Safe access to process.env for browser environments
const getEnv = (key: string) => {
  try {
    if (typeof process !== 'undefined' && process.env) {
      return process.env[key];
    }
  } catch (e) {
    // Ignore error if process is not defined
  }
  return undefined;
};

const SUPABASE_URL = getEnv('REACT_APP_SUPABASE_URL') || 'https://rwmweqfttiphppqiadgx.supabase.co';
const SUPABASE_ANON_KEY = getEnv('REACT_APP_SUPABASE_ANON_KEY') || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJ3bXdlcWZ0dGlwaHBwcWlhZGd4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQxNTcyODksImV4cCI6MjA3OTczMzI4OX0.w3UxtiuUPA8dQOcODffubxWrcrv27oWP46MgV9bXKOI';

if (!SUPABASE_URL || !SUPABASE_URL.startsWith('http')) {
  console.warn('WARNING: Invalid Supabase URL provided. Database features may not work.');
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);