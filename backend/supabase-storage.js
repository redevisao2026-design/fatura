const crypto = require('crypto');
const path = require('path');

function getSupabaseStorageConfig() {
  const url = process.env.SUPABASE_URL?.replace(/\/$/, '');
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const bucket = process.env.SUPABASE_STORAGE_BUCKET;

  if (!url || !serviceRoleKey || !bucket) {
    return null;
  }

  return { url, serviceRoleKey, bucket };
}

function hasSupabaseStorageConfig() {
  return !!getSupabaseStorageConfig();
}

function normalizeFileName(originalName) {
  const ext = path.extname(originalName || '').toLowerCase();
  const base = path
    .basename(originalName || 'arquivo', ext)
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '') || 'arquivo';

  return `${base}${ext}`;
}

function buildStorageObjectPath(folder, originalName) {
  const safeFileName = normalizeFileName(originalName);
  const uniqueFolder = `${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
  return `${folder}/${uniqueFolder}/${safeFileName}`;
}

function encodeStoragePath(objectPath) {
  return objectPath.split('/').map(encodeURIComponent).join('/');
}

function buildSupabaseRef(bucket, objectPath) {
  return `supabase://${bucket}/${objectPath}`;
}

function parseSupabaseRef(ref) {
  if (typeof ref !== 'string' || !ref.startsWith('supabase://')) {
    return null;
  }

  const remainder = ref.slice('supabase://'.length);
  const slashIndex = remainder.indexOf('/');

  if (slashIndex === -1) {
    return { bucket: remainder, objectPath: '' };
  }

  return {
    bucket: remainder.slice(0, slashIndex),
    objectPath: remainder.slice(slashIndex + 1),
  };
}

async function uploadBufferToSupabase({
  buffer,
  originalName,
  contentType,
  folder,
  upsert = true,
}) {
  const config = getSupabaseStorageConfig();
  if (!config) {
    throw new Error('Supabase Storage nao configurado');
  }

  const objectPath = buildStorageObjectPath(folder, originalName);
  const endpoint = `${config.url}/storage/v1/object/${encodeURIComponent(config.bucket)}/${encodeStoragePath(objectPath)}`;

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.serviceRoleKey}`,
      apikey: config.serviceRoleKey,
      'Content-Type': contentType || 'application/octet-stream',
      'x-upsert': upsert ? 'true' : 'false',
    },
    body: buffer,
  });

  const responseText = await response.text();
  if (!response.ok) {
    throw new Error(`Erro ao enviar arquivo para Supabase: ${response.status} ${responseText}`);
  }

  return buildSupabaseRef(config.bucket, objectPath);
}

async function fetchSupabaseObject(ref) {
  const parsed = parseSupabaseRef(ref);
  const config = getSupabaseStorageConfig();

  if (!parsed) {
    return null;
  }

  if (!config) {
    throw new Error('Supabase Storage nao configurado');
  }

  const bucket = parsed.bucket || config.bucket;
  const endpoint = `${config.url}/storage/v1/object/authenticated/${encodeURIComponent(bucket)}/${encodeStoragePath(parsed.objectPath)}`;

  return fetch(endpoint, {
    headers: {
      Authorization: `Bearer ${config.serviceRoleKey}`,
      apikey: config.serviceRoleKey,
    },
  });
}

async function deleteSupabaseObject(ref) {
  const parsed = parseSupabaseRef(ref);
  const config = getSupabaseStorageConfig();

  if (!parsed) {
    return false;
  }

  if (!config) {
    throw new Error('Supabase Storage nao configurado');
  }

  const bucket = parsed.bucket || config.bucket;
  const endpoint = `${config.url}/storage/v1/object/${encodeURIComponent(bucket)}/${encodeStoragePath(parsed.objectPath)}`;

  const response = await fetch(endpoint, {
    method: 'DELETE',
    headers: {
      Authorization: `Bearer ${config.serviceRoleKey}`,
      apikey: config.serviceRoleKey,
    },
  });

  if (!response.ok && response.status !== 404) {
    const responseText = await response.text();
    throw new Error(`Erro ao remover arquivo do Supabase: ${response.status} ${responseText}`);
  }

  return true;
}

module.exports = {
  buildStorageObjectPath,
  buildSupabaseRef,
  deleteSupabaseObject,
  encodeStoragePath,
  fetchSupabaseObject,
  getSupabaseStorageConfig,
  hasSupabaseStorageConfig,
  normalizeFileName,
  parseSupabaseRef,
  uploadBufferToSupabase,
};
