# WZK Fund · 微信小程序

原生微信小程序客户端，与仓库内行情代理共用同一计算口径；持仓 / 自选 / 黄金 / 开关保存在本机 `wx.storage`（键名 `wzk-fund-config`）。

> 仅供个人体验，默认不发布上架。计算逻辑与免责声明见仓库根目录 [README.md](../README.md)。更多截图见根目录 [界面预览](../README.md#界面预览)。

## 界面预览

截图目录：[`../screenshot/`](../screenshot/)。更多说明见根目录 [界面预览](../README.md#界面预览)。

| 持仓 | 自选 | 行情 | 板块热搜基金 |
|:---:|:---:|:---:|:---:|
| <img src="../screenshot/IMG_4198.jpg" width="160" alt="持仓" /> | <img src="../screenshot/IMG_4199.jpg" width="160" alt="自选" /> | <img src="../screenshot/IMG_4200.jpg" width="160" alt="行情" /> | <img src="../screenshot/IMG_4201.jpg" width="160" alt="板块热搜基金" /> |

| 基金详情 · 重仓股 | 规模 | 历史净值 | 阶段涨跌 |
|:---:|:---:|:---:|:---:|
| <img src="../screenshot/IMG_4202.jpg" width="160" alt="基金详情 · 重仓股" /> | <img src="../screenshot/IMG_4206.jpg" width="160" alt="基金详情 · 规模" /> | <img src="../screenshot/IMG_4203.jpg" width="160" alt="基金详情 · 历史净值" /> | <img src="../screenshot/IMG_4205.jpg" width="160" alt="基金详情 · 阶段涨跌" /> |

## 功能模块

### Tab 栏（单壳页）

首页为 `pages/main/main`：自定义底栏 + 页内切换内容（**不用**原生 `tabBar` / `wx.switchTab`，避免真机切 Tab 闪白）。

| Tab | 组件 | 说明 |
|-----|------|------|
| 持仓 | `components/tab-holdings` | 基金持仓汇总与列表，可选黄金模块 |
| 自选 | `components/tab-watchlist` | 自选基金列表 |
| 行情 | `components/tab-market` | A 股涨跌家数、涨跌榜、指数网格 |
| 我的 | `components/tab-mine` | 显示开关、主题、API、配置导入导出 |

深色主题下底栏图标与配色会随主题切换。

---

### 持仓

**组件**：`components/tab-holdings`（挂载于壳页）

- **汇总**：基金持仓总金额、当日收益、当日收益率；眼睛图标可隐藏金额（本地键 `holdings_hide_amounts`）
- **列表**：名称（过长跑马灯）、金额、仓位占比、当日盈亏 / 涨跌幅、板块标签（最多 2 个）、净值已确认徽章、迷你估值走势
- **黄金**（可关）：总价值、收益、收益率、实时金价；与基金汇总分开计算
- **交互**：分区标题旁 `+` 添加持仓；左滑编辑 / 删除（删除用系统确认框，避免 canvas 遮挡）；点迷你图进基金走势；点金价进金价走势；点设置进黄金编辑
- **刷新**：约 30s 静默轮询

---

### 自选

**组件**：`components/tab-watchlist`（挂载于壳页）

- 列表：名称、涨跌幅、板块、确认徽章、迷你走势
- 导航标题动态为 `自选(N)`
- 右下角 **FAB `+`** 添加自选；左滑删除
- 点迷你图进基金走势
- 约 30s 静默轮询

---

### 行情

**组件**：`components/tab-market`（挂载于壳页）

- **涨跌榜**：涨幅 / 跌幅侧展示家数与占比（占比按涨跌家数合计，不含平盘）及板块指数前列
- **指数网格**：上证、深证、创业板、北证50、科创50、上证50、沪深300、中证500、纳斯达克100、标普500 等；点卡片进指数走势
- 约 30s 静默轮询

---

### 我的

**组件**：`components/tab-mine`（挂载于壳页）

| 区块 | 功能 |
|------|------|
| 显示 | 黄金持仓开关（控制持仓页黄金模块）；深色主题 |
| 接口 | API Base 输入 / 保存；「探测连通」请求 `/api/health`，状态灯提示 |
| 配置 | **导出**：整份 JSON 到剪贴板；**导入**：从剪贴板读 JSON 写入本地 |

背景水印 `wzk-fund`（Archivo Black）。页底免责声明。无二级页。

---

### 基金表单（二级）

**路径**：`pages/fund-form/fund-form`

| 模式 | 入口 | 字段 |
|------|------|------|
| `hold` | 持仓 `+` / 左滑编辑 | 代码、金额、金额口径（昨日结算 / 今日结算；非交易日限制同计算逻辑） |
| `watch` | 自选 FAB | 仅代码 |

满 6 位代码自动 `resolve` 名称；持仓保存时按确认净值反推份额。编辑时代码可锁定。

---

### 基金走势（二级）

**路径**：`pages/fund-trend/fund-trend`  
**入口**：持仓 / 自选迷你图

- 报头：`代码 · 名称` + 成立时长（如「成立3年2月」）
- 周期胶囊：近3月 / 近1年 / 近3年 / 成立来；下方红绿区间涨跌幅
- 成立不足对应时长则隐藏周期（如未满 3 年无「近3年」）；「成立来」始终保留
- 走势抽稀：近3月按天、近1年约每 4 交易日、近3年约每 7 交易日、成立来按月
- 高低点标注、净值 tooltip、「来财 / 進寶」水印；各周期预取缓存

---

### 黄金设置（二级）

**路径**：`pages/gold-edit/gold-edit`  
**入口**：持仓黄金区设置图标

- 持有克数、成本均价（元/克）
- 「来财」装饰区

---

### 金价走势（二级）

**路径**：`pages/gold-trend/gold-trend`  
**入口**：持仓「实时金价」

- 报头：AU9999 · 沪金99 + 当前金价
- 周期：分时 / 近1月 / 近3月 / 近6月 / 近1年
- 价格轴 + 高低点；切换周期先卸旧图；「来财」水印

---

### 指数走势（二级）

**路径**：`pages/index-trend/index-trend`  
**入口**：行情指数卡片

- 样式对齐基金走势详情（报头、周期胶囊、红绿涨跌、高低点、来财水印）
- 周期：近1月 / 近3月 / 近6月 / 近1年 / 近3年
- tooltip 展示收盘价；各周期预取缓存

---

## 路由关系

```
main（壳页）
 ├─ tab-holdings ─┬─ fund-form（添加/编辑持仓）
 │                ├─ fund-trend
 │                ├─ gold-edit
 │                └─ gold-trend
 ├─ tab-watchlist ─┬─ fund-form（添加自选）
 │                 └─ fund-trend
 ├─ tab-market ──── index-trend
 └─ tab-mine ────── （本页完成配置）
```

## 本地存储

| 键 | 说明 |
|----|------|
| `wzk-fund-config` | `settings` / `funds` / `gold` |
| `wzk-fund-api-base` | 代理地址，默认 `http://127.0.0.1:8787` |
| `wzk-fund-theme` | `light` / `dark` |
| `holdings_hide_amounts` | 持仓金额是否隐藏 |

## 启动与真机

1. 仓库根目录启动代理：`npm run dev:server`（默认 `:8787`）
2. 安装依赖并打包 Vant：

```bash
cd miniprogram
npm install
```

3. 用[微信开发者工具](https://developers.weixin.qq.com/miniprogram/dev/devtools/download.html)导入本目录
4. **详情 → 本地设置 → 不校验合法域名、web-view（…）**
5. 编译运行；「我的」可改 API 并探测连通

真机调试：手机与电脑同一 Wi‑Fi，API 改为电脑局域网 IP（如 `http://192.168.x.x:8787`），防火墙放行 8787。`127.0.0.1` 仅模拟器可用。

## 技术要点

| 项 | 说明 |
|----|------|
| UI | Vant Weapp（swipe-cell / field / switch / empty / toast 等） |
| 图表 | ECharts（`components/ec-canvas` + `ec-line`：spark / trend） |
| 金额精度 | `decimal.js`（对齐支付宝口径） |
| 主题 | `utils/theme.js` 同步原生导航栏与窗口底色（无原生 TabBar） |
| 架构 | 单壳页 `pages/main` + 自定义底栏 + 四个 Tab 组件，页内 `setData` 切换 |

## 目录结构

```
miniprogram/
  app.js|json|wxss
  pages/          # main 壳页 + 5 二级页
  components/     # tab-* / app-tab-bar / ec-canvas / ec-line
  utils/          # api / store / money / chart / theme …
  assets/         # tab 图标等
  package.json    # @vant/weapp
```
