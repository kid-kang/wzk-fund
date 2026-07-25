function iconPair(theme, key) {
  if (theme === 'dark') {
    return {
      icon: `/assets/tab/${key}-dark.png`,
      activeIcon: `/assets/tab/${key}-dark-active.png`,
    }
  }
  return {
    icon: `/assets/tab/${key}.png`,
    activeIcon: `/assets/tab/${key}-active.png`,
  }
}

function buildTabs(theme) {
  const keys = [
    {key: 'holdings', text: '持仓'},
    {key: 'watchlist', text: '自选'},
    {key: 'market', text: '行情'},
    {key: 'mine', text: '我的'},
  ]
  return keys.map((item) => Object.assign({}, item, iconPair(theme, item.key)))
}

Component({
  options: {
    styleIsolation: 'apply-shared',
  },

  properties: {
    active: {
      type: String,
      value: 'holdings',
    },
    theme: {
      type: String,
      value: 'light',
    },
  },

  data: {
    tabs: buildTabs('light'),
  },

  observers: {
    theme(theme) {
      this.setData({tabs: buildTabs(theme === 'dark' ? 'dark' : 'light')})
    },
  },

  methods: {
    onTap(e) {
      const key = e.currentTarget.dataset.key
      if (!key || key === this.data.active) return
      this.triggerEvent('change', {key})
    },
  },
})
