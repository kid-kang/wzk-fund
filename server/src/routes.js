import Router from '@koa/router';
import {
  listFunds,
  upsertFund,
  updateFund,
  deleteFund,
  getGoldConfig,
  updateGoldConfig,
} from './store.js';
import { searchFund, getFundsQuotes, getFundQuote } from './services/fund.js';
import { getIndices, getMarketOverview } from './services/market.js';
import { getGoldRealtime } from './services/gold.js';

const router = new Router({ prefix: '/api' });

function calcHoldings(localFunds, quotes) {
  const quoteMap = new Map(quotes.map((q) => [q.code, q]));
  const rows = [];
  let totalAmount = 0;
  let totalPnl = 0;

  for (const f of localFunds) {
    const q = quoteMap.get(f.code) || {};
    const percent = q.percent ?? q.estimateGrowth ?? q.dayGrowth;
    const baseAmount = Number(f.amount) || 0;
    // 以本地持仓金额为昨市值基准：实时持仓≈金额×(1+涨跌幅)
    const liveAmount =
      baseAmount > 0 && percent != null
        ? baseAmount * (1 + percent / 100)
        : baseAmount;
    const pnl =
      baseAmount > 0 && percent != null ? baseAmount * (percent / 100) : 0;

    totalAmount += liveAmount;
    totalPnl += pnl;

    rows.push({
      ...f,
      name: q.name || f.name,
      fundKey: q.fundKey || f.fundKey,
      percent,
      estimateGrowth: q.estimateGrowth,
      dayGrowth: q.dayGrowth,
      time: q.time,
      trend: q.trend || [],
      liveAmount: round2(liveAmount),
      pnl: round2(pnl),
      sectors: f.sectors?.length ? f.sectors : inferSectors(q),
    });
  }

  for (const row of rows) {
    row.weight =
      totalAmount > 0 ? round2((row.liveAmount / totalAmount) * 100) : 0;
  }

  return {
    summary: {
      totalAmount: round2(totalAmount),
      totalPnl: round2(totalPnl),
      totalPnlPercent:
        totalAmount - totalPnl > 0
          ? round2((totalPnl / (totalAmount - totalPnl)) * 100)
          : totalAmount > 0
            ? round2((totalPnl / totalAmount) * 100)
            : 0,
    },
    list: rows.sort((a, b) => (b.percent ?? -999) - (a.percent ?? -999)),
  };
}

function inferSectors(q) {
  return q.sectors || [];
}

function round2(n) {
  return Math.round(Number(n) * 100) / 100;
}

router.get('/health', (ctx) => {
  ctx.body = { ok: true, time: new Date().toISOString() };
});

router.get('/funds', (ctx) => {
  const type = ctx.query.type;
  ctx.body = { success: true, data: listFunds({ type }) };
});

router.get('/funds/search', async (ctx) => {
  try {
    const code = ctx.query.code;
    if (!code) {
      ctx.status = 400;
      ctx.body = { success: false, message: '缺少 code' };
      return;
    }
    const data = await searchFund(code);
    ctx.body = { success: true, data };
  } catch (e) {
    ctx.status = 400;
    ctx.body = { success: false, message: e.message };
  }
});

router.get('/funds/quotes', async (ctx) => {
  try {
    const type = ctx.query.type; // hold | watch | all
    const funds = listFunds({
      type: type === 'all' || !type ? undefined : type,
    });
    const quotes = await getFundsQuotes(funds);

    if (type === 'hold') {
      ctx.body = { success: true, data: calcHoldings(funds, quotes) };
      return;
    }

    if (type === 'watch') {
      const quoteMap = new Map(quotes.map((q) => [q.code, q]));
      const list = funds.map((f) => {
        const q = quoteMap.get(f.code) || {};
        return {
          ...f,
          name: q.name || f.name,
          percent: q.percent ?? q.estimateGrowth ?? q.dayGrowth,
          estimateGrowth: q.estimateGrowth,
          dayGrowth: q.dayGrowth,
          time: q.time,
          trend: q.trend || [],
          sectors: f.sectors || [],
        };
      });
      ctx.body = {
        success: true,
        data: {
          list: list.sort((a, b) => (b.percent ?? -999) - (a.percent ?? -999)),
        },
      };
      return;
    }

    ctx.body = { success: true, data: { quotes, funds } };
  } catch (e) {
    ctx.status = 500;
    ctx.body = { success: false, message: e.message };
  }
});

router.post('/funds', async (ctx) => {
  try {
    const body = ctx.request.body || {};
    const code = String(body.code || '').trim();
    if (!code) {
      ctx.status = 400;
      ctx.body = { success: false, message: '缺少基金代码' };
      return;
    }

    let meta = {};
    try {
      meta = await searchFund(code);
    } catch (e) {
      if (!body.name) {
        ctx.status = 400;
        ctx.body = { success: false, message: e.message || '搜索基金失败' };
        return;
      }
    }

    const saved = upsertFund({
      code: meta.code || code,
      name: body.name || meta.name,
      fundKey: meta.fundKey || body.fundKey,
      type: body.type || 'watch',
      amount: body.amount,
      shares: body.shares,
      sectors: body.sectors,
    });
    ctx.body = { success: true, data: saved };
  } catch (e) {
    ctx.status = 400;
    ctx.body = { success: false, message: e.message };
  }
});

router.put('/funds/:code', async (ctx) => {
  try {
    const patch = ctx.request.body || {};
    const data = updateFund(ctx.params.code, patch);
    ctx.body = { success: true, data };
  } catch (e) {
    ctx.status = 400;
    ctx.body = { success: false, message: e.message };
  }
});

router.delete('/funds/:code', async (ctx) => {
  try {
    deleteFund(ctx.params.code);
    ctx.body = { success: true };
  } catch (e) {
    ctx.status = 400;
    ctx.body = { success: false, message: e.message };
  }
});

router.get('/funds/:code/quote', async (ctx) => {
  try {
    const funds = listFunds();
    const local = funds.find((f) => f.code === ctx.params.code) || {
      code: ctx.params.code,
      name: '',
      fundKey: '',
      sectors: [],
    };
    const data = await getFundQuote(local);
    ctx.body = { success: true, data };
  } catch (e) {
    ctx.status = 500;
    ctx.body = { success: false, message: e.message };
  }
});

router.get('/indices', async (ctx) => {
  try {
    const data = await getIndices();
    ctx.body = { success: true, data };
  } catch (e) {
    ctx.status = 500;
    ctx.body = { success: false, message: e.message };
  }
});

router.get('/market/overview', async (ctx) => {
  try {
    const data = await getMarketOverview();
    ctx.body = { success: true, data };
  } catch (e) {
    ctx.status = 500;
    ctx.body = { success: false, message: e.message };
  }
});

router.get('/gold', async (ctx) => {
  try {
    const cfg = getGoldConfig();
    const data = await getGoldRealtime(cfg);
    ctx.body = { success: true, data };
  } catch (e) {
    ctx.status = 500;
    ctx.body = { success: false, message: e.message };
  }
});

router.put('/gold/config', async (ctx) => {
  try {
    const data = updateGoldConfig(ctx.request.body || {});
    ctx.body = { success: true, data };
  } catch (e) {
    ctx.status = 400;
    ctx.body = { success: false, message: e.message };
  }
});

export default router;
