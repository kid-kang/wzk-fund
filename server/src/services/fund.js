import axios from 'axios';
import https from 'https';

const ua =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36';
const agent = new https.Agent({ rejectUnauthorized: false });

let session = {
  csrf: '',
  cookie: '',
  expiresAt: 0,
};

function cookieHeader(setCookie = []) {
  return setCookie.map((c) => c.split(';')[0]).join('; ');
}

function fmtDate(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

async function ensureSession(force = false) {
  if (!force && session.csrf && Date.now() < session.expiresAt) return session;

  const res = await axios.get('https://www.fund123.cn/fund', {
    httpsAgent: agent,
    timeout: 15000,
    headers: { 'User-Agent': ua, Referer: 'https://www.fund123.cn/' },
  });
  const csrf = res.data.match(/"csrf":"([^"]+)"/)?.[1];
  if (!csrf) throw new Error('获取 fund123 CSRF 失败');
  session = {
    csrf,
    cookie: cookieHeader(res.headers['set-cookie']),
    expiresAt: Date.now() + 10 * 60 * 1000,
  };
  return session;
}

async function fund123Post(path, body) {
  const run = async (force) => {
    const s = await ensureSession(force);
    return axios.post(`https://www.fund123.cn${path}?_csrf=${s.csrf}`, body, {
      httpsAgent: agent,
      timeout: 15000,
      headers: {
        'User-Agent': ua,
        Origin: 'https://www.fund123.cn',
        Referer: 'https://www.fund123.cn/fund',
        'Content-Type': 'application/json',
        'X-API-Key': 'foobar',
        Cookie: s.cookie,
        Accept: 'application/json, text/plain, */*',
      },
      validateStatus: () => true,
    });
  };

  let res = await run(false);
  if (res.status === 403 || res.status === 401) res = await run(true);
  return res;
}

export async function searchFund(code) {
  const padded = String(code).padStart(6, '0');
  const res = await fund123Post('/api/fund/searchFund', { fundCode: padded });
  if (!res.data?.success || !res.data?.fundInfo) {
    throw new Error(res.data?.message || `未找到基金 ${padded}`);
  }
  const info = res.data.fundInfo;
  return {
    code: info.fundCode || padded,
    name: info.fundName || padded,
    fundKey: info.key || '',
    netValue: parseFloat(info.netValue) || null,
    dayGrowth: parsePct(info.dayOfGrowth),
  };
}

function parsePct(v) {
  if (v == null || v === '--' || v === '') return null;
  const n = parseFloat(String(v).replace('%', ''));
  return Number.isFinite(n) ? n : null;
}

export async function getFundMatiaria(code) {
  const padded = String(code).padStart(6, '0');
  const res = await axios.get(`https://www.fund123.cn/matiaria?fundCode=${padded}`, {
    httpsAgent: agent,
    timeout: 15000,
    headers: { 'User-Agent': ua, Referer: 'https://www.fund123.cn/' },
  });
  const html = res.data || '';
  const dayGrowth = parsePct(html.match(/dayOfGrowth":"([^"]+)/)?.[1]);
  const netValue = parseFloat(html.match(/netValue":"([^"]+)/)?.[1]);
  const netValueDate = html.match(/netValueDate":"([^"]+)/)?.[1] || '';
  const fundName = html.match(/fundName":"([^"]+)/)?.[1];
  return {
    code: padded,
    name: fundName,
    dayGrowth: Number.isFinite(dayGrowth) ? dayGrowth : null,
    netValue: Number.isFinite(netValue) ? netValue : null,
    netValueDate,
  };
}

export async function getFundEstimateIntraday(fundKey) {
  if (!fundKey) return { points: [], latest: null };
  const today = new Date();
  const tomorrow = new Date(today.getTime() + 86400000);
  const res = await fund123Post('/api/fund/queryFundEstimateIntraday', {
    startTime: fmtDate(today),
    endTime: fmtDate(tomorrow),
    limit: 240,
    productId: fundKey,
    format: true,
    source: 'WEALTHBFFWEB',
  });

  const list = res.data?.list || [];
  const points = list.map((p) => {
    const t = new Date(p.time);
    const hh = String(t.getHours()).padStart(2, '0');
    const mm = String(t.getMinutes()).padStart(2, '0');
    const growth = parseFloat(p.forecastGrowth);
    return {
      time: `${hh}:${mm}`,
      growth: Number.isFinite(growth) ? growth * 100 : null,
      netValue: parseFloat(p.forecastNetValue) || null,
    };
  }).filter((p) => p.growth != null);

  const latest = points.length ? points[points.length - 1] : null;
  return { points, latest };
}

export async function getFundQuote(fund) {
  const code = fund.code;
  let fundKey = fund.fundKey;
  let name = fund.name;
  let dayGrowth = null;
  let netValue = null;
  let netValueDate = '';

  try {
    if (!fundKey || !name) {
      const searched = await searchFund(code);
      fundKey = fundKey || searched.fundKey;
      name = name || searched.name;
      dayGrowth = searched.dayGrowth;
      netValue = searched.netValue;
    }
  } catch {
    // ignore search failure, try matiaria
  }

  try {
    const m = await getFundMatiaria(code);
    name = name || m.name || code;
    dayGrowth = m.dayGrowth ?? dayGrowth;
    netValue = m.netValue ?? netValue;
    netValueDate = m.netValueDate || '';
  } catch {
    // keep previous
  }

  let estimateGrowth = null;
  let trend = [];
  try {
    const est = await getFundEstimateIntraday(fundKey);
    estimateGrowth = est.latest?.growth ?? null;
    trend = est.points;
  } catch {
    // no estimate outside market hours
  }

  const percent = estimateGrowth ?? dayGrowth;

  return {
    code,
    name,
    fundKey,
    dayGrowth,
    estimateGrowth,
    percent,
    netValue,
    netValueDate,
    time: trend.length ? trend[trend.length - 1].time : null,
    trend,
    sectors: fund.sectors || [],
  };
}

export async function getFundsQuotes(funds) {
  const results = [];
  const concurrency = 4;
  for (let i = 0; i < funds.length; i += concurrency) {
    const chunk = funds.slice(i, i + concurrency);
    const settled = await Promise.allSettled(chunk.map((f) => getFundQuote(f)));
    settled.forEach((s, idx) => {
      if (s.status === 'fulfilled') results.push(s.value);
      else {
        const f = chunk[idx];
        results.push({
          code: f.code,
          name: f.name || f.code,
          fundKey: f.fundKey || '',
          dayGrowth: null,
          estimateGrowth: null,
          percent: null,
          netValue: null,
          netValueDate: '',
          time: null,
          trend: [],
          sectors: f.sectors || [],
          error: String(s.reason?.message || s.reason),
        });
      }
    });
  }
  return results;
}
