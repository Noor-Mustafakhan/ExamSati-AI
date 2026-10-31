import { loadServerEnv, getGroqApiKey } from '../server/env.js';
import { Groq } from 'groq-sdk';

loadServerEnv();

async function main() {
  const key = getGroqApiKey();
  if (!key) {
    console.error('No GROQ_API_KEY found');
    process.exit(1);
  }

  const groq = new Groq({ apiKey: key });
  try {
    const res = await groq.models.list();
    console.log('Available Groq models:');
    res.data.sort((a, b) => a.id.localeCompare(b.id)).forEach(m => console.log(' -', m.id));

    console.log('\nTesting models with JSON mode:');
    for (const m of res.data) {
      if (m.id.includes('whisper') || m.id.includes('guard')) continue;
      try {
        const testRes = await groq.chat.completions.create({
          model: m.id,
          messages: [
            { role: 'system', content: 'You are ExamSathi AI. Return valid JSON only: {"status": "ok"}' },
            { role: 'user', content: 'Ping test' }
          ],
          response_format: { type: 'json_object' }
        });
        console.log(` ✓ ${m.id}: SUCCESS ->`, testRes.choices[0]?.message?.content?.trim());
      } catch (err) {
        console.log(` ✗ ${m.id}: FAILED ->`, err.message);
      }
    }
  } catch (e) {
    console.error('Error listing models:', e.message);
  }
}

main();

