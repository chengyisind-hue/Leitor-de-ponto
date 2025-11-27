import { supabase } from './supabaseClient';
import { TimeRow } from '../types';

/**
 * Saves the timecard image and any user corrections to Supabase.
 * This builds your Fine-Tuning Dataset.
 */
export const saveTrainingData = async (file: File, rows: TimeRow[]) => {
  try {
    console.log("Iniciando upload para Supabase...");

    const fileExt = file.name.split('.').pop();
    const fileName = `${Date.now()}_${Math.random().toString(36).substr(2, 9)}.${fileExt}`;
    let filePath = `raw/${fileName}`;

    // 1. Try Upload Image to Supabase Storage (Non-blocking)
    try {
      const { error: uploadError } = await supabase.storage
        .from('raw-timecards')
        .upload(filePath, file);

      if (uploadError) {
        console.warn("Aviso: Falha no upload da imagem (verifique se o bucket 'raw-timecards' existe).", uploadError);
        // We continue anyway to save the text data
        filePath = 'upload_failed_' + fileName;
      }
    } catch (storageErr) {
       console.warn("Erro de rede/storage ignorado para salvar dados de texto:", storageErr);
       filePath = 'upload_failed_' + fileName;
    }

    // 2. Create Timecard Record in DB
    // FIX: Generate ID client-side to avoid needing SELECT permissions on the DB
    const timecardId = crypto.randomUUID(); 

    const { error: dbError } = await supabase
      .from('timecards')
      .insert([
        { 
          id: timecardId, // Manual ID
          image_path: filePath,
          company_name: 'Minha Empresa' 
        }
      ]);

    if (dbError) {
      console.error("Erro ao criar registro Timecard no banco:", JSON.stringify(dbError, null, 2));
      throw dbError;
    }

    console.log("Cartão criado com ID:", timecardId);

    // 3. Identify Corrections (Diff) and Save Training Examples
    const trainingExamples: any[] = [];

    rows.forEach(row => {
      // Check each field for changes
      const fields: (keyof TimeRow)[] = ['entry1', 'exit1', 'entry2', 'exit2', 'entry3', 'exit3'];
      
      fields.forEach(field => {
        // Map current field to its "original" counterpart key
        const originalKey = `original${field.charAt(0).toUpperCase() + field.slice(1)}` as keyof TimeRow;
        
        const currentValue = row[field];
        const originalValue = row[originalKey];

        // If data exists and looks different (ignoring simple whitespace differences)
        if (originalValue !== undefined && currentValue !== originalValue) {
           trainingExamples.push({
             timecard_id: timecardId,
             field_name: `${row.day}_${field}`,
             original_ocr: originalValue,
             corrected_value: currentValue,
             is_correction: true
           });
        }
      });
    });

    // 4. Batch Insert Training Examples
    if (trainingExamples.length > 0) {
      const { error: trainingError } = await supabase
        .from('training_examples')
        .insert(trainingExamples);
      
      if (trainingError) {
        console.error("Erro ao salvar exemplos de treino:", JSON.stringify(trainingError, null, 2));
        throw trainingError;
      }
      console.log(`Sucesso! ${trainingExamples.length} correções enviadas para o banco.`);
    } else {
      console.log("Nenhuma correção detectada, apenas o registro do cartão foi salvo.");
    }

    return { success: true, savedCount: trainingExamples.length };

  } catch (error) {
    console.error("Erro fatal no saveTrainingData:", JSON.stringify(error, null, 2));
    throw error;
  }
};