'use strict';

const fs = require('fs');
const path = require('path');

const DEFAULT_ROOT = path.join(__dirname, '..', '..', '..', 'imports');

const SUBDIRS = [
  'incoming',
  'extracted',
  'normalized',
  'review',
  'approved',
  'rejected',
  'reports',
];

function ensureStaging(root = DEFAULT_ROOT) {
  for (const d of SUBDIRS) {
    fs.mkdirSync(path.join(root, d), { recursive: true });
  }
  return root;
}

function writeJson(filePath, obj) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(obj, null, 2), 'utf8');
}

function slug(s) {
  return String(s || 'item')
    .replace(/[^\w.\u00C0-\u024F-]+/g, '_')
    .slice(0, 120);
}

function saveExtracted(root, basename, doc) {
  const dest = path.join(root, 'extracted', `${slug(basename)}.extracted.json`);
  writeJson(dest, doc);
  return dest;
}

function saveNormalized(root, basename, songs) {
  const dest = path.join(root, 'normalized', `${slug(basename)}.normalized.json`);
  writeJson(dest, { songs, savedAt: new Date().toISOString() });
  return dest;
}

function saveReview(root, basename, songs) {
  const dest = path.join(root, 'review', `${slug(basename)}.review.json`);
  writeJson(dest, { songs, savedAt: new Date().toISOString() });
  return dest;
}

function saveApproved(root, basename, payload) {
  const dest = path.join(root, 'approved', `${slug(basename)}.approved.json`);
  writeJson(dest, payload);
  return dest;
}

function saveReport(root, name, report) {
  const dest = path.join(root, 'reports', `${slug(name)}.report.json`);
  writeJson(dest, report);
  const md = path.join(root, 'reports', `${slug(name)}.report.md`);
  fs.writeFileSync(md, reportToMarkdown(report), 'utf8');
  return { json: dest, md };
}

function reportToMarkdown(report) {
  const lines = [
    `# Import Report — ${report.name || ''}`,
    '',
    `- Arquivos: ${report.files}`,
    `- Processados: ${report.processed}`,
    `- Com sucesso: ${report.success}`,
    `- Revisão necessária: ${report.needsReview}`,
    `- Falhas: ${report.failed}`,
    `- Novos louvores: ${report.newSongs}`,
    `- Possíveis duplicatas: ${report.possibleDuplicates}`,
    `- Mesma versão outra coletânea: ${report.sameSongDifferentVersion}`,
    `- Exatas (destino): ${report.exactDuplicates}`,
    '',
    '## Arquivos',
    '',
  ];
  for (const f of report.fileReports || []) {
    lines.push(`### ${f.file}`);
    lines.push(`- tipo: ${f.type}`);
    lines.push(`- louvores: ${f.songCount}`);
    lines.push(`- ok: ${f.ok}`);
    if (f.errors && f.errors.length) lines.push(`- erros: ${f.errors.join('; ')}`);
    if (f.warnings && f.warnings.length) lines.push(`- avisos: ${f.warnings.slice(0, 8).join('; ')}`);
    lines.push('');
  }
  return lines.join('\n');
}

module.exports = {
  DEFAULT_ROOT,
  SUBDIRS,
  ensureStaging,
  writeJson,
  saveExtracted,
  saveNormalized,
  saveReview,
  saveApproved,
  saveReport,
  reportToMarkdown,
};
