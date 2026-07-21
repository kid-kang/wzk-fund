import axios from 'axios';
import iconv from 'iconv-lite';

const ua =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36';

function parseSinaGold(text) {
  const m = text.match(/hq_str_gds_AU9999="([^"]*)"/);
  if (!m || !m[1]) return null;
  const parts = m[1].split(',');
  // 字段：最新价, ?, 昨收/参考, 高, ?, 低, 时间, ..., 日期, 名称
  const price = parseFloat(parts[0]);
  const prevClose = parseFloat(parts[2]);
  const high = parseFloat(parts[3]);
  const low = parseFloat(parts[5]);
  const time = parts[6] || '';
  const date = parts[12] || '';
  const name = parts[13] || 'AU9999';
  const percent =
    Number.isFinite(price) && Number.isFinite(prevClose) && prevClose !== 0
      ? ((price - prevClose) / prevClose) * 100
      : null;
  const change =
    Number.isFinite(price) && Number.isFinite(prevClose) ? price - prevClose : null;

  return {
    code: 'AU9999',
    name: name.includes('金') ? 'AU9999 沪金99' : 'AU9999',
    price: Number.isFinite(price) ? price : null,
    prevClose: Number.isFinite(prevClose) ? prevClose : null,
    high: Number.isFinite(high) ? high : null,
    low: Number.isFinite(low) ? low : null,
    change,
    percent,
    time: date ? `${date} ${time}` : time,
  };
}

async function fetchQuote() {
  const res = await axios.get('https://hq.sinajs.cn/list=gds_AU9999', {
    timeout: 10000,
    responseType: 'arraybuffer',
    headers: {
      'User-Agent': ua,
      Referer: 'https://finance.sina.com.cn/',
    },
  });
  const text = iconv.decode(Buffer.from(res.data), 'gbk');
  const quote = parseSinaGold(text);
  if (!quote) throw new Error('解析 AU9999 行情失败');
  return quote;
}

async function fetchTrend() {
  // 优先东财分时；失败则用金投网分时近似
  const hosts = [
    'https://push2his.eastmoney.com',
    'https://push2delay.eastmoney.com',
    'https://push2.eastmoney.com',
  ];

  for (const host of hosts) {
    try {
      const res = await axios.get(`${host}/api/qt/stock/trends2/get`, {
        timeout: 10000,
        headers: { 'User-Agent': ua, Referer: 'https://quote.eastmoney.com/' },
        params: {
          fields1: 'f1,f2,f3,f4,f5,f6,f7,f8,f9,f10,f11,f12,f13',
          fields2: 'f51,f52,f53,f54,f55,f56,f57,f58',
          ndays: 1,
          iscr: 0,
          secid: '118.AU9999',
        },
      });
      const trends = res.data?.data?.trends || [];
      if (!trends.length) continue;
      const preClose = parseFloat(res.data?.data?.preClosePrice);
      return trends.map((line) => {
        const [dt, , price] = line.split(',');
        const p = parseFloat(price);
        const time = (dt || '').split(' ')[1] || dt;
        const percent =
          Number.isFinite(p) && Number.isFinite(preClose) && preClose
            ? ((p - preClose) / preClose) * 100
            : null;
        return { time, price: p, percent };
      });
    } catch {
      // try next
    }
  }

  try {
    const res = await axios.get('https://api.jijinhao.com/sQuoteCenter/todayMin.htm', {
      timeout: 10000,
      headers: { 'User-Agent': ua, Referer: 'https://quote.cngold.org/' },
      params: { code: 'JO_71', isCalc: true },
    });
    const json = JSON.parse(String(res.data).replace('var hq_str_ml = ', ''));
    const points = (json.data || [])
      .filter((x) => x.price != null && x.price !== -1)
      .map((x) => ({
        time: x.time || new Date(x.date).toTimeString().slice(0, 5),
        price: round2(x.price),
        percent: null,
      }));
    if (points.length) {
      const base = points[0].price;
      return points.map((p) => ({
        ...p,
        percent: base ? ((p.price - base) / base) * 100 : null,
      }));
    }
  } catch {
    // ignore
  }

  return [];
}

function round2(n) {
  return Math.round(Number(n) * 100) / 100;
}

export async function getGoldRealtime({ holding = 0, avgPrice = 0 } = {}) {
  const [quote, trend] = await Promise.all([fetchQuote(), fetchTrend()]);

  const hold = Number(holding) || 0;
  const avg = Number(avgPrice) || 0;
  let pnl = null;
  let pnlPercent = null;
  if (hold > 0 && avg > 0 && quote.price != null) {
    pnl = (quote.price - avg) * hold;
    pnlPercent = ((quote.price - avg) / avg) * 100;
  }

  return {
    ...quote,
    trend,
    holding: hold,
    avgPrice: avg,
    pnl: pnl == null ? null : round2(pnl),
    pnlPercent: pnlPercent == null ? null : round2(pnlPercent),
  };
}
