import { validateJson } from './src/services/templates.service.js';
import fs from 'fs';
import path from 'path';

const dir = '../../templates';
const files = fs.readdirSync(dir).filter(f => f.endsWith('.json'));
for (const file of files) {
  const content = fs.readFileSync(path.join(dir, file), 'utf8');
  try {
    const data = JSON.parse(content);
    const res = validateJson(data);
    if (!res.valid) {
      console.log(`${file} invalid: ${res.errors.join(', ')}`);
    } else {
      console.log(`${file} OK`);
    }
  } catch (e) {
    console.log(`${file} parse error: ${e.message}`);
  }
}
