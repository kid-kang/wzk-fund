import axios from 'axios';

const ua =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36';

const INDEX_LIST = [
  { secid: '1.000001', code: '000001', name: '上证指数' },
  { secid: '0.399001', code: '399001', name: '深证成指' },
  { secid: '0.399006', code: '399006', name: '创业板指' },
  { secid: '0.899050', code: '899050', name: '北证50' },
  { secid: '1.000688', code: '000688', name: '科创50' },
  { secid: '1.000016', code: '000016', name: '上证50' },
  { secid: '1.000300', code: '000300', name: '沪深300' },
  { secid: '1.000905', code: '000905', name: '中证500' },
  { secid: '100.NDX', code: 'NDX', name: '纳斯达克100' },
  { secid: '100.SPX', code: 'SPX', name: '标普500' },
];

async function eastmoneyGet(url, params, hosts) {
  let lastErr;
  for (const host of hosts) {
    try {
      const res = await axios.get(`${host}${url}`, {
        timeout: 12000,
        headers: {
          'User-Agent': ua,
          Referer: 'https://quote.eastmoney.com/',
        },
        params,
      });
      return res.data;
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr || new Error('eastmoney request failed');
}

const PUSH_HOSTS = [
  'https://push2delay.eastmoney.com',
  'https://push2.eastmoney.com',
  'https://82.push2.eastmoney.com',
];

export async function getIndices() {
  const secids = INDEX_LIST.map((i) => i.secid).join(',');
  const data = await eastmoneyGet(
    '/api/qt/ulist.np/get',
    {
      fltt: 2,
      invt: 2,
      fields: 'f2,f3,f4,f12,f14',
      secids,
    },
    PUSH_HOSTS,
  );

  const diff = data?.data?.diff || [];
  const byCode = new Map(diff.map((d) => [String(d.f12), d]));

  return INDEX_LIST.map((item) => {
    const row = byCode.get(item.code) || byCode.get(item.secid.split('.')[1]);
    const percent = row?.f3;
    return {
      code: item.code,
      name: item.name,
      percent: typeof percent === 'number' ? percent : null,
      // 按产品约定不在前端强调点位，仅返回供内部计算
      price: typeof row?.f2 === 'number' ? row.f2 : null,
    };
  });
}

export async function getSectorBoards({ sort = 'desc', size = 10 } = {}) {
  const data = await eastmoneyGet(
    '/api/qt/clist/get',
    {
      pn: 1,
      pz: 80,
      po: sort === 'asc' ? 0 : 1,
      np: 1,
      fltt: 2,
      invt: 2,
      fid: 'f3',
      fs: 'm:90+t:2',
      fields: 'f12,f14,f2,f3',
    },
    PUSH_HOSTS,
  );

  const list = (data?.data?.diff || [])
    .map((d) => ({
      code: d.f12,
      name: d.f14,
      percent: typeof d.f3 === 'number' ? d.f3 : null,
    }))
    .filter((d) => d.percent != null)
    .sort((a, b) => (sort === 'asc' ? a.percent - b.percent : b.percent - a.percent))
    .slice(0, size);

  return list;
}

export async function getUpDownStats() {
  const res = await axios.get('https://emdatah5.eastmoney.com/dc/NXFXB/GetUpDownData', {
    timeout: 12000,
    headers: { 'User-Agent': ua, Referer: 'https://emdatah5.eastmoney.com/' },
    params: { type: 0 },
  });
  const row = Array.isArray(res.data) ? res.data[0] : res.data?.[0];
  if (!row) {
    return { up: 0, down: 0, flat: 0, time: null };
  }
  return {
    up: Number(row.up) || 0,
    down: Number(row.down) || 0,
    flat: Number(row.t) || 0,
    time: row.time || null,
  };
}

export async function getMarketOverview() {
  const [upDown, topGainers, topLosers] = await Promise.all([
    getUpDownStats(),
    getSectorBoards({ sort: 'desc', size: 10 }),
    getSectorBoards({ sort: 'asc', size: 10 }),
  ]);
  return { upDown, topGainers, topLosers };
}
