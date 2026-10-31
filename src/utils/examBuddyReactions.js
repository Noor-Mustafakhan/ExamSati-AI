/**
 * ExamBuddy Deterministic Reaction Engine
 * Provides friendly, witty, and supportive feedback without calling AI on every action.
 * Strict rules:
 * - Deterministic logic based on scores, streaks, and events.
 * - Modes: Normal (Academic), Funny (Culturally witty), Gentle Roast (Constructive humor).
 * - No emojis as UI icons; visual states expressed via Lucide icons and typography.
 * - Reusable message pools to avoid repetitive sentences.
 */

export const MASCOT_MODES = [
  { id: 'funny', label: 'Funny Mode (Recommended)' },
  { id: 'normal', label: 'Normal (Academic)' },
  { id: 'gentle_roast', label: 'Gentle Roast' },
];

const SCORE_REACTION_POOLS = {
  under40: {
    normal: [
      'Steady preparation requires patience. Review the detailed question explanations below to identify core conceptual gaps.',
      'Every mock test serves as a diagnostic. Focus on your penalized questions to prevent repeated errors.',
      'Do not be discouraged. Use this test as a baseline to isolate your weakest subject module.',
    ],
    funny: [
      'Oho! Aaj FPSC ne warm-up bhi nahi karne diya. Chalo, mistake notebook kholte hain aur revision karte hain.',
      'FPSC examiner thora sakht mood mein tha aaj! No worries, abhi practice phase hai, asli exam mein recovery hogi.',
      'Chalo koi baat nahi, warm-up match tha. Important ye hai ke ghalti kahan hui, wo review karein!',
    ],
    gentle_roast: [
      'Chai thandi ho gayi aur marks bhi! Koi baat nahi, asli FPSC hall se pehle yahan girna behtar hai.',
      'Inspector banna hai ya Inspector General of Mistakes? Chalo shabash, abhi revision shuru karein!',
      'FPSC negative marking ne bura haal kiya aaj. Negative marking se dosti khatam karein!',
    ],
    tone: 'supportive',
    badge: 'Diagnostic Review Required',
  },
  between40and59: {
    normal: [
      'You have cleared the minimum baseline, but federal merit lists demand consolidation in high-yield sections.',
      'Consistent progress. A 10% reduction in unforced errors will elevate your score into the competitive bracket.',
      'Fair attempt. Strengthen basic arithmetic and constitutional articles to comfortably surpass 60%.',
    ],
    funny: [
      'Boundary line pe ball ruk gayi! Thora sa push aur chahiye merit list mein aane ke liye.',
      'FPSC passing marks to touch ho gaye, par federal merit list upar banti hai. Thora aur zor lagayein!',
      'Ghar walo ko batane layaq score hai, par interview call ke liye 10 marks aur chahiye. Quick revision karein!',
    ],
    gentle_roast: [
      'Passing marks to mil gaye, par FPSC ki final merit list itne par nahi milti. Revision time!',
      'Safe zone mein nahi hain abhi. Thori si hawa chali aur score neeche gir jayega!',
      'Neither fail nor topper. The classic Pakistani middle-order batting performance!',
    ],
    tone: 'encouraging',
    badge: 'Baseline Cleared',
  },
  between60and79: {
    normal: [
      'Solid performance comfortably above qualifying benchmark. Refine topic precision to breach 80%.',
      'Strong subject retention shown. Your negative marking discipline was commendable in this attempt.',
      'Competitive standard reached. Review remaining unattempted items to maximize speed.',
    ],
    funny: [
      'General Ability solid chal rahi hai! Thori vocabulary aur polish kar lein toh seedha top tier.',
      'Zabardast! FPSC hall mein agar yehi confidence raha toh test zaroor clear hoga.',
      'Ab lag raha hai candidate serious hai! Mistakes review karein aur score ko 80+ le jayein.',
    ],
    gentle_roast: [
      'Theek thaak score hai! Par "almost top" se appointment letter nahi milta. Weak areas pe kaam karein!',
      '60s mein score achha hai, par overconfidence mein agla mock test mat kharab kar dena!',
      'Solid hai, par abhi bhi 20 marks FPSC ne kaat liye. Un 20 marks ka hisaab lein!',
    ],
    tone: 'positive',
    badge: 'Competitive Tier',
  },
  between80and99: {
    normal: [
      'Outstanding result! Your conceptual grasp and accuracy are well within federal appointment merit standard.',
      'Exceptional performance. High accuracy combined with strict negative marking control.',
      'Superior command demonstrated across all tested subject categories. Keep this momentum consistent.',
    ],
    funny: [
      'Exam mode activated! Ab mistakes review karna mat bhoolna, full marks ab door nahi.',
      'MashaAllah! Lagta hai direct FPSC Chairman se rabta ho gaya hai. Kamaal ka score!',
      'Bureaucracy loading... Outstanding accuracy! Is consistency ko regular tests mein maintain karein.',
    ],
    gentle_roast: [
      'Waah! FPSC walay bhi hairan honge. Par overconfidence mein agla test kharab mat kar dena!',
      'Itna achha score? Kahin pehle se paper toh nahi leak tha? Mazaaq ke ilawa, brilliant work!',
      'Zabardast! Ab bas isi score ko FPSC ke real examination hall tak sambhal kar le jana hai.',
    ],
    tone: 'celebratory',
    badge: 'Merit List Ready',
  },
  score100: {
    normal: [
      'Flawless achievement! 100% accuracy with zero penalty deductions. Exemplary syllabus mastery.',
      'Perfect score recorded. Rare standard of thoroughness across all test components.',
    ],
    funny: [
      '100% Top Merit! Quaid-e-Azam would be proud. Screen grab le lo aur frame karwa lo!',
      'Century! FPSC Hall of Fame unlocked. Federal Government ko abhi notification nikalni chahiye!',
    ],
    gentle_roast: [
      'Ab toh FPSC interview panel ko bhi aap interview de sakte hain. Unstoppable!',
      '100 out of 100! Lagta hai paper banane walay se zyada concepts clear hain aapke.',
    ],
    tone: 'perfection',
    badge: 'Flawless 100% Record',
  },
};

const SPECIAL_EVENT_POOLS = {
  threeConsecutiveWrong: {
    normal: 'Three consecutive errors detected. Pause, review the question carefully, and eliminate extreme options.',
    funny: 'Lagta hai is topic se thori dushmani hai! Deep breath lein aur question dobara ghaur se parhein.',
    gentle_roast: 'Hat-trick of errors! FPSC examiner muskura raha hoga. Thora focus wapis layein!',
  },
  fiveConsecutiveCorrect: {
    normal: 'Five consecutive correct responses! Excellent conceptual retention and test momentum.',
    funny: '5 in a row! Bullet train ki tarah speed hai aaj. Shabaash!',
    gentle_roast: '5 correct streak! Lagta hai formula samajh aa gaya. Overconfident mat hona!',
  },
  improvedOverPrevious: {
    normal: 'Positive performance trend. Your net score improved compared to the previous recorded session.',
    funny: 'Nice comeback! Previous test se score improve hua hai. Mehnat rang la rahi hai.',
    gentle_roast: 'Kamal hai, pichlay test se behtar score! Lagta hai akal thori thori aana shuru ho gayi hai.',
  },
  firstTestCompleted: {
    normal: 'First mock test completed! Your baseline has been recorded in student progress tracking.',
    funny: 'First simulation done! Ab se routine banayein aur daily ek drill zaroor attempt karein.',
    gentle_roast: 'Pehla test mubarak! Safari shuru ho chuki hai, ab beech mein chorr kar mat bhaagna!',
  },
  repeatedTopicMistakes: {
    normal: 'Multiple recurring errors identified in this specific topic. Targeted conceptual review recommended in the Mistake Notebook.',
    funny: 'Lagta hai is topic ne FPSC examiner se secret agreement ki hui hai! Mistake Notebook khol kar isko master karein.',
    gentle_roast: 'Topic change karein ya dimagh? Is specific topic mein baar baar ghalti ho rahi hai, revision required!',
  },
};

/**
 * Get deterministic score-based reaction for a test result
 */
export function getScoreReaction(scorePercentage, mode = 'funny') {
  const safeMode = ['normal', 'funny', 'gentle_roast'].includes(mode) ? mode : 'funny';
  const pct = Math.max(0, Math.min(100, Math.round(scorePercentage)));

  let categoryKey = 'under40';
  if (pct === 100) categoryKey = 'score100';
  else if (pct >= 80) categoryKey = 'between80and99';
  else if (pct >= 60) categoryKey = 'between60and79';
  else if (pct >= 40) categoryKey = 'between40and59';

  const category = SCORE_REACTION_POOLS[categoryKey];
  const messages = category[safeMode] || category.funny;

  // Deterministically choose message based on percentage to avoid constant repetition while being deterministic
  const messageIndex = Math.abs(pct) % messages.length;
  const message = messages[messageIndex];

  return {
    message,
    badge: category.badge,
    tone: category.tone,
    percentage: pct,
  };
}

/**
 * Get reaction for special test events
 */
export function getSpecialEventReaction(eventType, mode = 'funny') {
  const safeMode = ['normal', 'funny', 'gentle_roast'].includes(mode) ? mode : 'funny';
  const event = SPECIAL_EVENT_POOLS[eventType];
  if (!event) return null;
  return event[safeMode] || event.funny;
}
