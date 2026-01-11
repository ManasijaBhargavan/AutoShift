import express from 'express';
import cors from 'cors';
import fs from 'fs/promises';
import path from 'path';
import { exec } from 'child_process';
import { GoogleGenerativeAI } from '@google/generative-ai';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// --- CONFIGURATION ---
// This points to the Python inside your virtual environment
const VENV_PYTHON = path.resolve(process.cwd(), 'venv', 'bin', 'python3');

// Initialize Gemini
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

app.use(cors());
app.use(express.json({ limit: '1mb' }));

const DATA_PATH = path.resolve(process.cwd(), 'customization.json');
const AVAIL_DIR = path.resolve(process.cwd(), 'availability');
const LOGIN_PATH = path.resolve(process.cwd(), 'public', 'login.json');

// --- Helper: Ensure Directories ---
async function ensureAvailabilityFilesFromLogin() {
  try {
    await fs.mkdir(AVAIL_DIR, { recursive: true });
    const txt = await fs.readFile(LOGIN_PATH, 'utf8');
    const login = JSON.parse(txt || '{}');
    const employees = login.employees || [];
    for (const emp of employees) {
      const name = emp.name || emp.username || null;
      if (!name) continue;
      const safe = name.replace(/[^a-z0-9-_\.]/gi, '_');
      const target = path.join(AVAIL_DIR, `${safe}.json`);
      try {
        await fs.access(target);
      } catch (e) {
        const defaultObj = {
          name,
          role: emp.role || 'Server',
          max_hours: emp.max_hours || 40,
          availability: {}
        };
        await fs.writeFile(target, JSON.stringify(defaultObj, null, 2), 'utf8');
      }
    }
  } catch (e) {
    console.error('Could not ensure availability files from login.json:', e);
  }
}

// --- API: Customization ---
app.get('/api/customization', async (req, res) => {
  try {
    const txt = await fs.readFile(DATA_PATH, 'utf8');
    res.json(JSON.parse(txt));
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

app.post('/api/customization', async (req, res) => {
  const body = req.body;
  if (!body || typeof body !== 'object') return res.status(400).json({ error: 'Invalid JSON body' });

  try {
    await fs.writeFile(DATA_PATH, JSON.stringify(body, null, 2), 'utf8');
    res.json({ ok: true, status: 'saving', message: "Configuration saved. Generating schedule in background..." });

    // Using VENV_PYTHON for consistency
    console.log("Triggering scheduler...");
    exec(`${VENV_PYTHON} scheduler.py`, { cwd: process.cwd(), timeout: 120000 }, (err, stdout, stderr) => {
      if (err) console.error('Background Scheduler Error:', stderr || err);
      else console.log('Background Scheduler Finished Successfully');
    });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// --- API: Save Availability ---
app.post('/api/save-availability', async (req, res) => {
  const body = req.body;
  if (!body || !body.name) return res.status(400).json({ error: 'Missing name' });
  try {
    await fs.mkdir(AVAIL_DIR, { recursive: true });
    const safe = body.name.replace(/[^a-z0-9-_\.]/gi, '_');
    const target = path.join(AVAIL_DIR, `${safe}.json`);
    await fs.writeFile(target, JSON.stringify(body, null, 2), 'utf8');

    // Using VENV_PYTHON
    exec(`${VENV_PYTHON} scheduler.py`, { cwd: process.cwd(), timeout: 120000 }, async (err, stdout, stderr) => {
      if (err) {
        console.error('Scheduler error:', err, stderr);
        return res.status(500).json({ error: 'Saved but scheduler failed', details: stderr || String(err) });
      }
      res.json({ ok: true, stdout });
    });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// --- API: Get Schedule ---
app.get('/api/schedule', async (req, res) => {
  try {
    const txt = await fs.readFile(path.resolve(process.cwd(), 'schedule.json'), 'utf8');
    res.json({ ok: true, schedule: JSON.parse(txt) });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// --- API: Get Employee Availability ---
app.get('/api/availability/:safeName', async (req, res) => {
  try {
    const target = path.join(AVAIL_DIR, `${req.params.safeName}.json`);
    const txt = await fs.readFile(target, 'utf8');
    res.json(JSON.parse(txt || '{}'));
  } catch (err) {
    res.status(404).json({ error: 'Not found' });
  }
});

// --- API: New Employee ---
app.post('/api/employees', async (req, res) => {
  const { name, password, role } = req.body;
  if (!name || !password || !role) return res.status(400).json({ error: 'Missing name, password, or role' });

  try {
    const loginTxt = await fs.readFile(LOGIN_PATH, 'utf8');
    const loginData = JSON.parse(loginTxt || '{"employees":[]}');

    if (loginData.employees.find(e => e.name.toLowerCase() === name.toLowerCase())) {
      return res.status(409).json({ error: 'Employee exists' });
    }
    loginData.employees.push({ name, password, role });
    await fs.writeFile(LOGIN_PATH, JSON.stringify(loginData, null, 2), 'utf8');

    // Create default availability file
    await fs.mkdir(AVAIL_DIR, { recursive: true });
    const safeName = name.replace(/[^a-z0-9-_\.]/gi, '_');
    const availTarget = path.join(AVAIL_DIR, `${safeName}.json`);
    
    const defaultAvail = { name, role, max_hours: 40, availability: {} };
    await fs.writeFile(availTarget, JSON.stringify(defaultAvail, null, 2), 'utf8');
    
    console.log(`✅ Created new user: ${name}`);
    res.json({ ok: true, message: 'Employee added successfully' });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// --- NEW API: Gemini Availability Parser ---
app.post('/api/ai-availability', async (req, res) => {
  const { prompt } = req.body;
  if (!prompt) return res.status(400).json({ error: "Prompt required" });

  try {
    // 1. Get Business Context
    const configTxt = await fs.readFile(DATA_PATH, 'utf8');
    const config = JSON.parse(configTxt);
    const bh = config.constraints.business_hours;

    // 2. Construct System Prompt
    const systemPrompt = `
      You are an availability scheduler assistant. 
      Business Hours: ${bh.start}:00 to ${bh.end}:00.
      Days: Monday, Tuesday, Wednesday, Thursday, Friday, Saturday, Sunday.
      
      User Input: "${prompt}"
      
      Interpret the user's input and return a JSON object with a list of actions to update their schedule grid.
      Status options: "unavailable", "preferred", "available".
      
      If the user says "I can't work", set status to "unavailable".
      If the user says "I want to work", set status to "preferred".
      If the user says "I can work", set status to "available" (clearing previous constraints).
      
      Format dates in 24h format (e.g., "14:00").
      If the user says "all day", use the business start (${bh.start}:00) and end (${bh.end}:00).
      If the user says "mornings" or "evenings", infer reasonable hours within business bounds.
      
      Return ONLY valid JSON in this format:
      {
        "actions": [
          { "day": "Monday", "start": "14:00", "end": "18:00", "status": "unavailable" }
        ]
      }
    `;

    // 3. Call Gemini
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
    const result = await model.generateContent(systemPrompt);
    const response = await result.response;
    let text = response.text();

    // Clean markdown blocks if present
    text = text.replace(/```json/g, '').replace(/```/g, '').trim();

    const json = JSON.parse(text);
    res.json(json);

  } catch (error) {
    console.error("Gemini Error:", error);
    res.status(500).json({ error: "Failed to process AI request" });
  }
});

const DIST_DIR = path.resolve(process.cwd(), 'dist');
app.use(express.static(DIST_DIR));
app.get('*', (req, res) => {
  res.sendFile(path.join(DIST_DIR, 'index.html'));
});

app.listen(PORT, () => {
  ensureAvailabilityFilesFromLogin().then(() => {
    console.log(`Monolith running on http://localhost:${PORT}`);
    console.log(`Python venv path: ${VENV_PYTHON}`);
  }).catch((e) => {
    console.error('Startup error:', e);
    console.log(`Monolith running on http://localhost:${PORT} (with errors)`);
  });
});