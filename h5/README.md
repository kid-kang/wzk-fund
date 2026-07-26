# WZK Fund · H5

手机端 H5 客户端，信息架构与视觉对齐微信小程序（四 Tab + 二级页）；计算口径与本地配置键与 Web / 小程序互通。

> 计算逻辑与免责声明见仓库根目录 [README.md](../README.md)。

## 功能

| 模块 | 说明 |
|------|------|
| 持仓 | 汇总、列表、迷你走势、黄金、左滑编辑/删除、金额隐藏、约 30s 轮询 |
| 自选 | 列表、FAB 添加、左滑删除、标题「自选(N)」 |
| 行情 | 涨跌家数榜、指数网格 |
| 我的 | 黄金开关、亮暗主题、API 地址/连通探测、配置导入导出 |
| 二级页 | 基金表单、基金走势、黄金设置、金价走势、指数走势 |

## 技术栈

React 19 + TypeScript + Rsbuild + React Router + ECharts + Axios + decimal.js

## 启动

```bash
# 终端 1：代理服务 :8787
cd server
npm install
npm run dev

# 终端 2：H5 :5174
cd h5
npm install
npm run dev
```

浏览器打开 http://127.0.0.1:5174 或 http://localhost:5174 。开发服务器已监听 `0.0.0.0`，同网手机可直接访问电脑局域网 IP（见终端 Network 地址）。

开发环境默认通过 `/api` 代理到 Koa。手机直连后端时，在「我的」将 API 改为电脑 IP（如 `http://192.168.x.x:8787`），客户端会自动拼接 `/api`。

## 本地存储

| 键 | 说明 |
|----|------|
| `wzk-fund-config` | funds / gold / settings（与 Web、小程序互通） |
| `wzk-fund-api-base` | 代理地址（默认走同源 `/api`） |
| `wzk-fund-theme` | `light` / `dark` |
| `holdings_hide_amounts` | 持仓金额是否隐藏 |

## 与小程序 / Web 的关系

| | H5 | 小程序 | Web |
|--|----|--------|-----|
| 形态 | 四 Tab 移动壳 | 四 Tab 移动壳 | 桌面单页看板 |
| 配置存储 | localStorage | wx.storage | localStorage |
| 代理 | `/api` 或可配置主机 | `wzk-fund-api-base` | Rsbuild 代理 |
