'use strict';

const https = require('https');
const {
  formatLouvandoPraise,
  mapSearchHit,
} = require('../../tools/louvor-import/lib/louvando-format');

const API_ORIGIN = 'https://api.louvando.app';
const ID_RE =
  /^(?:[A-Za-z0-9]{8,16}|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i;
const MAX_BODY = 1024 * 1024;

function louvandoError(message, status, code) {
  const err = new Error(message);
  err.status = status;
  err.code = code || 'LOUVANDO';
  return err;
}

function getJson(pathnameAndQuery) {
  const url = new URL(pathnameAndQuery, API_ORIGIN);
  if (url.origin !== API_ORIGIN) {
    return Promise.reject(louvandoError('destino inválido', 400, 'BAD_ID'));
  }
  return new Promise((resolve, reject) => {
    const req = https.get(
      url,
      {
        headers: {
          Accept: 'application/json',
          'User-Agent': 'projection-html5-icm',
        },
      },
      (res) => {
        const chunks = [];
        let size = 0;
        res.on('data', (chunk) => {
          size += chunk.length;
          if (size > MAX_BODY) {
            req.destroy();
            reject(louvandoError('resposta grande demais', 502));
            return;
          }
          chunks.push(chunk);
        });
        res.on('end', () => {
          const body = Buffer.concat(chunks).toString('utf8');
          if (res.statusCode === 404) {
            reject(louvandoError('louvor não encontrado', 404, 'NOT_FOUND'));
            return;
          }
          if (res.statusCode < 200 || res.statusCode >= 300) {
            reject(louvandoError('Louvando indisponível', 502));
            return;
          }
          try {
            resolve(JSON.parse(body));
          } catch (_) {
            reject(louvandoError('resposta inválida do Louvando', 502));
          }
        });
      }
    );
    req.setTimeout(12000, () => {
      req.destroy();
      reject(louvandoError('tempo esgotado ao falar com o Louvando', 504, 'TIMEOUT'));
    });
    req.on('error', (e) => {
      if (e && e.status) reject(e);
      else reject(louvandoError('sem conexão com o Louvando', 502));
    });
  });
}

function assertId(id) {
  const safe = String(id || '').trim();
  if (!ID_RE.test(safe)) {
    throw louvandoError('id inválido', 400, 'BAD_ID');
  }
  return safe;
}

function createLouvandoClient() {
  function search(query, page) {
    const q = String(query || '')
      .replace(/[\u0000-\u001f]/g, '')
      .trim()
      .slice(0, 80);
    const numeric = /^\d+$/.test(q);
    const p = Math.min(40, Math.max(1, Number(page) || 1));
    if (q.length < 3 && !numeric) {
      return Promise.resolve({
        query: q,
        page: 1,
        perPage: 25,
        total: 0,
        lastPage: 0,
        items: [],
      });
    }
    return getJson(`/praises?query=${encodeURIComponent(q)}&page=${p}`).then((data) => ({
      query: q,
      page: data.page || p,
      perPage: data.perPage || 25,
      total: data.total || 0,
      lastPage: data.lastPage || 0,
      items: (Array.isArray(data.data) ? data.data : []).map(mapSearchHit).filter((it) => it.id),
    }));
  }

  function preview(id) {
    const safe = assertId(id);
    return getJson(`/praises/${encodeURIComponent(safe)}`).then((data) => {
      const formatted = formatLouvandoPraise(data);
      return {
        id: data.short_id || safe,
        ...formatted,
      };
    });
  }

  return { search, preview, assertId };
}

module.exports = { createLouvandoClient, API_ORIGIN };
