import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.resolve(__dirname, '../../data');
const STORE_PATH = path.join(DATA_DIR, 'store.json');

const DEFAULT_STORE = {
  funds: {},
  gold: {
    holding: 0,
    avgPrice: 0,
  },
};

function ensureStore() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(STORE_PATH)) {
    fs.writeFileSync(STORE_PATH, JSON.stringify(DEFAULT_STORE, null, 2), 'utf8');
  }
}

export function readStore() {
  ensureStore();
  try {
    const raw = fs.readFileSync(STORE_PATH, 'utf8');
    const data = JSON.parse(raw);
    return {
      funds: data.funds || {},
      gold: { ...DEFAULT_STORE.gold, ...(data.gold || {}) },
    };
  } catch {
    return structuredClone(DEFAULT_STORE);
  }
}

export function writeStore(store) {
  ensureStore();
  fs.writeFileSync(STORE_PATH, JSON.stringify(store, null, 2), 'utf8');
  return store;
}

export function listFunds({ type } = {}) {
  const store = readStore();
  let list = Object.values(store.funds);
  if (type === 'hold') list = list.filter((f) => f.type === 'hold');
  if (type === 'watch') list = list.filter((f) => f.type === 'watch');
  return list.sort((a, b) => (a.code > b.code ? 1 : -1));
}

export function upsertFund(payload) {
  const store = readStore();
  const code = String(payload.code || '').padStart(6, '0');
  if (!/^\d{6}$/.test(code)) throw new Error('基金代码须为6位数字');

  const prev = store.funds[code] || {};
  const next = {
    code,
    name: payload.name ?? prev.name ?? code,
    fundKey: payload.fundKey ?? prev.fundKey ?? '',
    type: payload.type ?? prev.type ?? 'watch',
    amount: Number(payload.amount ?? prev.amount ?? 0) || 0,
    shares: Number(payload.shares ?? prev.shares ?? 0) || 0,
    sectors: Array.isArray(payload.sectors)
      ? payload.sectors
      : prev.sectors || [],
    updatedAt: new Date().toISOString(),
  };

  if (next.type === 'hold' && next.amount <= 0 && next.shares <= 0) {
    // still allow hold with 0 for editing later
  }

  store.funds[code] = next;
  writeStore(store);
  return next;
}

export function updateFund(code, patch) {
  const store = readStore();
  const key = String(code).padStart(6, '0');
  if (!store.funds[key]) throw new Error('基金不存在');
  store.funds[key] = {
    ...store.funds[key],
    ...patch,
    code: key,
    updatedAt: new Date().toISOString(),
  };
  writeStore(store);
  return store.funds[key];
}

export function deleteFund(code) {
  const store = readStore();
  const key = String(code).padStart(6, '0');
  if (!store.funds[key]) throw new Error('基金不存在');
  delete store.funds[key];
  writeStore(store);
  return true;
}

export function getGoldConfig() {
  return readStore().gold;
}

export function updateGoldConfig(patch) {
  const store = readStore();
  store.gold = {
    holding: Number(patch.holding ?? store.gold.holding ?? 0) || 0,
    avgPrice: Number(patch.avgPrice ?? store.gold.avgPrice ?? 0) || 0,
  };
  writeStore(store);
  return store.gold;
}
