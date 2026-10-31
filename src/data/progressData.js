export const mockProgressData = {
  student: {
    name: 'Asadullah Khan',
    targetExam: 'CSS 2026 / FPSC Inspector Customs',
    commissionTarget: 'FPSC & PPSC',
    avatarInitials: 'AK',
    overallReadiness: 76, // percentage
    streakDays: 14,
    questionsPracticed: 1420,
    averageScore: 74.8,
    mockTestsCompleted: 18,
    weeklyGoalHours: 20,
    weeklyHoursCompleted: 16.5,
    lastActive: 'Today, 2:40 PM'
  },
  subjectPerformance: [
    { subject: 'Pakistan Affairs', score: 86, totalAttempted: 420, accuracy: '86%', status: 'Strong', color: 'bg-emerald-500' },
    { subject: 'Islamic Studies', score: 82, totalAttempted: 260, accuracy: '82%', status: 'Strong', color: 'bg-emerald-500' },
    { subject: 'English & Grammar', score: 75, totalAttempted: 310, accuracy: '75%', status: 'Proficient', color: 'bg-indigo-500' },
    { subject: 'Current Affairs', score: 71, totalAttempted: 180, accuracy: '71%', status: 'Proficient', color: 'bg-indigo-500' },
    { subject: 'Everyday Science', score: 62, totalAttempted: 150, accuracy: '62%', status: 'Needs Review', color: 'bg-amber-500' },
    { subject: 'Basic Mathematics', score: 54, totalAttempted: 100, accuracy: '54%', status: 'Critical', color: 'bg-rose-500' }
  ],
  weakTopics: [
    {
      topic: 'Arithmetic: Speed, Time & Work Formulas',
      subject: 'Basic Mathematics',
      accuracy: '44%',
      urgency: 'High',
      recommendation: 'Practice 15 time-distance and ratio MCQs.'
    },
    {
      topic: 'Everyday Science: Human Diseases & Nutrients',
      subject: 'Everyday Science',
      accuracy: '58%',
      urgency: 'Medium',
      recommendation: 'Review vitamin deficiencies and blood groups sheet.'
    },
    {
      topic: '1973 Constitution: Articles 50-75 (Parliament)',
      subject: 'Pakistan Affairs',
      accuracy: '65%',
      urgency: 'Medium',
      recommendation: 'Revise Senate vs National Assembly legislative powers.'
    }
  ],
  recentTestAttempts: [
    {
      id: 'att-101',
      testTitle: 'FPSC Inspector Customs / IO Full Simulation #1',
      date: 'Oct 10, 2026',
      score: 8.5,
      totalMarks: 10,
      accuracy: '85%',
      timeSpent: '7m 45s',
      status: 'Passed (Merit Level)'
    },
    {
      id: 'att-102',
      testTitle: 'Daily 5-Minute High-Yield Flash Mock',
      date: 'Oct 09, 2026',
      score: 4.0,
      totalMarks: 5,
      accuracy: '80%',
      timeSpent: '3m 12s',
      status: 'Passed'
    },
    {
      id: 'att-103',
      testTitle: 'PPSC Tehsildar Paper-II General Ability Mock',
      date: 'Oct 07, 2026',
      score: 5.25,
      totalMarks: 8,
      accuracy: '65%',
      timeSpent: '7m 10s',
      status: 'Needs Improvement'
    },
    {
      id: 'att-104',
      testTitle: 'Assistant Director FIA (BS-17) Screening Drill',
      date: 'Oct 04, 2026',
      score: 4.5,
      totalMarks: 7,
      accuracy: '64%',
      timeSpent: '6m 50s',
      status: 'Needs Improvement'
    }
  ],
  studyActivityDays: [
    { day: 'Mon', questions: 45, hours: 2.5 },
    { day: 'Tue', questions: 60, hours: 3.0 },
    { day: 'Wed', questions: 35, hours: 1.8 },
    { day: 'Thu', questions: 80, hours: 4.0 },
    { day: 'Fri', questions: 55, hours: 2.8 },
    { day: 'Sat', questions: 95, hours: 4.5 },
    { day: 'Sun', questions: 70, hours: 3.2 }
  ],
  accuracyTrendWeeks: [
    { week: 'W1', accuracy: 58 },
    { week: 'W2', accuracy: 64 },
    { week: 'W3', accuracy: 69 },
    { week: 'W4', accuracy: 72 },
    { week: 'W5', accuracy: 78 }
  ]
};
