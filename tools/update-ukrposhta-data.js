#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const sourcePath = process.argv[2];
const outputPath = process.argv[3] || path.join(__dirname, '..', 'data', 'ukrposhta-indexes.json');
const updated = process.argv[4] || new Date().toISOString().slice(0, 10).split('-').reverse().join('.');

if (!sourcePath) {
  console.error('Usage: node tools/update-ukrposhta-data.js <source.csv> [output.json] [DD.MM.YYYY]');
  process.exit(1);
}

function parseCsvLine(line) {
  const fields = [];
  let value = '';
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === '"') {
      if (quoted && line[i + 1] === '"') {
        value += '"';
        i += 1;
      } else {
        quoted = !quoted;
      }
    } else if (char === ';' && !quoted) {
      fields.push(value.trim());
      value = '';
    } else {
      value += char;
    }
  }
  fields.push(value.trim());
  return fields;
}

function clean(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
const decoder = new TextDecoder('windows-1251');
const input = fs.createReadStream(sourcePath);
const seen = new Set();
const dictionaries = {
  cities: [],
  regions: [],
  districts: [],
  streets: [],
  offices: []
};
const dictionaryMaps = Object.fromEntries(Object.keys(dictionaries).map(key => [key, new Map()]));
const compactRecords = [];
let pending = '';
let firstLine = true;
let sourceRows = 0;
let records = 0;

function dictionaryId(name, value) {
  const map = dictionaryMaps[name];
  if (map.has(value)) return map.get(value);
  const id = dictionaries[name].length;
  dictionaries[name].push(value);
  map.set(value, id);
  return id;
}

function processLine(rawLine) {
  const line = rawLine.replace(/\r$/, '');
  if (firstLine) {
    firstLine = false;
    return;
  }
  if (!line) return;
  sourceRows += 1;
  const columns = parseCsvLine(line);
  if (columns.length < 8) return;

  const record = {
    index: clean(columns[7] || columns[3]).padStart(5, '0'),
    city: clean(columns[2]),
    region: clean(columns[0]),
    district: clean(columns[1]),
    street: clean(columns[4]),
    office: clean(columns[6])
  };
  if (!/^\d{5}$/.test(record.index) || !record.city) return;

  const key = [record.index, record.city, record.region, record.district, record.street, record.office].join('\u0001').toLowerCase();
  if (seen.has(key)) return;
  seen.add(key);
  compactRecords.push([
    Number(record.index),
    dictionaryId('cities', record.city),
    dictionaryId('regions', record.region),
    dictionaryId('districts', record.district),
    dictionaryId('streets', record.street),
    dictionaryId('offices', record.office)
  ]);
  records += 1;
}

input.on('data', chunk => {
  pending += decoder.decode(chunk, { stream: true });
  const lines = pending.split('\n');
  pending = lines.pop() || '';
  lines.forEach(processLine);
});

input.on('end', () => {
  pending += decoder.decode();
  if (pending) processLine(pending);
  const payload = {
    source: 'Відкриті дані АТ «Укрпошта» — «Перелік поштових індексів та відділень поштового зв’язку України»',
    sourceUrl: 'https://data.gov.ua/dataset/post-index-and-braches',
    updated,
    schema: ['indexNumber', 'cityId', 'regionId', 'districtId', 'streetId', 'officeId'],
    ...dictionaries,
    records: compactRecords,
    sourceRows,
    recordCount: records
  };
  fs.writeFileSync(outputPath, JSON.stringify(payload));
  console.log(`Created ${outputPath}: ${records} records from ${sourceRows} source rows.`);
});

input.on('error', error => {
  console.error(error.message);
  process.exitCode = 1;
});
