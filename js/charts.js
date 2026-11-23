/* ===================================================================
   ECharts 图表配置构建器（与 Vue 应用解耦）
   所有函数返回 ECharts option 对象，由 app.js 负责实例化与渲染
   =================================================================== */
(function (global) {
  const PALETTE = ['#22d3ee', '#38bdf8', '#a78bfa', '#34d399', '#fbbf24',
                   '#f472b6', '#fb923c', '#60a5fa', '#4ade80', '#c084fc'];

  const AXIS = {
    axisLine: { lineStyle: { color: '#24354f' } },
    axisTick: { show: false },
    axisLabel: { color: '#8fa3bf', fontSize: 11 },
    splitLine: { lineStyle: { color: 'rgba(36,53,79,.55)' } }
  };
  const TOOLTIP = {
    backgroundColor: 'rgba(14,26,44,.95)',
    borderColor: '#24354f',
    borderWidth: 1,
    textStyle: { color: '#e8eef9', fontSize: 12 },
    extraCssText: 'box-shadow:0 8px 24px rgba(0,0,0,.4);border-radius:8px;'
  };
  const GRID = { left: 52, right: 22, top: 36, bottom: 34, containLabel: true };
  /** 轴配置合并：先应用通用轴样式，再叠加个性化设置（避免被覆盖） */
  function ax(extra) { return Object.assign({}, AXIS, extra || {}); }
  const LEGEND = { type: 'scroll', textStyle: { color: '#8fa3bf', fontSize: 11 }, icon: 'roundRect',
                   itemWidth: 10, itemHeight: 6, itemGap: 12, top: 2, pageIconSize: 9 };

  function base(extra) {
    return Object.assign({
      color: PALETTE,
      backgroundColor: 'transparent',
      textStyle: { fontFamily: '-apple-system,"Microsoft YaHei",sans-serif' },
      tooltip: Object.assign({}, TOOLTIP),
      legend: Object.assign({}, LEGEND),
      grid: Object.assign({}, GRID)
    }, extra || {});
  }

  const fmtWan = v => (v === null || v === undefined) ? '—' : (v + ' 万');

  const EVCharts = {
    /* ---------------- 月度销量走势 ---------------- */
    trend(d) {
      if (!d || !d.months || !d.months.length) return base({ title: emptyTitle() });
      const series = [{
        name: '整体销量', type: 'line', smooth: true, symbol: 'circle', symbolSize: 6,
        data: d.total, lineStyle: { width: 3, color: '#22d3ee' },
        itemStyle: { color: '#22d3ee' },
        areaStyle: {
          color: {
            type: 'linear', x: 0, y: 0, x2: 0, y2: 1,
            colorStops: [{ offset: 0, color: 'rgba(34,211,238,.35)' },
                         { offset: 1, color: 'rgba(34,211,238,0)' }]
          }
        }
      }];
      (d.series || []).forEach((s, i) => {
        series.push({
          name: s.name, type: 'line', smooth: true, symbol: 'none',
          data: s.data, lineStyle: { width: 1.6, opacity: .85 },
          itemStyle: { color: PALETTE[(i + 1) % PALETTE.length] }
        });
      });
      return base({
        tooltip: Object.assign({}, TOOLTIP, { trigger: 'axis' }),
        legend: Object.assign({}, LEGEND, { data: ['整体销量'].concat((d.series || []).map(s => s.name)) }),
        grid: Object.assign({}, GRID, { top: 40 }),
        xAxis: Object.assign({ type: 'category', data: d.months, boundaryGap: false }, AXIS),
        yAxis: Object.assign({ type: 'value', name: '辆/月', nameTextStyle: { color: '#8fa3bf', fontSize: 11 } }, AXIS),
        series: series
      });
    },

    /* ---------------- 品牌份额 ---------------- */
    share(d) {
      if (!d || !d.labels || !d.labels.length) return base({ title: emptyTitle() });
      return base({
        tooltip: Object.assign({}, TOOLTIP, { trigger: 'item', formatter: '{b}<br/>{c} 辆 ({d}%)' }),
        legend: Object.assign({}, LEGEND, { type: 'scroll', orient: 'vertical', right: 6, top: 'middle', height: 190 }),
        series: [{
          type: 'pie', radius: ['42%', '68%'], center: ['38%', '52%'],
          avoidLabelOverlap: true, itemStyle: { borderColor: '#0b1526', borderWidth: 2 },
          label: { show: false }, labelLine: { show: false },
          emphasis: { label: { show: true, color: '#e8eef9', fontSize: 12, fontWeight: 600, formatter: '{b}\n{d}%' } },
          data: d.labels.map((name, i) => ({ name, value: d.values[i] }))
        }]
      });
    },

    /* ---------------- 价格分布 ---------------- */
    priceHist(d) {
      if (!d || !d.labels) return base({ title: emptyTitle() });
      return base({
        tooltip: Object.assign({}, TOOLTIP, { trigger: 'axis', formatter: p => `${p[0].name}<br/>车型数：${p[0].value} 款` }),
        grid: Object.assign({}, GRID, { top: 24 }),
        xAxis: ax({ type: 'category', data: d.labels,
                    axisLabel: { color: '#8fa3bf', fontSize: 10, interval: 0 } }),
        yAxis: Object.assign({ type: 'value', name: '车型数' , nameTextStyle: { color: '#8fa3bf', fontSize: 11 } }, AXIS),
        series: [{
          type: 'bar', data: d.counts, barWidth: '52%',
          itemStyle: {
            borderRadius: [6, 6, 0, 0],
            color: {
              type: 'linear', x: 0, y: 0, x2: 0, y2: 1,
              colorStops: [{ offset: 0, color: '#22d3ee' }, { offset: 1, color: 'rgba(37,99,235,.55)' }]
            }
          },
          label: { show: true, position: 'top', color: '#b7c6dc', fontSize: 11 }
        }]
      });
    },

    /* ---------------- 价格—续航散点 ---------------- */
    scatter(d) {
      if (!d || !d.points || !d.points.length) return base({ title: emptyTitle() });
      const groups = {};
      d.points.forEach(p => {
        const k = p.energy || '其他';
        (groups[k] = groups[k] || []).push({ value: p.value, name: p.name, brand: p.brand, body: p.body });
      });
      const series = Object.keys(groups).map((k, i) => ({
        name: k, type: 'scatter', symbolSize: 9,
        itemStyle: { color: PALETTE[i % PALETTE.length], opacity: .82,
                     borderColor: 'rgba(10,17,32,.6)', borderWidth: 1 },
        emphasis: { scale: 1.4, itemStyle: { opacity: 1 } },
        tooltip: { formatter: p => `<b>${p.data.name}</b><br/>价格：${p.value[0]} 万<br/>续航：${p.value[1]} km<br/>车身：${p.data.body || '—'}` },
        data: groups[k]
      }));
      return base({
        tooltip: Object.assign({}, TOOLTIP, { trigger: 'item' }),
        legend: Object.assign({}, LEGEND, { data: Object.keys(groups), top: 'auto', bottom: 0 }),
        grid: Object.assign({}, GRID, { top: 30, bottom: 56 }),
        xAxis: Object.assign({ type: 'value', name: '指导价（万元）', nameTextStyle: { color: '#8fa3bf', fontSize: 11 },
                               scale: true }, AXIS),
        yAxis: Object.assign({ type: 'value', name: 'CLTC 续航（km）', nameTextStyle: { color: '#8fa3bf', fontSize: 11 },
                               scale: true }, AXIS),
        series: series
      });
    },

    /* ---------------- 评分分布 ---------------- */
    rating(d) {
      if (!d || !d.labels) return base({ title: emptyTitle() });
      return base({
        tooltip: Object.assign({}, TOOLTIP, { trigger: 'axis' }),
        xAxis: Object.assign({ type: 'category', data: d.labels }, AXIS),
        yAxis: Object.assign({ type: 'value', name: '车型数', nameTextStyle: { color: '#8fa3bf', fontSize: 11 } }, AXIS),
        series: [{
          type: 'bar', data: d.counts, barWidth: '46%',
          itemStyle: { borderRadius: [6, 6, 0, 0],
            color: { type: 'linear', x: 0, y: 0, x2: 0, y2: 1,
                     colorStops: [{ offset: 0, color: '#a78bfa' }, { offset: 1, color: 'rgba(167,139,250,.25)' }] } },
          label: { show: true, position: 'top', color: '#b7c6dc', fontSize: 11 }
        }]
      });
    },

    /* ---------------- 品牌销量对比（横向柱） ---------------- */
    brandBar(d) {
      if (!d || !d.labels || !d.labels.length) return base({ title: emptyTitle() });
      const items = d.labels.map((name, i) => ({ name, value: d.values[i], share: d.shares[i] }))
                            .sort((a, b) => a.value - b.value);
      return base({
        tooltip: Object.assign({}, TOOLTIP, { trigger: 'axis', axisPointer: { type: 'shadow' },
          formatter: p => `${p[0].name}<br/>销量：${p[0].value} 辆<br/>份额：${p[0].data.share}%` }),
        legend: { show: false },
        grid: Object.assign({}, GRID, { left: 10, right: 40 }),
        xAxis: Object.assign({ type: 'value', name: '辆/月', nameTextStyle: { color: '#8fa3bf', fontSize: 11 } }, AXIS),
        yAxis: Object.assign({ type: 'category', data: items.map(i => i.name) }, AXIS),
        series: [{
          type: 'bar', data: items, barWidth: '58%',
          itemStyle: { borderRadius: [0, 6, 6, 0],
            color: { type: 'linear', x: 0, y: 0, x2: 1, y2: 0,
                     colorStops: [{ offset: 0, color: 'rgba(37,99,235,.55)' }, { offset: 1, color: '#22d3ee' }] } },
          label: { show: true, position: 'right', color: '#b7c6dc', fontSize: 11,
                   formatter: p => p.data.share + '%' }
        }]
      });
    },

    /* ---------------- 品牌阵营份额 ---------------- */
    groupDonut(d) {
      if (!d || !d.items || !d.items.length) return base({ title: emptyTitle() });
      return base({
        tooltip: Object.assign({}, TOOLTIP, { trigger: 'item', formatter: '{b}<br/>{c} 辆 ({d}%)' }),
        legend: Object.assign({}, LEGEND, { bottom: 0, top: 'auto' }),
        series: [{
          type: 'pie', radius: ['46%', '70%'], center: ['50%', '46%'],
          itemStyle: { borderColor: '#0b1526', borderWidth: 2 },
          label: { color: '#b7c6dc', fontSize: 11, formatter: '{b}\n{d}%' },
          labelLine: { lineStyle: { color: '#31486b' } },
          data: d.items.map(i => ({ name: i.name, value: i.value }))
        }]
      });
    },

    /* ---------------- 相关性热力图 ---------------- */
    correlation(d) {
      if (!d || !d.features || !d.features.length) return base({ title: emptyTitle() });
      const data = [];
      for (let i = 0; i < d.features.length; i++) {
        for (let j = 0; j < d.features.length; j++) {
          data.push([j, i, d.matrix[i][j]]);
        }
      }
      return base({
        tooltip: Object.assign({}, TOOLTIP, { position: 'top',
          formatter: p => `${d.features[p.value[1]]} × ${d.features[p.value[0]]}<br/>r = ${p.value[2]}` }),
        legend: { show: false },
        grid: Object.assign({}, GRID, { top: 20, bottom: 70, left: 70 }),
        xAxis: Object.assign({ type: 'category', data: d.features, splitArea: { show: true } }, AXIS),
        yAxis: Object.assign({ type: 'category', data: d.features, splitArea: { show: true } }, AXIS),
        visualMap: {
          min: -1, max: 1, calculable: true, orient: 'horizontal', left: 'center', bottom: 8,
          inRange: { color: ['#f87171', '#fbbf24', '#1b2a44', '#38bdf8', '#22d3ee'] },
          textStyle: { color: '#8fa3bf', fontSize: 11 }, itemWidth: 10, itemHeight: 70
        },
        series: [{
          type: 'heatmap', data,
          label: { show: true, color: '#e8eef9', fontSize: 10,
                   formatter: p => (p.value[2] === null ? '' : p.value[2].toFixed(2)) },
          itemStyle: { borderColor: '#0b1526', borderWidth: 1 },
          emphasis: { itemStyle: { shadowBlur: 10, shadowColor: 'rgba(0,0,0,.5)' } }
        }]
      });
    },

    /* ---------------- 销量预测（历史 + 预测 + 置信带） ---------------- */
    forecast(p) {
      if (!p || !p.months) return base({ title: emptyTitle() });
      const hist = p.history || [];
      const M = p.months.length;
      const x = p.months.concat(p.forecast_months || []);
      const padN = (p.forecast_months || []).length;

      const histData = hist.concat(new Array(padN).fill(null));
      const fcData = new Array(Math.max(0, M - 1)).fill(null)
        .concat([hist[hist.length - 1]]).concat(p.forecast || []);
      const lower = new Array(Math.max(0, M - 1)).fill(null)
        .concat([hist[hist.length - 1]]).concat(p.lower || []);
      const upper = new Array(Math.max(0, M - 1)).fill(null)
        .concat([hist[hist.length - 1]]).concat(p.upper || []);
      const diff = upper.map((v, i) => (v === null || lower[i] === null) ? null : v - lower[i]);

      return base({
        tooltip: Object.assign({}, TOOLTIP, { trigger: 'axis' }),
        legend: Object.assign({}, LEGEND, { data: ['历史销量', '预测销量', '95% 置信区间'] }),
        grid: Object.assign({}, GRID, { bottom: 46 }),
        xAxis: Object.assign({ type: 'category', data: x, boundaryGap: false }, AXIS),
        yAxis: Object.assign({ type: 'value', name: '辆/月', nameTextStyle: { color: '#8fa3bf', fontSize: 11 } }, AXIS),
        series: [
          { name: '置信下限', type: 'line', stack: 'conf', data: lower, symbol: 'none',
            lineStyle: { opacity: 0 }, areaStyle: { opacity: 0 }, tooltip: { show: false }, legendHoverLink: false },
          { name: '95% 置信区间', type: 'line', stack: 'conf', data: diff, symbol: 'none',
            lineStyle: { opacity: 0 }, areaStyle: { color: 'rgba(34,211,238,.18)' }, tooltip: { show: false },
            legendHoverLink: false },
          { name: '历史销量', type: 'line', data: histData, smooth: true, symbol: 'circle', symbolSize: 4,
            lineStyle: { width: 2.4, color: '#38bdf8' }, itemStyle: { color: '#38bdf8' },
            areaStyle: { color: { type: 'linear', x: 0, y: 0, x2: 0, y2: 1,
              colorStops: [{ offset: 0, color: 'rgba(56,189,248,.28)' }, { offset: 1, color: 'rgba(56,189,248,0)' }] } } },
          { name: '预测销量', type: 'line', data: fcData, smooth: true, symbol: 'circle', symbolSize: 6,
            lineStyle: { width: 2.6, type: 'dashed', color: '#22d3ee' }, itemStyle: { color: '#22d3ee' },
            markLine: { silent: true, symbol: 'none', lineStyle: { color: 'rgba(250,204,21,.5)', type: 'dotted' },
                        label: { color: '#fbbf24', fontSize: 11, formatter: '预测起点' },
                        data: [{ xAxis: M - 1 }] } }
        ]
      });
    },

    /* ---------------- 留出集验证对比 ---------------- */
    holdout(p) {
      if (!p || !p.holdout_months) return base({ title: emptyTitle() });
      const series = [{
        name: '实际值', type: 'line', data: p.holdout_actual, smooth: true, symbol: 'circle', symbolSize: 7,
        lineStyle: { width: 3, color: '#f8fafc' }, itemStyle: { color: '#f8fafc' }
      }];
      Object.keys(p.holdout_pred || {}).forEach((k, i) => {
        series.push({
          name: k, type: 'line', data: p.holdout_pred[k], smooth: true, symbol: 'circle', symbolSize: 5,
          lineStyle: { width: 1.8, type: 'dashed' }, itemStyle: { color: PALETTE[(i + 1) % PALETTE.length] }
        });
      });
      return base({
        tooltip: Object.assign({}, TOOLTIP, { trigger: 'axis' }),
        legend: Object.assign({}, LEGEND, { type: 'scroll' }),
        xAxis: Object.assign({ type: 'category', data: p.holdout_months, boundaryGap: false }, AXIS),
        yAxis: Object.assign({ type: 'value', name: '辆', nameTextStyle: { color: '#8fa3bf', fontSize: 11 }, scale: true }, AXIS),
        series
      });
    },

    /* ---------------- 特征重要性 ---------------- */
    importance(d) {
      if (!d || !d.length) return base({ title: emptyTitle() });
      const items = d.slice().reverse();
      return base({
        tooltip: Object.assign({}, TOOLTIP, { trigger: 'axis', axisPointer: { type: 'shadow' },
          formatter: p => `${p[0].name}<br/>重要性占比：${p[0].value}%` }),
        legend: { show: false },
        grid: Object.assign({}, GRID, { left: 10, right: 46 }),
        xAxis: Object.assign({ type: 'value', name: '%', nameTextStyle: { color: '#8fa3bf', fontSize: 11 } }, AXIS),
        yAxis: Object.assign({ type: 'category', data: items.map(i => i.name) }, AXIS),
        series: [{
          type: 'bar', data: items.map(i => i.value), barWidth: '56%',
          itemStyle: { borderRadius: [0, 6, 6, 0],
            color: { type: 'linear', x: 0, y: 0, x2: 1, y2: 0,
                     colorStops: [{ offset: 0, color: 'rgba(167,139,250,.45)' }, { offset: 1, color: '#a78bfa' }] } },
          label: { show: true, position: 'right', color: '#b7c6dc', fontSize: 11, formatter: '{c}%' }
        }]
      });
    },

    /* ---------------- 价格预测散点 ---------------- */
    priceScatter(d) {
      if (!d || !d.length) return base({ title: emptyTitle() });
      const mn = Math.min.apply(null, d.map(i => Math.min(i.value[0], i.value[1])));
      const mx = Math.max.apply(null, d.map(i => Math.max(i.value[0], i.value[1])));
      return base({
        tooltip: Object.assign({}, TOOLTIP, { trigger: 'item',
          formatter: p => `<b>${p.data.name}</b><br/>实际：${p.value[0]} 万<br/>预测：${p.value[1]} 万` }),
        legend: { show: false },
        grid: Object.assign({}, GRID, { bottom: 42 }),
        xAxis: Object.assign({ type: 'value', name: '实际价格（万元）', min: Math.floor(mn - 2), max: Math.ceil(mx + 2),
                               nameTextStyle: { color: '#8fa3bf', fontSize: 11 } }, AXIS),
        yAxis: Object.assign({ type: 'value', name: '预测价格（万元）', min: Math.floor(mn - 2), max: Math.ceil(mx + 2),
                               nameTextStyle: { color: '#8fa3bf', fontSize: 11 } }, AXIS),
        series: [{
          type: 'scatter', symbolSize: 10,
          itemStyle: { color: '#22d3ee', opacity: .8, borderColor: 'rgba(10,17,32,.6)' },
          data: d
        }, {
          type: 'line', symbol: 'none', silent: true,
          lineStyle: { color: 'rgba(248,250,252,.25)', type: 'dashed', width: 1 },
          data: [[Math.floor(mn - 2), Math.floor(mn - 2)], [Math.ceil(mx + 2), Math.ceil(mx + 2)]]
        }]
      });
    },

    /* ---------------- 单车型销量走势 ---------------- */
    detailSales(series) {
      if (!series || !series.length) return base({ title: emptyTitle() });
      return base({
        tooltip: Object.assign({}, TOOLTIP, { trigger: 'axis' }),
        legend: { show: false },
        grid: Object.assign({}, GRID, { top: 18, left: 10, right: 16 }),
        xAxis: ax({ type: 'category', data: series.map(s => s.month), boundaryGap: false,
                    axisLabel: { color: '#8fa3bf', fontSize: 10, hideOverlap: true } }),
        yAxis: Object.assign({ type: 'value' }, AXIS),
        series: [{
          type: 'line', data: series.map(s => s.sales), smooth: true, symbol: 'none',
          lineStyle: { width: 2.4, color: '#34d399' },
          areaStyle: { color: { type: 'linear', x: 0, y: 0, x2: 0, y2: 1,
            colorStops: [{ offset: 0, color: 'rgba(52,211,153,.35)' }, { offset: 1, color: 'rgba(52,211,153,0)' }] } }
        }]
      });
    }
  };

  function emptyTitle() {
    return { text: '暂无数据', left: 'center', top: 'middle',
             textStyle: { color: '#5c7192', fontSize: 13, fontWeight: 400 } };
  }

  EVCharts.PALETTE = PALETTE;
  global.EVCharts = EVCharts;
})(window);
