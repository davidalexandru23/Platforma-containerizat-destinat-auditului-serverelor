import { validateJson } from './src/services/templates.service.js';
import fs from 'fs';
import path from 'path';

const content = fs.readFileSync('../../templates/container_runtime_security_baseline.json', 'utf8');
const data = JSON.parse(content);
const res = validateJson(data);
console.log(JSON.stringify(res, null, 2));
