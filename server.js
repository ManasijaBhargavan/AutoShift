import express from 'express';
import cors from 'cors';
import fs from 'fs/promises';
import path from 'path';
import {exec} from 'child_process';

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json({limit: '1mb'}));

const DATA_PATH = path.resolve(process.cwd(), 'customization.json');
const AVAIL_DIR = path.resolve(process.cwd(), 'avalibility');
const LOGIN_PATH = path.resolve(process.cwd(), 'public', 'login.json');

async function ensureAvailabilityFilesFromLogin() {
  try {
    // ensure directory exists
    await fs.mkdir(AVAIL_DIR, {recursive: true});
    // read login.json
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
        // exists
      } catch (e) {
        // create default file
        const defaultObj = {
          name,
          role: emp.role || 'Server',
          max_hours: emp.max_hours || 40,
          availability: {}
        };
        await fs.writeFile(target, JSON.stringify(defaultObj, null, 2), 'utf8');
        console.log(`Created default availability for ${name} at ${target}`);
      }
    }
  } catch (e) {
    console.error('Could not ensure availability files from login.json:', e);
  }
}

app.get('/api/customization', async (req, res) => {
  try {
    const txt = await fs.readFile(DATA_PATH, 'utf8');
    const json = JSON.parse(txt);
    res.json(json);
  } catch (err) {
    res.status(500).json({error: String(err)});
  }
});

app.post('/api/customization', async (req, res) => {
  const body = req.body;
  if (!body || typeof body !== 'object') return res.status(400).json({error: 'Invalid JSON body'});
  try {
    await fs.writeFile(DATA_PATH, JSON.stringify(body, null, 2), 'utf8');
    // After saving customization, run the scheduler to regenerate schedule.json
    exec('python3 scheduler.py', {cwd: process.cwd(), timeout: 120000}, async (err, stdout, stderr) => {
      if (err) {
        console.error('Scheduler error:', err, stderr);
        return res.status(500).json({error: 'Saved but scheduler failed', details: stderr || String(err)});
      }
      try {
        const txt = await fs.readFile(path.resolve(process.cwd(), 'schedule.json'), 'utf8');
        const json = JSON.parse(txt);
        res.json({ok: true, schedule: json, stdout});
      } catch (e) {
        res.json({ok: true, note: 'Saved but could not read schedule.json', details: String(e), stdout});
      }
    });
  } catch (err) {
    res.status(500).json({error: String(err)});
  }
});

// Save per-employee availability file and re-run scheduler
app.post('/api/save-availability', async (req, res) => {
  const body = req.body;
  if (!body || typeof body !== 'object' || !body.name) return res.status(400).json({error: 'Invalid body or missing name'});
  try {
    await fs.mkdir(AVAIL_DIR, {recursive: true});
    const safe = (body.name || 'unknown').replace(/[^a-z0-9-_\.]/gi, '_');
    const target = path.join(AVAIL_DIR, `${safe}.json`);
    await fs.writeFile(target, JSON.stringify(body, null, 2), 'utf8');

    // After saving availability, re-run scheduler to update schedule.json
    exec('python3 scheduler.py', {cwd: process.cwd(), timeout: 120000}, async (err, stdout, stderr) => {
      if (err) {
        console.error('Scheduler error:', err, stderr);
        return res.status(500).json({error: 'Saved but scheduler failed', details: stderr || String(err)});
      }
      res.json({ok: true, stdout});
    });
  } catch (err) {
    res.status(500).json({error: String(err)});
  }
});

app.get('/api/schedule', async (req, res) => {
  try {
    const txt = await fs.readFile(path.resolve(process.cwd(), 'schedule.json'), 'utf8');
    const json = JSON.parse(txt);
    res.json({ok: true, schedule: json});
  } catch (err) {
    res.status(500).json({error: String(err)});
  }
});

// Return a single employee availability file by safe name
app.get('/api/availability/:safeName', async (req, res) => {
  try {
    const fn = `${req.params.safeName}.json`;
    const target = path.join(AVAIL_DIR, fn);
    const txt = await fs.readFile(target, 'utf8');
    const json = JSON.parse(txt || '{}');
    res.json(json);
  } catch (err) {
    res.status(404).json({error: 'Not found'});
  }
});

app.listen(PORT, ()=>{
  ensureAvailabilityFilesFromLogin().then(()=>{
    console.log(`Customization server running on http://localhost:${PORT}`);
  }).catch(()=>{
    console.log(`Customization server running on http://localhost:${PORT}`);
  });
});
