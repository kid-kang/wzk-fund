import {useEffect, useRef, useState, type ReactNode} from 'react'
import {useSearchParams} from 'react-router-dom'
import '@/styles/fund-qa.css'
import AppNavBar from '@/components/AppNavBar'
import {
  IconCalendar,
  IconCart,
  IconCert,
  IconChart,
  IconClock,
  IconCoin,
  IconFriends,
  IconInfo,
  IconPlus,
  IconWarning,
} from '@/components/icons'
import {getStoredTheme, type AppTheme} from '@/lib/theme'

const QA_IDS = {
  'a-share': true,
  'badge-cn': true,
  'qdii-delay': true,
  'qdii-pnl': true,
  'qdii-buy': true,
  'add-hold': true,
  'async-nav': true,
  'us-time': true,
  'badge-qdii': true,
} as const

type QaId = keyof typeof QA_IDS

function isQaId(q: string): q is QaId {
  return q in QA_IDS
}

type QaItemProps = {
  id: QaId
  openId: string
  onToggle: (id: QaId) => void
  icon: ReactNode
  title: string
  children: ReactNode
}

function QaItem({id, openId, onToggle, icon, title, children}: QaItemProps) {
  const open = openId === id
  return (
    <div id={`qa-${id}`} className={`qa-item${open ? ' is-open' : ''}`}>
      <button type="button" className="qa-q" onClick={() => onToggle(id)}>
        <span className="qa-q-mark" aria-hidden>
          {icon}
        </span>
        <span className="qa-q-text">{title}</span>
        <span className="qa-chevron mono">{open ? '−' : '+'}</span>
      </button>
      {open ? <div className="qa-a">{children}</div> : null}
    </div>
  )
}

export default function FundQaPage() {
  const [params] = useSearchParams()
  const theme: AppTheme = getStoredTheme()
  const iconColor = theme === 'dark' ? '#9aa8ff' : '#4f5dff'
  const warnColor = theme === 'dark' ? '#e8b86d' : '#b8860b'
  const scrollerRef = useRef<HTMLDivElement>(null)

  const q = params.get('q') || ''
  const [openId, setOpenId] = useState(() => (isQaId(q) ? q : ''))

  useEffect(() => {
    const next = isQaId(q) ? q : ''
    setOpenId(next)
    if (!next) return
    const timer = window.setTimeout(() => {
      const el = document.getElementById(`qa-${next}`)
      el?.scrollIntoView({behavior: 'smooth', block: 'start'})
    }, 80)
    return () => window.clearTimeout(timer)
  }, [q])

  const onToggle = (id: QaId) => {
    setOpenId((prev) => (prev === id ? '' : id))
  }

  return (
    <div className={`subpage-root theme-${theme}`}>
      <div className="subpage-nav">
        <AppNavBar title="Q&A" theme={theme} />
      </div>
      <div ref={scrollerRef} className="subpage-scroller" style={{overflowY: 'auto'}}>
        <div className={`page theme-${theme} qa-page`}>
          <QaItem
            id="a-share"
            openId={openId}
            onToggle={onToggle}
            icon={<IconChart size={18} color={iconColor} />}
            title="境内基金的涨跌幅是怎么来的？"
          >
            <span className="qa-p">与支付宝一致，境内偏股基金通常有两条口径：</span>
            <div className="qa-bullets">
              <div className="qa-bullet">
                <div className="qa-ico is-est" aria-hidden>
                  <span className="qa-ico-glyph">估</span>
                </div>
                <div className="qa-bullet-text">
                  <span className="qa-b-title">盘中估值</span>
                  <span className="qa-b-desc">
                    交易时段根据持仓估算，数字会跟着行情动，不是最终官方净值。
                  </span>
                </div>
              </div>
              <div className="qa-bullet">
                <div className="qa-ico is-ok" aria-hidden>
                  <span className="qa-ico-glyph">确</span>
                </div>
                <div className="qa-bullet-text">
                  <span className="qa-b-title">官方确认净值</span>
                  <span className="qa-b-desc">
                    收盘后管理人公布净值与日涨跌幅，才是「确认」口径。持仓上用下方证书图标标出，没有「更新」二字。
                  </span>
                </div>
              </div>
            </div>

            <div className="qa-demo-row">
              <div className="confirmed-badge rise" aria-label="净值已更新示意">
                <IconCert size={12} color="currentColor" />
                <span className="mono">+1.23%</span>
              </div>
              <span className="qa-demo-note">确认态示意：证书图标 + 官方日涨跌幅</span>
            </div>

            <span className="qa-caption">典型时间线（交易日）</span>
            <div className="qa-timeline">
              <div className="qa-tl-item">
                <div className="qa-tl-dot is-est" />
                <div className="qa-tl-card">
                  <span className="qa-tl-time mono">09:30–15:00</span>
                  <span className="qa-tl-title">盘中看估值</span>
                  <span className="qa-tl-desc">
                    右侧涨跌多为估算；当日收益也会跟着估。此时一般没有证书图标。
                  </span>
                </div>
              </div>
              <div className="qa-tl-item">
                <div className="qa-tl-dot is-ok" />
                <div className="qa-tl-card">
                  <span className="qa-tl-time mono">当晚起</span>
                  <span className="qa-tl-title">净值陆续披露</span>
                  <span className="qa-tl-desc">
                    出现官方日涨跌后，切换为确认口径，并出现证书图标。
                  </span>
                </div>
              </div>
              <div className="qa-tl-item">
                <div className="qa-tl-dot is-mute" />
                <div className="qa-tl-card">
                  <span className="qa-tl-time mono">次日 09:15 前</span>
                  <span className="qa-tl-title">证书图标仍保留</span>
                  <span className="qa-tl-desc">
                    确认会话保留到下一交易日开盘前，方便对照昨夜净值。
                  </span>
                </div>
              </div>
            </div>
          </QaItem>

          <QaItem
            id="badge-cn"
            openId={openId}
            onToggle={onToggle}
            icon={<IconCert size={18} color={iconColor} />}
            title="持仓上的证书图标是什么意思？"
          >
            <div className="qa-demo-row">
              <div className="confirmed-badge rise">
                <IconCert size={12} color="currentColor" />
                <span className="mono">+0.86%</span>
              </div>
              <div className="confirmed-badge fall">
                <IconCert size={12} color="currentColor" />
                <span className="mono">-0.42%</span>
              </div>
              <span className="qa-demo-note">与持仓页同款：仅图标（+ 涨跌），无「更新」文字</span>
            </div>
            <span className="qa-p">
              这主要出现在<span className="qa-em">境内基金</span>
              列表：用图标表明当前展示的是最新
              <span className="qa-em">官方确认净值涨跌</span>
              ，且仍在确认窗口内（净值日 → 下一交易日 09:15 前）。
            </span>
            <span className="qa-p">
              图标颜色跟涨跌一致（红涨绿跌）；旁侧数字是官方日涨跌幅。窗口结束后图标消失；盘中有估值时会优先切回估值口径。
            </span>
          </QaItem>

          <QaItem
            id="qdii-delay"
            openId={openId}
            onToggle={onToggle}
            icon={<IconClock size={18} color={iconColor} />}
            title="为什么 QDII · 海外净值总是慢一天？"
          >
            <span className="qa-p">
              持仓里「QDII · 海外」指投向海外、净值延迟披露的品种（多为 QDII）。净值日 T
              的官方净值通常要到 <span className="qa-em">T+1（有的接近 T+2）晚上</span>{' '}
              才披露。白天往往没有可靠「今估值」，只能等官方数。
            </span>
            <div className="qa-callout">
              <IconInfo size={16} color={iconColor} />
              <span className="qa-callout-text">
                本页对 QDII · 海外：有最新官方净值日 +
                涨跌就展示日期徽章，不套用境内「次日 09:15」窗口。
              </span>
            </div>
          </QaItem>

          <QaItem
            id="qdii-pnl"
            openId={openId}
            onToggle={onToggle}
            icon={<IconCoin size={18} color={iconColor} />}
            title="QDII「当日收益」到底怎么算？"
          >
            <span className="qa-p">
              与支付宝一致：有份额时按相邻两期
              <span className="qa-em">官方净值差</span>
              计算，不是盘中实时估。
            </span>
            <div className="qa-formula">
              <span className="qa-formula-label mono">与支付宝同口径</span>
              <span className="qa-formula-main">当日收益 ≈ 份额 ×（最新净值 − 上一净值）</span>
            </div>
            <span className="qa-p">
              对 QDII，「当日」更准确是指：
              <span className="qa-em">最近一次已披露净值变动</span>
              带来的盈亏，不一定是「今天中国交易日盘中」——支付宝里也是同一理解。
            </span>

            <span className="qa-caption">举例：持有 1000 份</span>
            <div className="qa-table">
              <div className="qa-tr is-head">
                <span className="qa-td">中国时间</span>
                <span className="qa-td is-wide">发生了什么</span>
                <span className="qa-td">当日收益</span>
              </div>
              <div className="qa-tr">
                <span className="qa-td mono">周一</span>
                <span className="qa-td is-wide">海外交易中，尚无周一官方净值</span>
                <span className="qa-td">多仍停在上次</span>
              </div>
              <div className="qa-tr">
                <span className="qa-td mono">周二晚</span>
                <span className="qa-td is-wide">披露周一净值 1.28→1.30</span>
                <span className="qa-td is-up mono">+20</span>
              </div>
              <div className="qa-tr">
                <span className="qa-td mono">周三白天</span>
                <span className="qa-td is-wide">周二净值未出</span>
                <span className="qa-td mono">仍约 +20</span>
              </div>
              <div className="qa-tr">
                <span className="qa-td mono">周三晚</span>
                <span className="qa-td is-wide">披露周二净值 1.30→1.33</span>
                <span className="qa-td is-up mono">+30</span>
              </div>
            </div>
            <span className="qa-hint">
              +20 = 1000 × (1.30 − 1.28)；披露一更新，收益才换一版。
            </span>
          </QaItem>

          <QaItem
            id="qdii-buy"
            openId={openId}
            onToggle={onToggle}
            icon={<IconCart size={18} color={iconColor} />}
            title="周一买 QDII，什么时候开始算收益？"
          >
            <span className="qa-p">
              支付宝 15:00
              前下单，申请日算当天；但成交净值往往更晚，份额确认前不算持仓收益。下面以常见美股相关
              QDII、示意 T+2 确认为例（具体以产品页为准）。
            </span>

            <span className="qa-caption">时间线（周一 14:50 提交申购）</span>
            <div className="qa-table">
              <div className="qa-tr is-head">
                <span className="qa-td">北京时间</span>
                <span className="qa-td is-wide">发生了什么</span>
                <span className="qa-td">你的收益</span>
              </div>
              <div className="qa-tr">
                <span className="qa-td mono">周一 14:50</span>
                <span className="qa-td is-wide">提交申购，确认中</span>
                <span className="qa-td">不算</span>
              </div>
              <div className="qa-tr">
                <span className="qa-td mono">周一晚</span>
                <span className="qa-td is-wide">可能披更早净值（老持仓在更新）</span>
                <span className="qa-td">你这笔不算</span>
              </div>
              <div className="qa-tr">
                <span className="qa-td mono">周二晚</span>
                <span className="qa-td is-wide">可能披「周一」净值（多半仍是老持仓）</span>
                <span className="qa-td">你这笔不算</span>
              </div>
              <div className="qa-tr">
                <span className="qa-td mono">周三</span>
                <span className="qa-td is-wide">份额确认，成本按合同净值日锁定</span>
                <span className="qa-td">刚到手</span>
              </div>
              <div className="qa-tr">
                <span className="qa-td mono">周三晚</span>
                <span className="qa-td is-wide">若披露「周二」净值（示意成交日）</span>
                <span className="qa-td">见下方说明</span>
              </div>
              <div className="qa-tr">
                <span className="qa-td mono">周四晚</span>
                <span className="qa-td is-wide">披露「周三」净值，相对上一期有跳变</span>
                <span className="qa-td is-up">开始算</span>
              </div>
            </div>

            <div className="qa-callout">
              <IconInfo size={16} color={iconColor} />
              <span className="qa-callout-text">
                本应用不会在「刚确认 / 尚无新跳变」时把当前日收益显示成
                0。只要本地已录入份额，就会按最新已披露两期官方净值差继续展示收益（与支付宝常见口径一致：跟最新一跳走，而不是人为清零）。
              </span>
            </div>
            <span className="qa-p">
              因此若你在支付宝份额刚确认、下一期净值尚未相对成本走出「新的一跳」时就录入本应用，看板仍可能显示与上一次净值跳变对应的差额收益——这是预期行为，不是
              Bug。
            </span>
            <span className="qa-hint">
              建议：支付宝显示份额已确认、成本锁定后再来「添加持仓」；录入金额请用确认后的持仓金额。
            </span>
          </QaItem>

          <QaItem
            id="async-nav"
            openId={openId}
            onToggle={onToggle}
            icon={<IconFriends size={18} color={iconColor} />}
            title="为什么几只 QDII 日期不一样？"
          >
            <span className="qa-p">
              同一时刻完全可能：有的已更新到较新净值日，有的还停在更早一天——挂钩市场、假期、管理人披露节奏都不同。
            </span>
            <span className="qa-caption">同一时刻看 3 只（示意）</span>
            <div className="qa-chips">
              <div className="qa-chip">
                <span className="qa-chip-name">基金 A</span>
                <span className="qa-chip-date mono">07-31</span>
                <span className="qa-chip-sub">较新 · 周三那一跳</span>
              </div>
              <div className="qa-chip">
                <span className="qa-chip-name">基金 B</span>
                <span className="qa-chip-date mono">07-30</span>
                <span className="qa-chip-sub">仍停在周二</span>
              </div>
              <div className="qa-chip">
                <span className="qa-chip-name">基金 C</span>
                <span className="qa-chip-date mono">07-29</span>
                <span className="qa-chip-sub">更慢 / 假期</span>
              </div>
            </div>
            <div className="qa-formula is-soft">
              <span className="qa-formula-label mono">与支付宝同口径</span>
              <span className="qa-formula-main">组合「当日收益」≈ Σ 每只各自的当日收益</span>
            </div>
            <span className="qa-p">
              加总是一个数，但<span className="qa-em">不是同一个海外交易日</span>
              的收益，而是各基金「最新已披露那一跳」的拼合——支付宝持仓汇总也是这样拼出来的。
            </span>
          </QaItem>

          <QaItem
            id="us-time"
            openId={openId}
            onToggle={onToggle}
            icon={<IconClock size={18} color={iconColor} />}
            title="美股 QDII 一般什么时候披露？"
          >
            <span className="qa-p">
              习惯说 T+1：美东周一行情 → 净值日多为周一 → 常见在{' '}
              <span className="qa-em">北京时间周二晚上约 20:00 之后</span> 陆续看到。
            </span>
            <span className="qa-caption">夏令时对照（示意）</span>
            <div className="qa-table">
              <div className="qa-tr is-head">
                <span className="qa-td is-wide">事件</span>
                <span className="qa-td">美东</span>
                <span className="qa-td">北京时间</span>
              </div>
              <div className="qa-tr">
                <span className="qa-td is-wide">美股周一收盘</span>
                <span className="qa-td mono">周一 16:00</span>
                <span className="qa-td mono">周二约 04:00</span>
              </div>
              <div className="qa-tr">
                <span className="qa-td is-wide">「净值日=周一」披露</span>
                <span className="qa-td mono">周二白天</span>
                <span className="qa-td mono">周二 20:00+</span>
              </div>
            </div>
            <div className="qa-callout">
              <IconWarning size={16} color={warnColor} />
              <span className="qa-callout-text">
                不是「美东周一晚上」就出净值；也不是固定钟点。港股 / 亚太 QDII
                往往比美股相关更早一些。
              </span>
            </div>
          </QaItem>

          <QaItem
            id="badge-qdii"
            openId={openId}
            onToggle={onToggle}
            icon={<IconCalendar size={18} color={iconColor} />}
            title="QDII 上的「07-30」代表什么？"
          >
            <div className="qa-demo-row">
              <div className="confirmed-badge is-disclose rise">
                <span className="mono">07-30</span>
              </div>
              <span className="qa-demo-note">与持仓页同款：只显示净值日，不用证书图标</span>
            </div>
            <span className="qa-p">
              「QDII · 海外」不用境内那枚证书图标，而是直接标
              <span className="qa-em">最新官方净值对应的净值日</span>
              （如 07-30），与右侧官方涨跌同一口径——不是「今天几点刷新」的时钟。
            </span>
            <span className="qa-p">
              收益数字对应的是这一天相对上一净值日的变动；多只基金日期不同时，各自看各自的日期标签即可。
            </span>
          </QaItem>

          <QaItem
            id="add-hold"
            openId={openId}
            onToggle={onToggle}
            icon={<IconPlus size={18} color={iconColor} />}
            title="添加持仓要注意什么？"
          >
            <div className="guide-steps">
              <div className="guide-step">
                <span className="guide-step-num mono">1</span>
                <div className="guide-step-body">
                  <span className="guide-step-title">等支付宝确认完成</span>
                  <span className="guide-step-desc">
                    份额已确认、份额到账、成本锁定后，再录入。确认中不要添加。
                  </span>
                </div>
              </div>
              <div className="guide-step">
                <span className="guide-step-num mono">2</span>
                <div className="guide-step-body">
                  <span className="guide-step-title">填写确认后的持仓金额</span>
                  <span className="guide-step-desc">
                    系统按最新公布净值反算份额；境内 / QDII 都一样。
                  </span>
                </div>
              </div>
              <div className="guide-step">
                <span className="guide-step-num mono">3</span>
                <div className="guide-step-body">
                  <span className="guide-step-title">收益不会因刚录入而变 0</span>
                  <span className="guide-step-desc">
                    本应用跟最新估值或已披露净值跳变计收益，不会在添加当天人为清零。
                  </span>
                </div>
              </div>
            </div>

            <span className="guide-caption">示意：正确时机 vs 过早添加</span>
            <div className="guide-compare">
              <div className="guide-compare-col is-bad">
                <span className="guide-compare-tag">过早</span>
                <div className="guide-compare-bars">
                  <div className="guide-bar is-mute" style={{height: '28%'}} />
                  <div className="guide-bar is-mute" style={{height: '40%'}} />
                  <div className="guide-bar is-warn" style={{height: '72%'}}>
                    <span className="guide-bar-label">确认中</span>
                  </div>
                  <div className="guide-bar is-mute" style={{height: '36%'}} />
                </div>
                <span className="guide-compare-foot">金额未锁定，收益口径容易对不齐</span>
              </div>
              <div className="guide-compare-col is-good">
                <span className="guide-compare-tag">建议</span>
                <div className="guide-compare-bars">
                  <div className="guide-bar is-mute" style={{height: '28%'}} />
                  <div className="guide-bar is-mute" style={{height: '40%'}} />
                  <div className="guide-bar is-ok" style={{height: '56%'}}>
                    <span className="guide-bar-label">已确认</span>
                  </div>
                  <div className="guide-bar is-accent" style={{height: '78%'}}>
                    <span className="guide-bar-label">录入</span>
                  </div>
                </div>
                <span className="guide-compare-foot">成本锁定后再添加，数字可对照支付宝</span>
              </div>
            </div>

            <span className="guide-caption">示意：QDII 周一申购后的时间线</span>
            <div className="guide-timeline">
              <div className="guide-tl-item">
                <div className="guide-tl-dot is-mute" />
                <div className="guide-tl-card">
                  <span className="guide-tl-time mono">周一 15:00 前</span>
                  <span className="guide-tl-title">提交申购</span>
                  <span className="guide-tl-desc">确认中 · 请勿在此添加持仓</span>
                </div>
              </div>
              <div className="guide-tl-item">
                <div className="guide-tl-dot is-mute" />
                <div className="guide-tl-card">
                  <span className="guide-tl-time mono">周一晚 / 周二晚</span>
                  <span className="guide-tl-title">市场披露净值</span>
                  <span className="guide-tl-desc">多半是老持仓在更新，不等于你这笔已成交</span>
                </div>
              </div>
              <div className="guide-tl-item">
                <div className="guide-tl-dot is-ok" />
                <div className="guide-tl-card">
                  <span className="guide-tl-time mono">约周三（示意）</span>
                  <span className="guide-tl-title">份额确认 · 成本锁定</span>
                  <span className="guide-tl-desc">此时起可把确认后金额录入本应用</span>
                </div>
              </div>
              <div className="guide-tl-item">
                <div className="guide-tl-dot is-accent" />
                <div className="guide-tl-card">
                  <span className="guide-tl-time mono">录入之后</span>
                  <span className="guide-tl-title">收益跟最新一跳走</span>
                  <span className="guide-tl-desc">
                    不会显示成 0，而是最新已披露净值差 × 份额
                  </span>
                </div>
              </div>
            </div>

            <div className="guide-formula">
              <span className="guide-formula-label mono">收益口径</span>
              <span className="guide-formula-main">
                当日收益 ≈ 份额 ×（最新净值 − 上一净值）
              </span>
              <span className="guide-formula-sub">
                境内盘中可用估值；QDII 多为官方净值。与支付宝常见算法一致。
              </span>
            </div>

            <div className="guide-example">
              <span className="guide-example-title">数字例子（持有 1000 份）</span>
              <div className="guide-example-row">
                <span className="guide-example-k">上一净值</span>
                <span className="guide-example-v mono">1.20</span>
              </div>
              <div className="guide-example-row">
                <span className="guide-example-k">最新净值</span>
                <span className="guide-example-v mono">1.23</span>
              </div>
              <div className="guide-example-row is-result">
                <span className="guide-example-k">当前日收益</span>
                <span className="guide-example-v mono is-up">+30</span>
              </div>
              <span className="guide-example-note">
                若你刚确认就录入，而最新一跳仍是 1.20→1.23，这里会显示约 +30，而不是
                0——这是预期行为。
              </span>
            </div>
          </QaItem>

          <span className="qa-legal">
            收益口径对齐支付宝常见算法（简化说明）；个别产品若有估值或特殊披露，数字可能略有先后。实际以基金管理人披露与数据源为准；不构成投资建议。
          </span>
        </div>
      </div>
    </div>
  )
}
