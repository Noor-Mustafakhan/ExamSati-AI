import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

// Mock localStorage for Node test runner
const store = new Map();
if (typeof globalThis.localStorage === 'undefined') {
  globalThis.localStorage = {
    getItem: (k) => store.get(k) || null,
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
    clear: () => store.clear(),
  };
}

import { supabase, isSupabaseConfigured } from '../src/lib/supabase.js';
import { questionIngestionService } from '../src/services/questionIngestionService.js';

describe('Phase 3 & 4: Bulk CSV Import & Administrative Draft Ingestion Test Suite', () => {

  // Test 1: Rejection of non-CSV files (PDFs, JSON, etc.)
  it('1. Rejects PDFs, JSON reports, and unrelated non-CSV files from CSV import', async () => {
    const mixedFiles = [
      { name: 'Lecture_1_Slides.pdf', text: '%PDF-1.4 binary data...' },
      { name: 'batch_manifest.json', text: '{"files": []}' },
      { name: 'notes.docx', text: 'word data' },
      {
        name: 'valid_os_questions.csv',
        text: `question_text,option_a,option_b,option_c,option_d,correct_option,difficulty,subject,explanation
"In virtual memory, what causes thrashing?","Excessive paging","CPU overheating","I/O bus saturation","TLB corruption",0,Moderate,"Computer Science","Thrashing occurs when the OS spends more time paging than executing."`
      }
    ];

    const result = await questionIngestionService.parseAndValidateCsvFiles(mixedFiles);

    assert.equal(result.summary.totalFiles, 4);
    assert.equal(result.summary.validFilesCount, 1);
    assert.equal(result.summary.rejectedFilesCount, 3);

    // Verify non-CSV files are marked as rejected_file
    const pdfFile = result.files.find(f => f.fileName === 'Lecture_1_Slides.pdf');
    assert.ok(pdfFile, 'PDF file must be present in report');
    assert.equal(pdfFile.status, 'rejected_file');
    assert.match(pdfFile.reason, /Non-CSV file format/i);

    const jsonFile = result.files.find(f => f.fileName === 'batch_manifest.json');
    assert.equal(jsonFile.status, 'rejected_file');

    // Verify CSV file was accepted
    const csvFile = result.files.find(f => f.fileName === 'valid_os_questions.csv');
    assert.equal(csvFile.status, 'valid');
    assert.equal(csvFile.validRows.length, 1);
  });

  // Test 2: Multi-CSV aggregation and breakdown by Exam, Subject, Topic, Difficulty
  it('2. Aggregates counts and breakdowns across multiple valid CSV files', async () => {
    const csvFile1 = {
      name: 'computer_science_lecturer_operating_systems.csv',
      text: `question_text,option_a,option_b,option_c,option_d,correct_option,difficulty,subject,exam,topic,explanation
"Which Coffman condition requires non-shareable resources?","Mutual Exclusion","Hold and Wait","No Preemption","Circular Wait",0,Moderate,"Computer Science","fpsc-lecturer-cs-2026","Operating Systems","Mutual exclusion requires resources to be non-shareable."
"What data structure stores page translations in the CPU cache?","Translation Lookaside Buffer (TLB)","Inverted Page Table","Segment Map Table","Interrupt Vector Table",0,Easy,"Computer Science","fpsc-lecturer-cs-2026","Operating Systems","TLB caches virtual-to-physical address translations."`
    };

    const csvFile2 = {
      name: 'computer_science_lecturer_algorithms.csv',
      text: `question_text,option_a,option_b,option_c,option_d,correct_option,difficulty,subject,exam,topic,explanation
"What is the worst-case time complexity of QuickSort?","O(n log n)","O(n)","O(n^2)","O(log n)",2,Advanced,"Computer Science","fpsc-lecturer-cs-2026","Data Structures & Algorithms","Worst case O(n^2) happens with poor pivot selection."`
    };

    const result = await questionIngestionService.parseAndValidateCsvFiles([csvFile1, csvFile2]);

    assert.equal(result.summary.totalFiles, 2);
    assert.equal(result.summary.validFilesCount, 2);
    assert.equal(result.summary.totalRows, 3);
    assert.equal(result.summary.totalValid, 3);
    assert.equal(result.summary.totalDuplicates, 0);

    // Breakdown checks
    assert.equal(result.summary.breakdown.bySubject['Computer Science'], 3);
    assert.equal(result.summary.breakdown.byDifficulty['Moderate'], 1);
    assert.equal(result.summary.breakdown.byDifficulty['Easy'], 1);
    assert.equal(result.summary.breakdown.byDifficulty['Advanced'], 1);
    assert.equal(result.summary.breakdown.byTopic['Operating Systems'], 2);
    assert.equal(result.summary.breakdown.byTopic['Data Structures & Algorithms'], 1);
  });

  // Test 3: Cross-file duplicate detection
  it('3. Detects duplicate questions occurring in two different CSV files', async () => {
    const duplicateText = "Which Coffman condition requires non-shareable resources?";

    const fileA = {
      name: 'batch_file_a.csv',
      text: `question_text,option_a,option_b,option_c,option_d,correct_option,difficulty,subject,explanation
"${duplicateText}","Mutual Exclusion","Hold and Wait","No Preemption","Circular Wait",0,Moderate,"Computer Science","Mutual exclusion explanation."`
    };

    const fileB = {
      name: 'batch_file_b.csv',
      text: `question_text,option_a,option_b,option_c,option_d,correct_option,difficulty,subject,explanation
"${duplicateText}","Mutual Exclusion","Hold and Wait","No Preemption","Circular Wait",0,Moderate,"Computer Science","Same question in another file."`
    };

    const result = await questionIngestionService.parseAndValidateCsvFiles([fileA, fileB]);

    assert.equal(result.summary.totalRows, 2);
    assert.equal(result.summary.totalValid, 1, "Only first occurrence should be valid");
    assert.equal(result.summary.totalDuplicates, 1, "Second occurrence must be flagged as duplicate");

    const fileARes = result.files.find(f => f.fileName === 'batch_file_a.csv');
    assert.equal(fileARes.validRows.length, 1);

    const fileBRes = result.files.find(f => f.fileName === 'batch_file_b.csv');
    assert.equal(fileBRes.duplicateCount, 1);
  });

  // Test 4: Mixed batch resilience - valid CSV succeeds while malformed CSV is reported
  it('4. Processes valid CSV files even if an accompanying CSV is malformed', async () => {
    const malformedCsv = {
      name: 'corrupted_schema.csv',
      text: `question_text,option_a,option_b\n"Incomplete question?","Only A","Only B"`
    };

    const validCsv = {
      name: 'sound_pedagogy.csv',
      text: `question_text,option_a,option_b,option_c,option_d,correct_option,difficulty,subject,explanation
"Bloom's Revised Taxonomy orders cognitive skills in which sequence?","Remembering, Understanding, Applying, Analyzing, Evaluating, Creating","Creating, Evaluating, Analyzing, Applying, Understanding, Remembering","Knowledge, Comprehension, Application, Analysis, Synthesis, Evaluation","Understanding, Remembering, Applying, Evaluating, Analyzing, Creating",0,Moderate,"Computer Science","Anderson & Krathwohl 2001 revised taxonomy sequence."`
    };

    const result = await questionIngestionService.parseAndValidateCsvFiles([malformedCsv, validCsv]);

    assert.equal(result.summary.totalFiles, 2);
    assert.equal(result.summary.validFilesCount, 1);
    assert.equal(result.summary.totalValid, 1);
    assert.equal(result.summary.totalRejected, 1);

    const malformedRes = result.files.find(f => f.fileName === 'corrupted_schema.csv');
    assert.ok(malformedRes.errors.length > 0);

    const validRes = result.files.find(f => f.fileName === 'sound_pedagogy.csv');
    assert.equal(validRes.validRows.length, 1);
  });

  // Test 5: End-to-end import of unpublished drafts with idempotency and RLS verification
  it('5. Imports valid candidate questions as unpublished drafts, verifies idempotency and RLS protection', async () => {
    if (!isSupabaseConfigured) return;

    const { data: subData } = await supabase.from('subjects').select('id').eq('slug', 'computer-science').single();
    assert.ok(subData?.id, 'Computer science subject must exist in Supabase');

    const uniqueTimestamp = Date.now();
    const candidateQ = {
      question_text: `Automated Bulk Import E2E Test Question ${uniqueTimestamp}: What prevents priority inversion in real-time kernels under benchmark ${uniqueTimestamp}?`,
      option_a: 'Priority Inheritance Protocol',
      option_b: 'Round Robin Slicing',
      option_c: 'First-Come First-Served',
      option_d: 'Deadlock Avoidance Banking',
      correct_option: 0,
      difficulty: 'Advanced',
      subject: 'Computer Science',
      subject_id: subData.id,
      explanation: 'Priority Inheritance Protocol elevates the priority of a lower-priority task holding a shared resource.',
      source_title: 'RealTime_OS_Notes.pdf',
      source_page: 'Page 42',
      is_published: false,
      verification_status: 'practice_exercise'
    };

    // 1. First Import
    const importRes1 = await questionIngestionService.importBulkDrafts([candidateQ]);
    assert.equal(importRes1.success, true);
    assert.equal(importRes1.insertedCount, 1);
    assert.equal(importRes1.insertedIds.length, 1);

    const insertedId = importRes1.insertedIds[0];

    try {
      // 2. Verify RLS blocks public selection of unpublished draft
      const { data: publicData } = await supabase
        .from('questions')
        .select('id, is_published')
        .eq('id', insertedId);
      assert.equal(publicData.length, 0, 'Direct public query MUST NOT expose unpublished draft questions (RLS enforced)');

      // 3. Verify administrative getPendingQuestions RPC sees the draft
      const pendingQuestions = await questionIngestionService.getPendingQuestions(50, 0);
      const draftMatch = pendingQuestions.find(q => q.id === insertedId);
      assert.ok(draftMatch, 'Admin pending review queue must display the newly imported draft');
      assert.equal(draftMatch.is_published, false, 'Draft question must remain is_published = false');
      assert.equal(draftMatch.question_text, `What prevents priority inversion in real-time kernels under benchmark ${uniqueTimestamp}?`, 'Prefix must be stripped from imported draft question_text');

      // 4. Test Idempotency: re-importing the exact same question must NOT create duplicates
      const importRes2 = await questionIngestionService.importBulkDrafts([candidateQ]);
      assert.equal(importRes2.insertedCount, 0, 'Re-importing identical question must insert 0 rows');
      assert.equal(importRes2.duplicateCount, 1, 'Re-importing identical question must increment duplicate count');
    } finally {
      // Clean up test question
      await supabase.from('questions').delete().eq('id', insertedId);
    }
  });

});
