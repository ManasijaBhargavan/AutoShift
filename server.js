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
const AVAIL_DIR = path.resolve(process.cwd(), 'availability');
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
    // 1. Save the file first
    await fs.writeFile(DATA_PATH, JSON.stringify(body, null, 2), 'utf8');
    
    // 2. Respond to the browser IMMEDIATELY (Don't wait for Python)
    res.json({ ok: true, status: 'saving', message: "Configuration saved. Generating schedule in background..." });

    // 3. Run Python in the background
    console.log("Triggering scheduler...");
    exec('python3 scheduler.py', {cwd: process.cwd(), timeout: 120000}, (err, stdout, stderr) => {
      if (err) {
        console.error('Background Scheduler Error:', stderr || err);
      } else {
        console.log('Background Scheduler Finished Successfully');
      }
    });

  } catch (err) {
    // Only happens if file writing fails
    res.status(500).json({error: String(err)});
  }
});

app.post('/api/customization', async (req, res) => {
  const body = req.body;
  if (!body || typeof body !== 'object') return res.status(400).json({error: 'Invalid JSON body'});
  
  try {
    // 1. Save the file first
    await fs.writeFile(DATA_PATH, JSON.stringify(body, null, 2), 'utf8');
    
    // 2. Respond to the browser IMMEDIATELY (Don't wait for Python)
    res.json({ ok: true, status: 'saving', message: "Configuration saved. Generating schedule in background..." });

    // 3. Run Python in the background
    console.log("Triggering scheduler...");
    exec('python3 scheduler.py', {cwd: process.cwd(), timeout: 120000}, (err, stdout, stderr) => {
      if (err) {
        console.error('Background Scheduler Error:', stderr || err);
      } else {
        console.log('Background Scheduler Finished Successfully');
      }
    });

  } catch (err) {
    // Only happens if file writing fails
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

const DIST_DIR = path.resolve(process.cwd(), 'dist'); // Vite builds to 'dist' folder

// 1. Serve static files (js, css, images)
app.use(express.static(DIST_DIR));

// 2. Catch-all: If the request isn't an API call, send index.html
// This allows React Router (e.g. /employer, /app) to work
app.get('*', (req, res) => {
  res.sendFile(path.join(DIST_DIR, 'index.html'));
});

app.listen(PORT, ()=>{
  ensureAvailabilityFilesFromLogin().then(()=>{
    console.log(`Customization server running on http://localhost:${PORT}`);
  }).catch(()=>{
    console.log(`Customization server running on http://localhost:${PORT}`);
  });
});

app.post('/api/employees', async (req, res) => {
  const { name, password, role } = req.body;

  if (!name || !password || !role) {
    return res.status(400).json({ error: 'Missing name, password, or role' });
  }

  try {
    // 1. Update login.json
    const loginTxt = await fs.readFile(LOGIN_PATH, 'utf8');
    const loginData = JSON.parse(loginTxt || '{"employees":[]}');
    
    // Check for duplicate
    if (loginData.employees.find(e => e.name.toLowerCase() === name.toLowerCase())) {
      return res.status(409).json({ error: 'Employee already exists' });
    }

    loginData.employees.push({ name, password, role });
    await fs.writeFile(LOGIN_PATH, JSON.stringify(loginData, null, 2), 'utf8');

    // 2. Create the Availability File immediately
    await fs.mkdir(AVAIL_DIR, { recursive: true });
    const safeName = name.replace(/[^a-z0-9-_\.]/gi, '_');
    const availTarget = path.join(AVAIL_DIR, `${safeName}.json`);
    
    const defaultAvail = {
      name,
      role,
      max_hours: 40,
      availability: {}
    };

    await fs.writeFile(availTarget, JSON.stringify(defaultAvail, null, 2), 'utf8');

    console.log(`✅ Created new user: ${name}`);
    res.json({ ok: true, message: 'Employee added successfully' });

  } catch (err) {
    console.error("Error adding employee:", err);
    res.status(500).json({ error: String(err) });
  }
});
