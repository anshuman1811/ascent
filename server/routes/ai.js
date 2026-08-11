const express = require('express');
const router = express.Router();

// Lazy-init so missing API key gives a clean error at request time, not at startup.
let anthropic = null;
function getClient() {
  if (!anthropic) {
    const { Anthropic } = require('@anthropic-ai/sdk');
    const key = process.env.ANTHROPIC_API_KEY;
    if (!key) throw new Error('ANTHROPIC_API_KEY not set');
    anthropic = new Anthropic({ apiKey: key });
  }
  return anthropic;
}

const SYSTEM_PROMPT = `You are a precise nutrition database assistant.
The user describes one or more foods or a complete meal in natural language.
Break it down into individual food components and estimate macros for a realistic single serving.

Rules:
- Use common US serving sizes (1 cup, 1 oz, 100g, 1 piece, etc.)
- Estimates should match USDA values where possible
- If a quantity is specified (e.g. "2 eggs"), use that as the quantity and a single egg as the serving
- For composite dishes (e.g. "stir fry"), break into main ingredients
- Keep the list to the most nutritionally significant items (max 8)
- Round all numbers to reasonable precision (protein/carbs/fat to 1 decimal, calories to whole numbers)

Return ONLY a valid JSON array, no explanation:
[
  {
    "name": "Chicken Breast (cooked)",
    "serving_size": 100,
    "serving_unit": "g",
    "quantity": 1.5,
    "calories": 165,
    "protein_g": 31.0,
    "carbs_g": 0.0,
    "fat_g": 3.6,
    "fiber_g": 0.0,
    "sugar_g": 0.0,
    "saturated_fat_g": 1.0,
    "sodium_mg": 74,
    "cholesterol_mg": 85,
    "potassium_mg": 256,
    "added_sugar_g": 0.0
  }
]`;

// POST /api/ai/parse-food
// Body: { text: string }
// Returns: { items: ParsedFoodItem[] }
router.post('/parse-food', async (req, res) => {
  const { text } = req.body;
  if (!text?.trim()) return res.status(400).json({ error: 'text is required' });

  let client;
  try {
    client = getClient();
  } catch (e) {
    return res.status(503).json({ error: e.message });
  }

  try {
    const message = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: text.trim() }],
    });

    const raw = message.content[0]?.text ?? '';
    // Extract JSON array from the response (handle any wrapping text)
    const match = raw.match(/\[[\s\S]*\]/);
    if (!match) return res.status(502).json({ error: 'Could not parse AI response', raw });

    const items = JSON.parse(match[0]);
    res.json({ items });
  } catch (e) {
    console.error('[AI parse-food]', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ── Workout + nutrition analysis ────────────────────────────────────────────

const ANALYZE_SYSTEM = `You are a knowledgeable, direct fitness and nutrition coach.
You are given structured data about a person's workout logs and nutrition logs for the past 8 weeks.
Analyze the data and write a concise, personal report.

Format your response using markdown:
- Use ## for main section headers
- Use **bold** for exercise names and key numbers
- Use bullet points for lists
- Keep the whole response under 600 words

Be specific: reference actual exercise names, actual numbers (weights, reps, calories, dates).
Do not give generic advice. If a section lacks data, say so in one sentence and skip it.
Tone: direct, encouraging but honest — like a coach who has seen the data.`;

function buildAnalysisPayload(db, userId) {
  // User profile & goals
  const user = db.prepare('SELECT u.name, up.* FROM users u LEFT JOIN user_profiles up ON up.user_id = u.id WHERE u.id = ?').get(userId);
  if (!user) throw new Error('User not found');

  const goalLabels = { lose: 'cut (lose weight)', lose_mild: 'mild cut', maintain: 'maintain weight', gain: 'lean bulk', gain_aggressive: 'aggressive bulk' };
  const goal = goalLabels[user.weight_goal_type] ?? user.weight_goal_type ?? 'not set';

  let profileSection = `USER: ${user.name}
Goal: ${goal}
TDEE estimate: ${user.tdee_estimate ? Math.round(user.tdee_estimate) + ' kcal/day' : 'not set'}
Calorie target: ${user.calorie_target ? Math.round(user.calorie_target) + ' kcal/day' : 'not set'}
Protein target: ${user.protein_target_g ? Math.round(user.protein_target_g) + 'g' : 'not set'}
`;

  // Workout sessions — last 56 days
  const sessions = db.prepare(`
    SELECT ws.id, ws.name, DATE(ws.started_at) as date, ws.completed_at
    FROM workout_sessions ws
    WHERE ws.user_id = ? AND ws.status = 'completed' AND DATE(ws.started_at) >= DATE('now', '-56 days')
    ORDER BY ws.started_at
  `).all(userId);

  // Build week buckets (last 8 weeks, Mon-Sun)
  const now = new Date();
  const weeks = [];
  for (let w = 7; w >= 0; w--) {
    const start = new Date(now);
    start.setDate(now.getDate() - now.getDay() + 1 - w * 7); // Monday
    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    weeks.push({
      label: start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + '–' + end.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      start: start.toISOString().slice(0, 10),
      end: end.toISOString().slice(0, 10),
      sessions: [],
    });
  }
  for (const s of sessions) {
    const w = weeks.find(w => s.date >= w.start && s.date <= w.end);
    if (w) w.sessions.push(s);
  }

  // For each session get top set per exercise
  const exerciseSummary = db.prepare(`
    SELECT se.session_id, e.name as exercise_name, e.category,
           MAX(sl.actual_weight_value) as top_weight, sl.actual_weight_unit as weight_unit,
           MAX(sl.actual_reps) as top_reps,
           COUNT(sl.id) as sets_logged
    FROM session_exercises se
    JOIN exercises e ON e.id = se.exercise_id
    LEFT JOIN set_logs sl ON sl.session_exercise_id = se.id
    WHERE se.session_id IN (${sessions.map(() => '?').join(',') || 'NULL'})
      AND e.category NOT IN ('warmup','cooldown')
    GROUP BY se.session_id, se.exercise_id
    ORDER BY se.session_id, se.order_index
  `).all(...sessions.map(s => s.id));

  const exBySession = {};
  for (const row of exerciseSummary) {
    if (!exBySession[row.session_id]) exBySession[row.session_id] = [];
    exBySession[row.session_id].push(row);
  }

  let workoutSection = '\nWORKOUT LOG (last 8 weeks):\n';
  for (const week of weeks) {
    if (week.sessions.length === 0) {
      workoutSection += `Week of ${week.label}: NO SESSIONS LOGGED\n`;
    } else {
      workoutSection += `Week of ${week.label}: ${week.sessions.length} session(s)\n`;
      for (const s of week.sessions) {
        workoutSection += `  ${s.date} — ${s.name}\n`;
        const exs = exBySession[s.id] ?? [];
        for (const ex of exs) {
          if (ex.top_weight && ex.top_weight > 0) {
            workoutSection += `    ${ex.exercise_name}: ${ex.sets_logged} sets, top ${ex.top_reps}×${ex.top_weight}${ex.weight_unit}\n`;
          } else if (ex.top_reps) {
            workoutSection += `    ${ex.exercise_name}: ${ex.sets_logged} sets, top ${ex.top_reps} reps (bodyweight)\n`;
          }
        }
      }
    }
  }

  // Nutrition — aggregate per day
  const mealDays = db.prepare(`
    SELECT DATE(m.logged_at) as day,
           ROUND(SUM(mi.calories), 0) as calories,
           ROUND(SUM(mi.protein_g), 1) as protein,
           ROUND(SUM(mi.carbs_g) - SUM(mi.fiber_g), 1) as net_carbs,
           ROUND(SUM(mi.fat_g), 1) as fat
    FROM meals m
    JOIN meal_items mi ON mi.meal_id = m.id
    WHERE m.user_id = ? AND DATE(m.logged_at) >= DATE('now', '-56 days')
    GROUP BY DATE(m.logged_at)
    ORDER BY day
  `).all(userId);

  const dayMap = {};
  for (const d of mealDays) dayMap[d.day] = d;

  const totalDays = 56;
  const loggedDays = mealDays.length;
  const coverage = Math.round((loggedDays / totalDays) * 100);

  let nutritionSection = '\nNUTRITION LOG (last 8 weeks):\n';
  nutritionSection += `Coverage: ${loggedDays}/${totalDays} days logged (${coverage}%)\n`;

  if (loggedDays > 0) {
    const avgCals = Math.round(mealDays.reduce((a, d) => a + (d.calories || 0), 0) / loggedDays);
    const avgProt = Math.round(mealDays.reduce((a, d) => a + (d.protein || 0), 0) / loggedDays);
    const avgCarbs = Math.round(mealDays.reduce((a, d) => a + (d.net_carbs || 0), 0) / loggedDays);
    const avgFat = Math.round(mealDays.reduce((a, d) => a + (d.fat || 0), 0) / loggedDays);
    nutritionSection += `Daily averages (logged days only):
  Calories: ${avgCals} kcal${user.calorie_target ? ' (target: ' + Math.round(user.calorie_target) + ')' : ''}
  Protein: ${avgProt}g${user.protein_target_g ? ' (target: ' + Math.round(user.protein_target_g) + 'g)' : ''}
  Net carbs: ${avgCarbs}g | Fat: ${avgFat}g\n`;

    // Weekly breakdown
    nutritionSection += 'Weekly logged days / avg calories:\n';
    for (const week of weeks) {
      const daysInWeek = mealDays.filter(d => d.day >= week.start && d.day <= week.end);
      if (daysInWeek.length === 0) {
        nutritionSection += `  ${week.label}: 0 days logged\n`;
      } else {
        const wAvgCals = Math.round(daysInWeek.reduce((a, d) => a + (d.calories || 0), 0) / daysInWeek.length);
        nutritionSection += `  ${week.label}: ${daysInWeek.length}/7 days, avg ${wAvgCals} kcal\n`;
      }
    }
  }

  return `${profileSection}${workoutSection}${nutritionSection}

Please analyze this data and provide:
## Overall Assessment
A 2-3 sentence summary of how things are going overall.

## Workout Consistency & Volume
Comment on training frequency, any missed weeks, and volume trends.

## Strength Progression
Call out specific exercises — which are trending up, which are stalled or declining.

## Nutrition
Based on logged days only (note coverage). How does intake compare to targets given the goal?

## Suggestions
2-3 specific, actionable suggestions based on the data. Be concrete.`;
}

router.post('/analyze', async (req, res) => {
  const { user_id } = req.body;
  if (!user_id) return res.status(400).json({ error: 'user_id required' });

  let client;
  try { client = getClient(); } catch (e) { return res.status(503).json({ error: e.message }); }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  try {
    const db = require('../db/index');
    const prompt = buildAnalysisPayload(db, user_id);

    const stream = await client.messages.create({
      model: 'claude-sonnet-5',
      max_tokens: 1200,
      stream: true,
      system: ANALYZE_SYSTEM,
      messages: [{ role: 'user', content: prompt }],
    });

    for await (const event of stream) {
      if (event.type === 'content_block_delta' && event.delta?.type === 'text_delta') {
        res.write(`data: ${JSON.stringify({ text: event.delta.text })}\n\n`);
      }
    }
    res.write('data: [DONE]\n\n');
    res.end();
  } catch (e) {
    console.error('[AI analyze]', e.message);
    res.write(`data: ${JSON.stringify({ error: e.message })}\n\n`);
    res.end();
  }
});

module.exports = router;
