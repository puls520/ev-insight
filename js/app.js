/* ===================================================================
   EV Insight 前端应用（Vue 3 组合式 API，无构建步骤）
   =================================================================== */
const { createApp, ref, reactive, computed, onMounted, nextTick } = Vue;

const VIEW_META = {
  dashboard: ['市场概览', 'KPI、销量走势、品牌份额与价格结构'],
  analysis: ['深度分析', '价格结构、品牌竞争、口碑与参数相关性'],
  cars: ['车型库', '多条件检索与车型详情'],
  forecast: ['趋势预测', '回归与时间序列模型对比评估'],
  recommend: ['智能推荐', '规则引擎 + 大模型个性化推荐'],
  chat: ['AI 助手', '基于系统真实数据的对话问答'],
  crawler: ['数据采集', 'Selenium 动态页面采集与指标监控'],
  about: ['系统与实验', '环境依赖、数据来源、功能对应关系']
};

const charts = {};   // ECharts 实例缓存

const app = createApp({
  setup() {
    /* ---------------- 基础状态 ---------------- */
    const _viewFromHash = () => {
      const key = (location.hash || '').replace('#', '').trim();
      return VIEW_META[key] ? key : 'dashboard';
    };
    const view = ref(_viewFromHash());
    const sys = ref({ config: {}, deps: {}, counts: {}, disclaimer: '', dataset_name: '', seeded_at: '' });
    const loading = reactive({ cars: false, forecast: false, rec: false });
    const loadError = ref('');
    const toast = reactive({ text: '', err: false, show: false });

    /* ---------------- 看板 / 分析 ---------------- */
    const ov = ref({});
    const trend = ref({ months: [], series: [], total: [] });
    const brandShare = ref({ labels: [], values: [], shares: [] });
    const priceHist = ref({ labels: [], counts: [], stats: {} });
    const scatter = ref({ points: [] });
    const topModels = ref([]);
    const ratingDist = ref({ labels: [], counts: [] });
    const corr = ref({ features: [], matrix: [] });
    const brandStats = ref([]);

    /* ---------------- 车型库 ---------------- */
    const filtersData = ref({ brands: [], body_types: [], energy_types: [], usages: [], focus_points: [] });
    const emptyQuery = () => ({ keyword: '', brand: '', energy: '', body: '',
                                price_min: null, price_max: null, range_min: null, sort: 'sales' });
    const q = reactive(emptyQuery());
    const cars = ref({ items: [], total: 0, page: 1, pages: 1 });
    const detail = ref(null);

    /* ---------------- 预测 ---------------- */
    const fTask = ref('sales');
    const fcPayload = ref(null);
    const fpPayload = ref(null);
    const fpModels = ref([]);

    /* ---------------- 推荐 ---------------- */
    const form = reactive({
      budget_min: 15, budget_max: 25, range_min: 500, seats_min: 5,
      usage: ['家庭出行'], focus: ['续航'], energy: [], body: [],
      brand_pref: [], notes: '', use_llm: true
    });
    const brandPick = ref('');
    const rec = ref(null);
    const feedback = reactive({ accuracy: 4, explanation: 4, satisfaction: 4, comment: '' });
    const feedbackStats = ref({ count: 0, accuracy: 0, explanation: 0, satisfaction: 0 });
    const history = ref([]);

    /* ---------------- 采集 ---------------- */
    const crawlForm = reactive({ site: 'mock', pages: 1, strict: false, no_delay: false, save: false });
    const crawlState = ref({ running: false, log: [], result: null });
    const tasks = ref([]);
    const experiment = ref(null);
    const expRunning = ref(false);
    const browserTest = reactive({ running: false, result: null });
    const llmTest = reactive({ running: false, result: null });

    /* ---------------- AI 助手（对话） ---------------- */
    const chatMessages = ref([]);
    const chatInput = ref('');
    const chatSending = ref(false);
    const chatSessionId = ref('');
    const chatLlm = ref(true);
    const quickAsks = [
      '预算20万、续航600以上，家用买什么？',
      '本月销量最好的是哪款？',
      '小米SU7和极氪007怎么选？',
      '小鹏G6的参数和口碑怎么样？',
      '本月市场概况',
      '未来6个月销量预测',
      '比亚迪品牌概况'
    ];

    let pollTimer = null;

    /* ---------------- 工具 ---------------- */
    const viewTitle = computed(() => VIEW_META[view.value][0]);
    const viewDesc = computed(() => VIEW_META[view.value][1]);
    const sourceLabel = computed(() => {
      const src = (sys.value.config && sys.value.config.data_source) || '';
      if (!src || src === 'demo') return '内置演示数据集';
      if (src.indexOf('public') === 0) return '公开数据 · 乘联会 2026';
      if (src.indexOf('selenium') === 0) return 'Selenium 实时采集';
      if (src.indexOf('csv') === 0) return 'CSV 导入数据';
      return src;
    });
    const chatLLMReady = computed(() =>
      !!((sys.value.config && sys.value.config.llm_configured)) && chatLlm.value);

    const bestModel = computed(() => {
      const p = fcPayload.value;
      if (!p || !p.models) return {};
      return p.models.find(m => m.name === p.best) || {};
    });

    function fmtNum(n) {
      if (n === null || n === undefined) return '—';
      n = Number(n);
      if (Math.abs(n) >= 10000) return (n / 10000).toFixed(n >= 100000 ? 0 : 1) + ' 万';
      return n.toLocaleString('zh-CN');
    }

    function fmtInt(n) {
      if (n === null || n === undefined) return '—';
      return Number(n).toLocaleString('zh-CN');
    }

    function showToast(text, err) {
      toast.text = text;
      toast.err = !!err;
      toast.show = true;
      setTimeout(() => { toast.show = false; }, 3200);
    }

    /* ---------------- 静态离线演示模式 ----------------
       执行 scripts/build_static_site.py 后会生成 dist/ev-insight-static/，
       其中的 static-data.js 定义 window.__EV_STATIC_DATA__，
       此时所有接口都从本地数据读取，无需后端、可离线双击打开或上传到任意静态站点。 */
    function staticMode() {
      return !!window.__EV_STATIC_DATA__;
    }

    function staticFilterCars(query) {
      const data = window.__EV_STATIC_DATA__;
      let items = (data.cars_all || []).slice();
      const q = query || {};
      const kw = (q.keyword || '').trim();
      if (kw) {
        items = items.filter(c => (c.brand + c.model_name + (c.tags || []).join('') +
          (c.series || '')).indexOf(kw) >= 0);
      }
      if (q.brand) items = items.filter(c => c.brand === q.brand);
      if (q.energy) items = items.filter(c => c.energy_type === q.energy);
      if (q.body) items = items.filter(c => c.body_type === q.body);
      if (q.price_min) items = items.filter(c => (c.price_max || 0) >= Number(q.price_min));
      if (q.price_max) items = items.filter(c => (c.price_min || 0) <= Number(q.price_max));
      if (q.range_min) items = items.filter(c => (c.range_km || 0) >= Number(q.range_min));
      const sorters = {
        sales: (a, b) => (b.sales || 0) - (a.sales || 0),
        price_asc: (a, b) => (a.price || 0) - (b.price || 0),
        price_desc: (a, b) => (b.price || 0) - (a.price || 0),
        range_desc: (a, b) => (b.range_km || 0) - (a.range_km || 0),
        range_asc: (a, b) => (a.range_km || 0) - (b.range_km || 0),
        rating_desc: (a, b) => (b.rating || 0) - (a.rating || 0),
        accel_asc: (a, b) => (a.accel_0_100 || 99) - (b.accel_0_100 || 99),
        newest: (a, b) => (b.launch_year || 0) - (a.launch_year || 0)
      };
      items.sort(sorters[q.sort] || sorters.sales);
      const size = Math.max(1, Number(q.size) || 12);
      const page = Math.max(1, Number(q.page) || 1);
      return {
        total: items.length, page: page, size: size,
        pages: Math.max(1, Math.ceil(items.length / size)),
        latest_month: data.overview && data.overview.latest_month,
        items: items.slice((page - 1) * size, page * size)
      };
    }

    async function staticApi(path, options) {
      const data = window.__EV_STATIC_DATA__;
      const method = ((options && options.method) || 'GET').toUpperCase();
      const [base, qs] = path.split('?');
      const query = {};
      new URLSearchParams(qs || '').forEach((v, k) => { query[k] = v; });
      await new Promise(r => setTimeout(r, 40));   // 模拟一点点延迟，避免闪烁

      if (method === 'POST') {
        if (base === '/api/recommend') return JSON.parse(JSON.stringify(data.recommend_demo));
        if (base === '/api/chat') {
          return {
            session_id: 'static', engine: 'local-db', latency_ms: 0, fallback: true,
            reply: '这是**静态离线演示版**，没有后端，所以暂时不能进行实时对话。\n' +
              '你能看到的内容包括：市场概览、深度分析、车型库、趋势预测（均为真实数据快照）。\n' +
              '如需完整功能（AI 对话 / 采集 / 重新训练），请在本机运行 python run.py。'
          };
        }
        throw new Error('静态离线演示版不支持该操作（需要后端服务）');
      }
      if (base === '/api/chat/history' || base === '/api/recommend/history') {
        return { session_id: 'static', messages: [], items: [],
                 feedback_stats: { count: 0, accuracy: 0, explanation: 0, satisfaction: 0 } };
      }
      if (base === '/api/forecast') {
        const task = query.task || 'sales';
        return JSON.parse(JSON.stringify(task === 'price' ? data.forecast_price : data.forecast_sales));
      }
      if (base === '/api/cars') return staticFilterCars({ size: query.size, page: query.page,
        keyword: query.keyword, brand: query.brand, energy: query.energy, body: query.body,
        price_min: query.price_min, price_max: query.price_max, range_min: query.range_min,
        sort: query.sort });
      if (base.indexOf('/api/cars/') === 0) {
        const id = base.split('/').pop();
        const detail = (data.car_details || {})[id];
        if (!detail) throw new Error('静态演示版没有该车型快照');
        return JSON.parse(JSON.stringify(detail));
      }
      const map = {
        '/api/system': data.system, '/api/filters': data.filters,
        '/api/overview': data.overview, '/api/analytics': data.analytics,
        '/api/health': data.health, '/api/crawler/tasks': data.crawler_tasks,
        '/api/crawler/status': { running: false, task_id: null, log: [], result: null },
        '/api/crawler/experiment': data.crawler_experiment || { result: null, running: false }
      };
      if (map[base] !== undefined) return JSON.parse(JSON.stringify(map[base]));
      throw new Error('静态离线演示版没有接口 ' + base);
    }
    async function api(path, options, retryLeft) {
      const opts = Object.assign({ headers: { 'Content-Type': 'application/json' } }, options || {});
      if (opts.body && typeof opts.body !== 'string') opts.body = JSON.stringify(opts.body);
      const attempts = retryLeft === undefined ? 1 : retryLeft;
      if (staticMode()) return staticApi(path, options);   // 静态离线演示版
      try {
        const resp = await fetch(path, opts);
        const json = await resp.json().catch(() => ({ ok: false, error: '响应解析失败' }));
        if (!resp.ok || json.ok === false) {
          throw new Error(json.error || ('HTTP ' + resp.status));
        }
        return json.data;
      } catch (err) {
        // 服务刚重启、采集占用等瞬时时，GET 请求自动重试一次
        const method = (opts.method || 'GET').toUpperCase();
        if (attempts > 0 && method === 'GET') {
          await new Promise(r => setTimeout(r, 600));
          return api(path, options, attempts - 1);
        }
        throw err;
      }
    }

    /* ---------------- 图表渲染 ---------------- */
    function paint(id, option) {
      const el = document.getElementById(id);
      if (!el) return;
      let inst = charts[id];
      if (!inst || inst.isDisposed()) {
        inst = echarts.init(el, null, { renderer: 'canvas' });
        charts[id] = inst;
      }
      inst.setOption(option, true);
      inst.resize();
      // 容器此前可能处于隐藏状态（宽度为 0），这里补两次自适应
      requestAnimationFrame(() => { try { inst.resize(); } catch (e) {} });
      setTimeout(() => { try { inst.resize(); } catch (e) {} }, 200);
    }

    function renderView(name) {
      if (name === 'dashboard') {
        paint('trendChart', EVCharts.trend(trend.value));
        paint('shareChart', EVCharts.share(brandShare.value));
        paint('priceChart', EVCharts.priceHist(priceHist.value));
        paint('scatterChart', EVCharts.scatter(scatter.value));
      } else if (name === 'analysis') {
        paint('anaPriceChart', EVCharts.priceHist(priceHist.value));
        paint('brandBarChart', EVCharts.brandBar(brandShare.value));
        paint('groupChart', EVCharts.groupDonut(analyticsGroup.value));
        paint('ratingChart', EVCharts.rating(ratingDist.value));
        paint('corrChart', EVCharts.correlation(corr.value));
      } else if (name === 'forecast') {
        if (fTask.value === 'sales' && fcPayload.value) {
          paint('fcChart', EVCharts.forecast(fcPayload.value));
          paint('holdoutChart', EVCharts.holdout(fcPayload.value));
        } else if (fTask.value === 'price' && fpPayload.value) {
          paint('impChart', EVCharts.importance(fpPayload.value.feature_importance));
          paint('priceScatterChart', EVCharts.priceScatter(fpPayload.value.scatter));
        }
      }
    }
    const analyticsGroup = ref({});

    /* ---------------- 数据加载 ---------------- */
    async function loadSystem() {
      try { sys.value = await api('/api/system'); } catch (e) { showToast(e.message, true); }
    }

    async function loadFilters() {
      try { filtersData.value = await api('/api/filters'); } catch (e) { /* 静默 */ }
    }

    let lastAnalyticsAt = 0;
    async function loadDashboard(notify, force) {
      // 同一会话内 2 分钟内重复进入页面时直接用内存数据，避免重复请求与重绘
      if (!force && ov.value.models && Date.now() - lastAnalyticsAt < 120000) {
        await nextTick();
        renderView(view.value);
        return;
      }
      try {
        const eda = await api('/api/analytics');
        lastAnalyticsAt = Date.now();
        ov.value = eda.overview;
        trend.value = eda.trend;
        brandShare.value = eda.brand_share;
        priceHist.value = eda.price_distribution || eda.price_histogram;
        scatter.value = eda.scatter;
        topModels.value = eda.top_models;
        ratingDist.value = eda.rating_distribution;
        corr.value = eda.correlation;
        brandStats.value = eda.brand_stats;
        analyticsGroup.value = eda.brand_group_share;
        await nextTick();
        if (view.value === 'dashboard') renderView('dashboard');
        if (notify) showToast('数据已刷新');
      } catch (e) { loadError.value = '分析数据加载失败：' + e.message; showToast(loadError.value, true); }
    }

    async function loadCars(page) {
      loading.cars = true;
      try {
        const params = new URLSearchParams();
        Object.keys(q).forEach(k => {
          const v = q[k];
          if (v !== null && v !== '' && v !== undefined) params.set(k, v);
        });
        params.set('page', page || 1);
        params.set('size', 12);
        cars.value = await api('/api/cars?' + params.toString());
      } catch (e) { loadError.value = '车型列表加载失败：' + e.message; showToast(loadError.value, true); }
      finally { loading.cars = false; }
    }

    async function openCar(id) {
      try {
        detail.value = await api('/api/cars/' + id);
        await nextTick();
        paint('detailChart', EVCharts.detailSales(detail.value.sales_series));
      } catch (e) { showToast('详情加载失败：' + e.message, true); }
    }

    function openCarByName(m) {
      if (m && m.id) openCar(m.id);
    }

    function resetQuery() {
      Object.assign(q, emptyQuery());
      loadCars(1);
    }

    async function loadForecast(refresh) {
      loading.forecast = true;
      try {
        const sales = await api('/api/forecast?task=sales' + (refresh ? '&refresh=1' : ''));
        fcPayload.value = sales.payload;
        const price = await api('/api/forecast?task=price' + (refresh ? '&refresh=1' : ''));
        fpPayload.value = price.payload;
        fpModels.value = price.models;
        await nextTick();
        if (view.value === 'forecast') renderView('forecast');
        if (refresh) showToast('模型已重新训练');
      } catch (e) { loadError.value = '预测数据加载失败：' + e.message; showToast(loadError.value, true); }
      finally { loading.forecast = false; }
    }

    function switchForecast(task) {
      fTask.value = task;
      nextTick(() => renderView('forecast'));
    }

    function refreshForecast() { loadForecast(true); }

    /* ---------------- 推荐 ---------------- */
    function toggle(list, value) {
      const i = list.indexOf(value);
      if (i >= 0) list.splice(i, 1); else list.push(value);
    }

    function addBrand() {
      if (brandPick.value && form.brand_pref.indexOf(brandPick.value) < 0) {
        form.brand_pref.push(brandPick.value);
      }
      brandPick.value = '';
    }

    async function runRecommend() {
      if (form.budget_min > form.budget_max) {
        showToast('预算下限不能大于上限', true); return;
      }
      loading.rec = true;
      try {
        rec.value = await api('/api/recommend', { method: 'POST', body: {
          profile: JSON.parse(JSON.stringify(form)), top_k: 5, use_llm: form.use_llm
        }});
        if (rec.value.llm && !rec.value.llm.ok && form.use_llm) {
          showToast('大模型未生效，已使用规则引擎生成推荐');
        }
        await loadHistory();
      } catch (e) { showToast('推荐失败：' + e.message, true); }
      finally { loading.rec = false; }
    }

    async function submitFeedback() {
      if (!rec.value || !rec.value.log_id) { showToast('缺少推荐记录 ID', true); return; }
      try {
        await api('/api/recommend/feedback', { method: 'POST', body: {
          log_id: rec.value.log_id,
          accuracy: feedback.accuracy,
          explanation: feedback.explanation,
          satisfaction: feedback.satisfaction,
          comment: feedback.comment
        }});
        showToast('评价已记录，感谢反馈');
        await loadHistory();
      } catch (e) { showToast('提交失败：' + e.message, true); }
    }

    async function loadHistory() {
      try {
        const data = await api('/api/recommend/history?limit=8');
        history.value = data.items || [];
        feedbackStats.value = data.feedback_stats || feedbackStats.value;
      } catch (e) { /* 静默 */ }
    }

    /* ---------------- 采集 ---------------- */
    async function startCrawl() {
      try {
        await api('/api/crawler/run', { method: 'POST', body: {
          site: crawlForm.site, pages: crawlForm.pages,
          strict: crawlForm.strict, no_delay: crawlForm.no_delay, save: crawlForm.save
        }});
        crawlState.value = { running: true, log: ['任务已提交，正在启动浏览器…'], result: null };
        pollCrawl();
      } catch (e) { showToast('启动失败：' + e.message, true); }
    }

    async function pollCrawl() {
      if (pollTimer) clearInterval(pollTimer);
      pollTimer = setInterval(async () => {
        try {
          const st = await api('/api/crawler/status');
          crawlState.value = { running: st.running, log: st.log || [], result: st.result };
          if (!st.running) {
            clearInterval(pollTimer); pollTimer = null;
            await loadTasks();
            if (st.result && st.result.metrics) {
              showToast('采集完成：成功率 ' + st.result.metrics.success_rate + '%，解析 ' +
                        st.result.metrics.records_unique + ' 条');
            }
            if (crawlForm.save) await loadDashboard();
          }
        } catch (e) { /* 忽略轮询错误 */ }
      }, 1500);
    }

    async function loadTasks() {
      try {
        const data = await api('/api/crawler/tasks?limit=10');
        tasks.value = data.items || [];
        crawlState.value.running = data.running;
        const exp = await api('/api/crawler/experiment');
        if (exp && exp.result) experiment.value = exp.result;
      } catch (e) { showToast('任务列表加载失败：' + e.message, true); }
    }

    async function testLLM() {
      llmTest.running = true;
      llmTest.result = null;
      try {
        llmTest.result = await api('/api/llm/selftest');
        if (llmTest.result.ok) {
          showToast('大模型连接正常：' + (llmTest.result.model_returned || llmTest.result.model));
        } else {
          showToast('大模型不可用，已查看原因', true);
        }
      } catch (e) {
        llmTest.result = { ok: false, error: e.message };
        showToast('自检失败：' + e.message, true);
      } finally {
        llmTest.running = false;
      }
    }

    async function testBrowser() {
      browserTest.running = true;
      browserTest.result = null;
      try {
        browserTest.result = await api('/api/crawler/selftest');
        if (browserTest.result.ok) {
          showToast('浏览器自检通过：' + browserTest.result.browser);
        } else {
          showToast('浏览器自检失败，请查看提示', true);
        }
      } catch (e) {
        browserTest.result = { ok: false, error: e.message, elapsed_s: 0,
                               hint: '请确认服务是否正常运行' };
        showToast('自检请求失败：' + e.message, true);
      } finally {
        browserTest.running = false;
      }
    }

    async function runExperiment() {
      expRunning.value = true;
      try {
        const res = await api('/api/crawler/experiment', { method: 'POST', body: {} });
        experiment.value = res;
        showToast('对照实验完成');
      } catch (e) { showToast('实验失败：' + e.message, true); }
      finally { expRunning.value = false; }
    }

    /* ---------------- AI 助手 ---------------- */
    function renderText(text) {
      const escaped = String(text || '')
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      return escaped
        .replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>')
        .replace(/`([^`]+)`/g, '<code>$1</code>')
        .replace(/\n/g, '<br>');
    }

    function engineLabel(engine) {
      if (engine === 'llm') return '大模型生成';
      if (engine === 'llm-fallback') return '本地数据回答（大模型不可用）';
      if (engine === 'local-db') return '本地数据回答';
      return engine || '';
    }

    function scrollChat() {
      nextTick(() => {
        const el = document.getElementById('chatBody');
        if (el) el.scrollTop = el.scrollHeight;
      });
    }

    function chatGreeting() {
      return {
        role: 'bot',
        greeting: true,
        engine: '',
        content: '你好，我是 EV Insight 购车助手 👋\n' +
          '你可以直接问我：预算/续航/场景怎么选车、某款车的参数和口碑、两款车怎么对比、' +
          '本月销量榜、品牌概况，或未来销量预测。\n' +
          '例如：「预算20万、续航600以上，家用买什么？」'
      };
    }

    async function loadChat() {
      // 支持 ?session=xxx 指定会话（便于演示、分享同一段对话记录）
      const urlSession = new URLSearchParams(location.search).get('session');
      if (urlSession) chatSessionId.value = urlSession;
      if (!chatSessionId.value) {
        chatSessionId.value = 'web-' + Math.random().toString(36).slice(2, 11);
        localStorage.setItem('ev-chat-session', chatSessionId.value);
      }
      try {
        const data = await api('/api/chat/history?session_id=' +
          encodeURIComponent(chatSessionId.value) + '&limit=50');
        chatMessages.value = (data.messages || []).map(m => ({
          role: m.role === 'user' ? 'user' : 'bot',
          content: m.content,
          engine: m.engine,
          latency: m.latency_ms
        }));
      } catch (e) { /* 忽略历史加载失败 */ }
      if (!chatMessages.value.length) chatMessages.value = [chatGreeting()];
      scrollChat();
    }

    async function sendChat(text) {
      const question = String(text !== undefined ? text : chatInput.value || '').trim();
      if (!question || chatSending.value) return;
      chatInput.value = '';
      chatMessages.value.push({ role: 'user', content: question });
      chatSending.value = true;
      scrollChat();
      try {
        const data = await api('/api/chat', {
          method: 'POST',
          body: { message: question, session_id: chatSessionId.value, use_llm: chatLlm.value }
        });
        if (data.session_id) chatSessionId.value = data.session_id;
        chatMessages.value.push({
          role: 'bot', content: data.reply, engine: data.engine, latency: data.latency_ms
        });
      } catch (e) {
        chatMessages.value.push({
          role: 'bot', engine: 'error',
          content: '抱歉，处理失败：' + e.message + '\n请确认服务是否正常运行。'
        });
      } finally {
        chatSending.value = false;
        scrollChat();
      }
    }

    function askQuick(q) {
      sendChat(q);
    }

    function toggleChatLlm() {
      chatLlm.value = !chatLlm.value;
    }

    async function clearChat() {
      try {
        await api('/api/chat/clear', { method: 'POST', body: { session_id: chatSessionId.value } });
      } catch (e) { /* 忽略 */ }
      chatMessages.value = [chatGreeting()];
      showToast('对话已清空');
      scrollChat();
    }

    /* ---------------- 视图切换 ---------------- */
    async function ensureViewData(name) {
      if (name === 'analysis' && !brandStats.value.length) await loadDashboard(false, true);
      if (name === 'cars' && !cars.value.items.length) await loadCars(1);
      if (name === 'forecast' && !fcPayload.value) await loadForecast(false);
      if (name === 'recommend') { if (!filtersData.value.brands.length) await loadFilters(); await loadHistory(); }
      if (name === 'chat') { if (!sys.value.config.version) await loadSystem(); await loadChat(); }
      if (name === 'crawler') await loadTasks();
      if (name === 'about') await loadSystem();
      if (!loadError.value) loadError.value = '';
    }

    async function retryLoad() {
      loadError.value = '';
      await ensureViewData(view.value);
      await nextTick();
      renderView(view.value);
      showToast('已重新加载');
    }

    function go(name) {
      view.value = name;
      // 注意：组件内有一个名为 history 的推荐历史 ref，会遮蔽 window.history，
      // 必须显式使用 window.history，否则 replaceState 会抛错并中断后续加载。
      try {
        if (window.location.hash !== '#' + name) {
          window.history.replaceState(null, '', '#' + name);
        }
      } catch (e) {
        window.location.hash = name;
      }
      ensureViewData(name)
        .catch(err => { loadError.value = '加载失败：' + err.message; })
        .finally(() => nextTick(() => renderView(name)));
      setTimeout(() => renderView(name), 120);
    }

    onMounted(async () => {
      await Promise.all([loadSystem(), loadFilters()]);
      await loadDashboard();
      const initial = view.value;
      if (initial !== 'dashboard') {
        ensureViewData(initial).then(() => nextTick(() => renderView(initial)));
      }
      window.addEventListener('hashchange', () => {
        const target = _viewFromHash();
        if (target !== view.value) go(target);
      });
      setTimeout(() => renderView(initial), 100);
      document.addEventListener('visibilitychange', () => {
        if (!document.hidden) setTimeout(() => renderView(view.value), 60);
      });
      window.addEventListener('focus', () => setTimeout(() => renderView(view.value), 60));
      window.addEventListener('resize', () => {
        Object.keys(charts).forEach(k => { try { charts[k].resize(); } catch (e) {} });
      });
    });

    return {
      view, sys, loading, toast, ov, trend, brandShare, priceHist, scatter, topModels,
      ratingDist, corr, brandStats, filtersData, q, cars, detail, fTask, fcPayload,
      fpPayload, fpModels, bestModel, form, brandPick, rec, feedback, feedbackStats,
      history, crawlForm, crawlState, tasks, experiment, expRunning,
      chatMessages, chatInput, chatSending, chatSessionId, chatLlm, quickAsks, chatLLMReady,
      loadError, retryLoad,
      viewTitle, viewDesc, sourceLabel, fmtNum, fmtInt,
      go, loadDashboard, loadCars, openCar, openCarByName, resetQuery,
      loadForecast, switchForecast, refreshForecast, toggle, addBrand,
      runRecommend, submitFeedback, loadHistory,
      startCrawl, loadTasks, runExperiment, browserTest, testBrowser, llmTest, testLLM,
      renderText, engineLabel, loadChat, sendChat, askQuick, clearChat, toggleChatLlm
    };
  }
});

/* -------------------------------------------------------------------
   渲染兜底：任一视图渲染抛错时给出可操作提示，避免整页白屏。
   最常见原因是浏览器缓存了旧版 app.js（新版模板引用了新函数）。
   ------------------------------------------------------------------- */
app.config.errorHandler = (err, instance, info) => {
  console.error('[EV Insight] 渲染错误:', err, info);
  const host = document.getElementById('app');
  if (host && !host.querySelector('.sidebar')) {
    host.innerHTML =
      '<div style="padding:56px;font-family:-apple-system,\'Microsoft YaHei\',sans-serif;color:#e8eef9">' +
      '<h2 style="margin:0 0 12px">页面渲染出现异常</h2>' +
      '<p style="color:#8fa3bf;line-height:1.9">通常是浏览器缓存了旧版前端文件。' +
      '请按 <b>Ctrl + F5</b> 强制刷新；若仍异常，查看浏览器控制台错误信息。</p>' +
      '<pre style="color:#f87171;white-space:pre-wrap;font-size:12px">' +
      String((err && err.message) || err).replace(/</g, '&lt;') + '</pre></div>';
  }
};

app.mount('#app');
