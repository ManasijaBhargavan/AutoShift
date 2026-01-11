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

app.get('/api/schedule', async (req, res) => {
  try {
    const txt = await fs.readFile(path.resolve(process.cwd(), 'schedule.json'), 'utf8');
    const json = JSON.parse(txt);
    res.json({ok: true, schedule: json});
  } catch (err) {
    res.status(500).json({error: String(err)});
  }
});

app.listen(PORT, ()=>{
  console.log(`Customization server running on http://localhost:${PORT}`);
});
