import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Mock localStorage for Node environment
const store = new Map();
if (typeof globalThis.localStorage === 'undefined') {
  globalThis.localStorage = {
    getItem: (k) => store.get(k) || null,
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
    clear: () => store.clear(),
  };
}

import { questionIngestionService } from '../src/services/questionIngestionService.js';
import { isSupabaseConfigured } from '../src/lib/supabase.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');
const batchDir = path.join(projectRoot, 'generated_mcqs', 'batch_lecturer_notes');

async function runBulkImport() {
  console.log('===============================================================');
  console.log('ExamSathi AI - Bulk Import of Generated Draft CSVs into Supabase');
  console.log('Target Directory:', batchDir);
  console.log('Supabase Configured:', isSupabaseConfigured);
  console.log('===============================================================\n');

  if (!fs.existsSync(batchDir)) {
    console.error(`[Error] Batch directory not found: ${batchDir}`);
    process.exit(1);
  }

  // 1. Discover all .csv files in batchDir (excluding reports)
  const allFiles = fs.readdirSync(batchDir);
  const csvFiles = allFiles
    .filter(f => f.endsWith('.csv') && !f.includes('report') && !f.includes('manifest'))
    .sort();

  console.log(`Discovered ${csvFiles.length} candidate question CSV files:`);
  csvFiles.forEach(f => console.log(`  - ${f}`));
  console.log('');

  // 2. Read file contents and prepare file objects
  const fileObjects = csvFiles.map(filename => {
    const fullPath = path.join(batchDir, filename);
    const content = fs.readFileSync(fullPath, 'utf-8');
    return {
      name: filename,
      text: content
    };
  });

  // 3. Run parseAndValidateCsvFiles
  console.log('Validating files and checking schema / reference alignment...');
  const validationResult = await questionIngestionService.parseAndValidateCsvFiles(fileObjects);
  const summary = validationResult.summary;

  console.log('\n--- PRE-IMPORT VALIDATION SUMMARY ---');
  console.log(`Total Files Evaluated: ${summary.totalFiles}`);
  console.log(`Valid CSV Files:        ${summary.validFilesCount}`);
  console.log(`Total Rows Parsed:     ${summary.totalRows}`);
  console.log(`Valid Draft Questions: ${summary.totalValid}`);
  console.log(`Duplicates Detected:   ${summary.totalDuplicates}`);
  console.log(`Rejected / Malformed:  ${summary.totalRejected}`);

  console.log('\n--- SYLLABUS DISTRIBUTION ---');
  console.log('By Subject:', summary.breakdown.bySubject);
  console.log('By Topic:');
  for (const [top, count] of Object.entries(summary.breakdown.byTopic)) {
    console.log(`  - ${top}: ${count}`);
  }
  console.log('By Difficulty:', summary.breakdown.byDifficulty);
  console.log('------------------------------------\n');

  if (summary.totalValid === 0) {
    console.log('[Notice] No valid draft questions found to import.');
    return;
  }

  // 4. Ingest valid draft questions in batches
  const allValidQuestions = validationResult.files.flatMap(f => f.validRows || []);
  console.log(`Ingesting ${allValidQuestions.length} draft questions into Supabase (batches of 25)...`);

  const importResult = await questionIngestionService.importBulkDrafts(
    allValidQuestions,
    (progress) => {
      console.log(`  [Batch ${progress.currentBatch}/${progress.totalBatches}] Progress: ${progress.percentage}% (${progress.completed}/${progress.total})`);
    }
  );

  console.log('\n===============================================================');
  console.log('BULK IMPORT EXECUTION COMPLETED');
  console.log('Success:', importResult.success);
  console.log('Total Processed:    ', importResult.totalProcessed);
  console.log('Successfully Inserted:', importResult.insertedCount);
  console.log('Duplicates Skipped:  ', importResult.duplicateCount);
  console.log('Errors:              ', importResult.errors.length);
  if (importResult.errors.length > 0) {
    console.log('Error Details:', importResult.errors);
  }
  console.log('===============================================================\n');

  // 5. Verify pending review queue in Supabase
  console.log('Inspecting current pending review queue in Supabase...');
  const pending = await questionIngestionService.getPendingQuestions(20, 0);
  console.log(`Retrieved ${pending.length} pending draft question(s) awaiting admin review.`);
  if (pending.length > 0) {
    console.log('\nSample pending draft question:');
    const sample = pending[0];
    console.log('  ID:          ', sample.id);
    console.log('  Exam:        ', sample.exam_title);
    console.log('  Subject:     ', sample.subject_name);
    console.log('  Topic:       ', sample.topic_title);
    console.log('  Difficulty:  ', sample.difficulty);
    console.log('  Question:    ', sample.question_text);
    console.log('  Is Published:', sample.is_published, '(DRAFT - Not visible to students)');
    console.log('  Source Ref:  ', sample.source_title, sample.source_page ? `(${sample.source_page})` : '');
  }

  const metrics = await questionIngestionService.getMetrics();
  console.log('\nUpdated Question Bank Metrics:');
  console.log(metrics);
}

runBulkImport().catch(err => {
  console.error('[Fatal Error during import execution]:', err);
  process.exit(1);
});
