import express from 'express';
import cors from 'cors';
import fs from 'fs/promises';
import path from 'path';
import { exec } from 'child_process';

const app = express();
const PORT = process.env.PORT || 3001;

// --- CONFIGURATION ---
// This points to the Python inside your virtual environment
const VENV_PYTHON = path.resolve(process.cwd(), 'venv', 'bin', 'python3');
const DATA_PATH = path.resolve(process.cwd(), 'customization.json');
const AVAIL_DIR = path.resolve(process.cwd(), 'availability');
const LOGIN_PATH = path.resolve(process.cwd(), 'public', 'login.json');

app.use(cors());
app.use(express.json({ limit: '1mb' }));

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
  if (!body || typeof body !== 'object') return res.status(400).json({ error: 'Invalid JSON' });

  try {
    await fs.writeFile(DATA_PATH, JSON.stringify(body, null, 2), 'utf8');
    res.json({ ok: true, status: 'saving', message: "Generating schedule..." });

    // FIXED: Using VENV_PYTHON instead of python3
    console.log("Triggering scheduler...");
    exec(`${VENV_PYTHON} scheduler.py`, { cwd: process.cwd(), timeout: 120000 }, (err, stdout, stderr) => {
      if (err) console.error('Background Scheduler Error:', stderr || err);
      else console.log('Background Scheduler Finished Successfully');
    });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

app.post('/api/save-availability', async (req, res) => {
  const body = req.body;
  if (!body || !body.name) return res.status(400).json({ error: 'Missing name' });
  try {
    await fs.mkdir(AVAIL_DIR, { recursive: true });
    const safe = body.name.replace(/[^a-z0-9-_\.]/gi, '_');
    const target = path.join(AVAIL_DIR, `${safe}.json`);
    await fs.writeFile(target, JSON.stringify(body, null, 2), 'utf8');

    // FIXED: Using VENV_PYTHON instead of python3
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

app.get('/api/schedule', async (req, res) => {
  try {
    const txt = await fs.readFile(path.resolve(process.cwd(), 'schedule.json'), 'utf8');
    res.json({ ok: true, schedule: JSON.parse(txt) });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

app.get('/api/availability/:safeName', async (req, res) => {
  try {
    const target = path.join(AVAIL_DIR, `${req.params.safeName}.json`);
    const txt = await fs.readFile(target, 'utf8');
    res.json(JSON.parse(txt || '{}'));
  } catch (err) {
    res.status(404).json({ error: 'Not found' });
  }
});

app.post('/api/employees', async (req, res) => {
  const { name, password, role } = req.body;
  if (!name || !password || !role) return res.status(400).json({ error: 'Missing data' });
  try {
    const loginTxt = await fs.readFile(LOGIN_PATH, 'utf8');
    const loginData = JSON.parse(loginTxt || '{"employees":[]}');
    if (loginData.employees.find(e => e.name.toLowerCase() === name.toLowerCase())) {
      return res.status(409).json({ error: 'Employee exists' });
    }
    loginData.employees.push({ name, password, role });
    await fs.writeFile(LOGIN_PATH, JSON.stringify(loginData, null, 2), 'utf8');

    const safeName = name.replace(/[^a-z0-9-_\.]/gi, '_');
    const availTarget = path.join(AVAIL_DIR, `${safeName}.json`);
    await fs.writeFile(availTarget, JSON.stringify({ name, role, max_hours: 40, availability: {} }, null, 2), 'utf8');
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// Static files
const DIST_DIR = path.resolve(process.cwd(), 'dist');
app.use(express.static(DIST_DIR));
app.get('*', (req, res) => {
  res.sendFile(path.join(DIST_DIR, 'index.html'));
});

app.listen(PORT, () => {
  ensureAvailabilityFilesFromLogin().then(() => {
    console.log(`Monolith running on http://localhost:${PORT}`);
    console.log(`Python venv path: ${VENV_PYTHON}`);
  });
});
