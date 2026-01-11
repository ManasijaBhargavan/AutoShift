import express from 'express';
import cors from 'cors';
import fs from 'fs/promises';
import path from 'path';

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
    res.json({ok: true});
  } catch (err) {
    res.status(500).json({error: String(err)});
  }
});

app.listen(PORT, ()=>{
  console.log(`Customization server running on http://localhost:${PORT}`);
});
