const META = {
  watch: {
    code: 'WATCH',
    label: '同步自选簿',
  },
  market: {
    code: 'TAPE',
    label: '同步行情带',
  },
  hold: {
    code: 'BOOK',
    label: '同步持仓簿',
  },
  gold: {
    code: 'GOLD',
    label: '同步金仓',
  },
}

Component({
  options: {
    styleIsolation: 'apply-shared',
  },

  properties: {
    theme: {
      type: String,
      value: 'light',
    },
    /** watch | market | hold | gold */
    variant: {
      type: String,
      value: 'watch',
    },
    /** 自选/行情骨架最小高度（铺满一屏可视区） */
    minHeight: {
      type: Number,
      value: 0,
    },
  },

  data: {
    code: 'WATCH',
    label: '同步自选簿',
    rows: [0, 1, 2, 3, 4],
    holdRows: [0, 1, 2, 3],
    boardCols: [0, 1],
    boardRows: [0, 1, 2, 3],
    indices: [0, 1, 2, 3, 4, 5],
    goldCells: [0, 1, 2, 3],
  },

  observers: {
    variant(variant) {
      const meta = META[variant] || META.watch
      this.setData({
        code: meta.code,
        label: meta.label,
      })
    },
  },

  lifetimes: {
    attached() {
      const meta = META[this.data.variant] || META.watch
      this.setData({
        code: meta.code,
        label: meta.label,
      })
    },
  },
})
