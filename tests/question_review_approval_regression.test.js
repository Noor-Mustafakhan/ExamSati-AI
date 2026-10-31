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

describe('Admin Question Review: Approval, Rejection & Audit Regression Suite', () => {

  it('1. Verified database metrics return pending, published, and rejected counts accurately', async () => {
    if (!isSupabaseConfigured) return;

    const metrics = await questionIngestionService.getMetrics();
    assert.ok(typeof metrics.pending_count === 'number', 'pending_count must be a number');
    assert.ok(typeof metrics.published_count === 'number', 'published_count must be a number');
    assert.ok(typeof metrics.rejected_count === 'number', 'rejected_count must be a number');
    assert.ok(typeof metrics.total_questions === 'number', 'total_questions must be a number');

    assert.ok(metrics.pending_count >= 0, 'pending_count must be non-negative');
    assert.ok(metrics.published_count >= 0, 'published_count must be non-negative');
    assert.ok(metrics.rejected_count >= 0, 'rejected_count must be non-negative');
    assert.ok(
      metrics.total_questions >= (metrics.pending_count + metrics.published_count + metrics.rejected_count),
      'total_questions must be greater than or equal to sum of pending, published, and rejected'
    );
  });

  it('2. Ingesting candidate draft sets review_status=pending and is_published=false, then tests Reject & Approve', async () => {
    if (!isSupabaseConfigured) return;

    const { data: sub } = await supabase.from('subjects').select('id, name').limit(1).single();
    assert.ok(sub?.id, 'A subject must exist in database');

    const uniqueTag = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    const candidate = {
      question_text: `Test Review Flow Candidate [${uniqueTag}]: What is the primary role of an operating system microkernel subsystem?`,
      options: [
        'Managing hardware resources and device abstraction',
        'Designing graphical web animations',
        'Writing cascading style sheets for web browsers',
        'Translating human speech into spreadsheet cells'
      ],
      correct_option: 0,
      difficulty: 'Easy',
      subject: sub.name,
      subject_id: sub.id,
      explanation: 'The kernel is the core component that manages system hardware resources directly.',
      source_title: 'Operating System Principles 10th Ed',
      source_page: 'Page 42',
      source_url: 'https://example.edu/os-principles',
      question_origin: 'ai_generated_practice',
      is_published: false
    };

    const ingestResult = await questionIngestionService.ingestQuestions([candidate]);
    assert.equal(ingestResult.success, true, 'Draft ingestion must succeed');
    assert.ok(ingestResult.insertedIds.length === 1, 'Candidate question must return a valid question ID');

    const questionId = ingestResult.insertedIds[0];

    try {
      // 1. Verify RLS protection: Direct client SELECT returns 0 rows because is_published = false
      const { data: directClientRead } = await supabase
        .from('questions')
        .select('id, is_published')
        .eq('id', questionId);

      assert.equal(directClientRead.length, 0, 'Direct client SELECT must be blocked by RLS for unpublished drafts');

      // 2. Verify draft exists and is accessible via administrative RPC get_pending_questions('pending')
      const pendingList = await questionIngestionService.getPendingQuestions(50, 0, 'pending');
      const foundPending = pendingList.find(q => q.id === questionId);
      assert.ok(foundPending, 'Question must appear in pending queue via administrative RPC');
      assert.equal(foundPending.question_text, 'What is the primary role of an operating system microkernel subsystem?', 'Prefix must be stripped from question_text in database');
      assert.equal(foundPending.review_status, 'pending', 'review_status must be pending');
      assert.equal(foundPending.is_published, false, 'is_published must be false');
      assert.equal(foundPending.source_title, 'Operating System Principles 10th Ed');
      assert.equal(foundPending.source_page, 'Page 42');
      assert.equal(foundPending.correct_option, 0, 'Correct option must be returned by secure answer_keys join');

      // 3. Verify absence in student practice queries (is_published = true)
      const { data: studentView } = await supabase
        .from('questions')
        .select('id')
        .eq('id', questionId)
        .eq('is_published', true);

      assert.equal(studentView.length, 0, 'Unpublished pending draft must not appear in student queries');

      // --- TEST REJECT WORKFLOW ---
      const rejectRes = await questionIngestionService.reviewQuestion(questionId, 'reject');
      assert.equal(rejectRes.success, true, 'Rejection operation must succeed');
      assert.equal(rejectRes.decision, 'reject');

      // Verify question is no longer in pending queue
      const pendingAfterReject = await questionIngestionService.getPendingQuestions(50, 0, 'pending');
      assert.ok(!pendingAfterReject.some(q => q.id === questionId), 'Rejected question must be removed from pending queue');

      // Verify question appears in rejected queue
      const rejectedList = await questionIngestionService.getPendingQuestions(50, 0, 'rejected');
      const foundRejected = rejectedList.find(q => q.id === questionId);
      assert.ok(foundRejected, 'Question must appear in rejected queue');
      assert.equal(foundRejected.review_status, 'rejected', 'review_status must be rejected');
      assert.equal(foundRejected.is_published, false, 'Rejected question must remain unpublished (is_published = false)');
      assert.equal(foundRejected.source_title, 'Operating System Principles 10th Ed', 'Metadata must be preserved');

      // Verify student query still returns 0 rows (RLS blocks access)
      const { data: studentAfterReject } = await supabase
        .from('questions')
        .select('id')
        .eq('id', questionId)
        .eq('is_published', true);
      assert.equal(studentAfterReject.length, 0, 'Rejected question must never appear to students');

      // --- TEST APPROVE WORKFLOW ---
      const approveRes = await questionIngestionService.reviewQuestion(questionId, 'approve');
      assert.equal(approveRes.success, true, 'Approval operation must succeed');
      assert.equal(approveRes.decision, 'approve');

      // Verify record state after approval
      const { data: approvedRow } = await supabase
        .from('questions')
        .select('id, question_text, review_status, is_published, reviewed_at, verification_status')
        .eq('id', questionId)
        .single();

      assert.equal(approvedRow.review_status, 'approved', 'review_status must be approved');
      assert.equal(approvedRow.is_published, true, 'Approved question must have is_published = true');
      assert.ok(approvedRow.reviewed_at, 'reviewed_at timestamp must be recorded');

      // Verify question is not in pending queue
      const pendingAfterApprove = await questionIngestionService.getPendingQuestions(50, 0, 'pending');
      assert.ok(!pendingAfterApprove.some(q => q.id === questionId), 'Approved question must be removed from pending queue');

      // Verify question appears in approved list
      const approvedList = await questionIngestionService.getPendingQuestions(50, 0, 'approved');
      assert.ok(approvedList.some(q => q.id === questionId), 'Approved question must appear in approved queue');

      // Verify student practice query CAN now retrieve it
      const { data: studentAfterApprove } = await supabase
        .from('questions')
        .select('id, question_text, options, explanation')
        .eq('id', questionId)
        .eq('is_published', true);
      assert.equal(studentAfterApprove.length, 1, 'Approved question must be accessible to students');
      assert.equal(studentAfterApprove[0].id, questionId);
    } finally {
      // Clean up test question via RPC to bypass RLS block
      await supabase.rpc('delete_test_question', { p_question_id: questionId });
    }
  });

  it('3. review_question RPC safely rejects invalid decisions and non-existent IDs', async () => {
    if (!isSupabaseConfigured) return;

    // Call reviewQuestion with invalid decision
    const invalidRes = await questionIngestionService.reviewQuestion('00000000-0000-0000-0000-000000000000', 'invalid_decision');
    assert.equal(invalidRes.success, false);
    assert.ok(invalidRes.error.includes('Decision must be either "approve" or "reject"'));

    // Call review_question with non-existent question UUID
    const nonExistentRes = await questionIngestionService.reviewQuestion('00000000-0000-0000-0000-000000000000', 'approve');
    assert.equal(nonExistentRes.success, false);
    assert.ok(nonExistentRes.error.toLowerCase().includes('not found'), `Error message should mention not found, got: ${nonExistentRes.error}`);
  });

  it('4. Status filtering in getPendingQuestions accurately isolates pending, approved, and rejected records', async () => {
    if (!isSupabaseConfigured) return;

    const [pending, approved, rejected] = await Promise.all([
      questionIngestionService.getPendingQuestions(10, 0, 'pending'),
      questionIngestionService.getPendingQuestions(10, 0, 'approved'),
      questionIngestionService.getPendingQuestions(10, 0, 'rejected')
    ]);

    for (const q of pending) {
      assert.equal(q.review_status, 'pending', `Item ${q.id} in pending query must have review_status = pending`);
      assert.equal(q.is_published, false, `Item ${q.id} in pending query must have is_published = false`);
    }

    for (const q of approved) {
      assert.equal(q.review_status, 'approved', `Item ${q.id} in approved query must have review_status = approved`);
      assert.equal(q.is_published, true, `Item ${q.id} in approved query must have is_published = true`);
    }

    for (const q of rejected) {
      assert.equal(q.review_status, 'rejected', `Item ${q.id} in rejected query must have review_status = rejected`);
      assert.equal(q.is_published, false, `Item ${q.id} in rejected query must have is_published = false`);
    }
  });

});
