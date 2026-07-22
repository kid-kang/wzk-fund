# WZK Fund · 定制化基金看板

## 模块

| 模块 | 说明 |
|------|------|
| 持仓列表 | 总持仓/总收益、单基金额与收益、涨跌幅、板块、占比、估值走势 |
| 自选基金 | 名称代码、涨跌幅、板块、走势 |
| AU9999 | 国内黄金实时走势，可设持有克数与均价看盈亏 |
| 指数看板 | 上证/深证/创业板/北证50/科创50/上证50/沪深300/中证500/纳斯达克100/标普500 |
| A股大盘 | 涨跌家数 + 行业板块指数涨/跌幅前十 |

基金配置支持本地增删改，数据文件：`data/store.json`。

添加持仓只需「代码 + 金额」，添加自选只需「代码」；名称与板块自动拉取。顶部「配置」可导入/导出完整本地配置；持仓区可开关黄金栏（默认开）。

## API 摘要

- `GET /api/funds/quotes?type=hold|watch`
- `POST /api/funds` / `PUT /api/funds/:code` / `DELETE /api/funds/:code`
- `GET /api/indices`
- `GET /api/indices/:code/history?range=1m|3m|6m|1y|3y`
- `GET /api/market/overview`
- `GET /api/gold` / `PUT /api/gold/config`
- `GET|PUT /api/settings`（如 `showGold`）
- `GET|PUT /api/config`（整包导入导出）


**展示约定**：行情侧以实时涨跌幅为主（指数/板块不强调点位与市值）；持仓金额与收益按你本地填写的持仓金额估算。

## 数据源

- 基金估值/分时：天天基金 fund123（search + estimate intraday）
- 指数 / 板块：东方财富 push2
- 涨跌家数：东财 NXFXB
- AU9999：新浪 `gds_AU9999`（分时优先东财）

## 技术栈

- 前端：Rsbuild + React + Tailwind CSS + Shadcn 风格组件 + ECharts + Axios
- 代理：Node.js + Koa（转发第三方行情，持久化本地基金配置）

## 启动

```bash
# 终端 1：代理服务 :8787
cd server
npm install
npm run dev

# 终端 2：前端 :5173
cd web
npm install
npm run dev
```

浏览器打开 http://127.0.0.1:5173 ，前端通过 `/api` 代理到 Koa。