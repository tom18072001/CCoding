// Giao diện CCoding Office: trạng thái thời gian thực qua SSE, giao việc, theo dõi nhiệm vụ, nhân sự, token, nhật ký.
(function () {
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const esc = (s) => window.MD.esc(String(s ?? ''));
  const md = (s) => window.MD.render(s);
  // bỏ ký hiệu Markdown khi hiển thị một dòng (bong bóng, ticker)
  const plain = (s) => String(s ?? '').replace(/\*\*|__|`/g, '').replace(/^\s*[-*]\s+/gm, '').replace(/^#+\s*/gm, '').replace(/\s+/g, ' ').trim();

  // Token truy cập (nếu server đặt CCODING_TOKEN): mở UI với #token=...
  const hashTok = /token=([^&]+)/.exec(location.hash);
  if (hashTok) {
    try { localStorage.setItem('ccoding.token', decodeURIComponent(hashTok[1])); } catch {}
    history.replaceState(null, '', location.pathname);
  }
  let TOKEN = '';
  try { TOKEN = localStorage.getItem('ccoding.token') || ''; } catch {}

  const S = {
    departments: [],
    agents: new Map(),
    tasks: new Map(),
    projects: [],
    usage: { total: {}, byDepartment: [], byAgent: [], byTask: [], byModel: [], byDay: [] },
    runtimes: [],
    defaults: {},
    selectedTask: null,
    taskDetail: null,
    taskView: 'chat',
    taskFile: null,
    selectedAgent: null,
    agentDetail: null,
    logs: [],
    live: new Map(),
    tab: 'assign',
  };

  const PHASES = [
    ['plan', 'Kế hoạch'], ['discuss', 'Thảo luận'], ['execute', 'Thực thi'], ['review', 'Review'], ['synthesize', 'Tổng hợp'],
  ];
  const PHASE_INDEX = { route: -1, plan: 0, discuss: 1, finalize: 1, execute: 2, review: 3, revise: 3, synthesize: 4 };
  const STATUS_VI = { idle: 'rảnh', thinking: 'suy nghĩ', working: 'đang làm', discussing: 'đang họp', reviewing: 'review', waiting: 'chờ', error: 'lỗi' };
  const TASK_VI = { queued: 'chờ', running: 'đang chạy', done: 'xong', failed: 'lỗi', cancelled: 'đã hủy', pending: 'chờ', skipped: 'bỏ qua' };
  const MODE_VI = { auto: 'Tự động', department: 'Theo phòng', project: 'Theo dự án', joint: 'Liên phòng' };
  const KIND_VI = { plan: 'kế hoạch', discussion: 'thảo luận', decision: 'quyết định', handoff: 'bàn giao', review: 'review', final: 'báo cáo', system: 'hệ thống' };
  const CLS_VI = { public: 'Công khai', internal: 'Nội bộ', confidential: 'Bảo mật', restricted: 'Hạn chế' };

  const fmt = (n) => {
    n = Number(n) || 0;
    if (n >= 1e6) return (n / 1e6).toFixed(2) + 'M';
    if (n >= 1e4) return (n / 1e3).toFixed(1) + 'k';
    return n.toLocaleString('vi-VN');
  };
  const usd = (n) => (n > 0 ? '$' + n.toFixed(n < 1 ? 4 : 2) : '—');
  const time = (iso) => (iso ? new Date(iso).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '');
  const dateTime = (iso) => (iso ? new Date(iso).toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' }) : '');
  const total = (u) => (u ? (u.input || 0) + (u.output || 0) + (u.cacheRead || 0) + (u.cacheWrite || 0) : 0);
  const deptName = (id) => (id === 'office' ? 'Điều phối' : S.departments.find((d) => d.id === id)?.name ?? id);
  const deptShort = (id) => (id === 'office' ? 'Điều phối' : S.departments.find((d) => d.id === id)?.short ?? id);
  const deptColor = (id) => (id === 'office' ? '#b91c1c' : S.departments.find((d) => d.id === id)?.color ?? '#64748b');
  const agentName = (id) => S.agents.get(id)?.name ?? (id === 'system' ? 'Hệ thống' : id);

  async function api(path, opts = {}) {
    const headers = { 'content-type': 'application/json', ...(opts.headers || {}) };
    if (TOKEN) headers.authorization = `Bearer ${TOKEN}`;
    const res = await fetch(path, { ...opts, headers });
    const text = await res.text();
    let body = text;
    try { body = JSON.parse(text); } catch {}
    if (!res.ok) throw new Error(body?.error || `${res.status}`);
    return body;
  }

  // ── Avatar ───────────────────────────────────────────────────────────────
  const avatarCache = new Map();
  function avatarUrl(id) {
    if (avatarCache.has(id)) return avatarCache.get(id);
    const a = S.agents.get(id);
    const cv = document.createElement('canvas');
    cv.width = cv.height = 44;
    if (a) window.drawAvatar(cv, a.look);
    const url = cv.toDataURL();
    avatarCache.set(id, url);
    return url;
  }
  const av = (id, cls = 'av') => (S.agents.has(id) ? `<img class="${cls}" src="${avatarUrl(id)}" alt="">` : `<span class="${cls}" style="background:#334155"></span>`);

  // ── Nạp trạng thái ───────────────────────────────────────────────────────
  function applyState(st) {
    S.departments = st.departments;
    S.agents = new Map(st.agents.map((a) => [a.id, a]));
    S.tasks = new Map(st.tasks.map((t) => [t.id, t]));
    S.projects = st.projects;
    S.usage = st.usage;
    S.defaults = st.defaults;
    $('#m-runner').textContent = `runner: ${st.runner}${st.herdr.inside ? ' · herdr' : ''}`;
    $('#m-runtime').textContent = `runtime: ${st.defaultRuntime}`;
    if (st.registryErrors?.length) console.warn('registry', st.registryErrors);
  }

  let office;
  async function init() {
    const st = await api('/api/state');
    applyState(st);
    office = new window.Office($('#office'), {
      onSelect: (id) => openAgent(id),
      onHover: (id, x, y) => showTooltip(id, x, y),
    });
    office.setData(S.departments, [...S.agents.values()]);
    $('#lively').addEventListener('change', (e) => (office.lively = e.target.checked));
    bindUi();
    renderAll();
    loadRuntimes(false);
    preloadTicker();
    connect();
    setInterval(resync, 20000);
  }

  async function resync() {
    try {
      const st = await api('/api/state');
      const keepAgents = S.agents;
      applyState(st);
      for (const [id, a] of S.agents) if (!keepAgents.has(id)) avatarCache.delete(id);
      renderKpis();
      if (S.tab === 'tokens') renderTokens();
      if (S.tab === 'tasks' && !S.selectedTask) renderTaskList();
    } catch {}
  }

  function connect() {
    const es = new EventSource('/api/events' + (TOKEN ? `?token=${encodeURIComponent(TOKEN)}` : ''));
    const conn = $('#conn');
    es.onopen = () => {
      conn.className = 'conn ok';
      conn.querySelector('span').textContent = 'trực tuyến';
    };
    es.onerror = () => {
      conn.className = 'conn bad';
      conn.querySelector('span').textContent = 'mất kết nối';
    };
    es.addEventListener('agent', (e) => onAgent(JSON.parse(e.data).agent));
    es.addEventListener('task', (e) => onTask(JSON.parse(e.data).task));
    es.addEventListener('message', (e) => onMessage(JSON.parse(e.data).message));
    es.addEventListener('usage', (e) => onUsage(JSON.parse(e.data).record));
    es.addEventListener('log', (e) => onLog(JSON.parse(e.data).entry));
    es.addEventListener('output', (e) => onOutput(JSON.parse(e.data)));
    es.addEventListener('hello', () => resync());
  }

  // ── Sự kiện thời gian thực ───────────────────────────────────────────────
  const throttles = new Map();
  function throttle(key, fn, ms = 400) {
    if (throttles.has(key)) return;
    throttles.set(key, setTimeout(() => {
      throttles.delete(key);
      fn();
    }, ms));
  }

  function onAgent(st) {
    const a = S.agents.get(st.id);
    if (!a) return;
    a.state = st;
    office.updateAgent(st);
    if (S.tab === 'people') throttle('people', renderPeople);
  }

  function onTask(t) {
    S.tasks.set(t.id, t);
    updateRunning();
    if (S.tab === 'tasks') {
      if (S.selectedTask === t.id) throttle('td', () => renderTaskDetail(false), 300);
      else if (!S.selectedTask) throttle('tl', renderTaskList, 300);
    }
  }

  function updateRunning() {
    const running = [...S.tasks.values()].filter((x) => x.status === 'running' || x.status === 'queued');
    $('#badge-tasks').textContent = running.length || '';
    $('#k-running').textContent = running.length;
    office.setRunning(running.length);
    const meeting = running.find((x) => x.phase === 'discuss' || x.phase === 'finalize');
    office.setMeeting(meeting ? meeting.title : '');
  }

  function onMessage(m) {
    addTicker(m);
    if (m.from && S.agents.has(m.from)) office.say(m.from, plain(m.text.split('\n')[0]), m.kind === 'discussion' ? 9000 : 6000);
    if (S.taskDetail && S.taskDetail.task.id === m.taskId) {
      S.taskDetail.transcript.push(m);
      if (S.taskView === 'chat') throttle('chat', renderTaskBody, 200);
    }
  }

  function onUsage(r) {
    const add = (u, rec) => {
      u.input = (u.input || 0) + rec.input;
      u.output = (u.output || 0) + rec.output;
      u.cacheRead = (u.cacheRead || 0) + rec.cacheRead;
      u.cacheWrite = (u.cacheWrite || 0) + rec.cacheWrite;
      u.costUsd = (u.costUsd || 0) + rec.costUsd;
      u.calls = (u.calls || 0) + 1;
      if (rec.estimated) u.estimatedCalls = (u.estimatedCalls || 0) + 1;
      u.total = total(u);
      return u;
    };
    add(S.usage.total, r);
    const bump = (list, key) => {
      let row = list.find((x) => x.key === key);
      if (!row) list.push((row = { key }));
      add(row, r);
      list.sort((a, b) => b.total - a.total);
    };
    bump(S.usage.byAgent, r.agentId);
    bump(S.usage.byDepartment, r.department);
    bump(S.usage.byTask, r.taskId);
    bump(S.usage.byModel, r.model);
    const a = S.agents.get(r.agentId);
    if (a) a.usage = S.usage.byAgent.find((x) => x.key === r.agentId);
    office.tokenPop(r.agentId, r.input + r.output);
    renderKpis();
    if (S.tab === 'tokens') throttle('tokens', renderTokens, 800);
    if (S.tab === 'people') throttle('people', renderPeople, 800);
  }

  function onLog(e) {
    S.logs.push(e);
    if (S.logs.length > 600) S.logs.splice(0, S.logs.length - 600);
    if (S.tab === 'logs' && !$('#log-pause').checked && logMatches(e)) prependLog(e);
    if (S.selectedAgent && e.agentId === S.selectedAgent && S.agentDetail) {
      S.agentDetail.logs.push(e);
      throttle('ad', () => renderAgentDetail(false), 500);
    }
  }

  function onOutput(o) {
    const cur = (S.live.get(o.agentId) || '') + o.chunk + '\n';
    S.live.set(o.agentId, cur.slice(-5000));
    if (S.selectedAgent === o.agentId) {
      const box = $('#live-box');
      if (box) {
        box.textContent = S.live.get(o.agentId);
        box.scrollTop = box.scrollHeight;
      }
    }
  }

  // ── Ticker & tooltip ─────────────────────────────────────────────────────
  function addTicker(m) {
    const el = document.createElement('div');
    el.className = 'tk';
    const color = deptColor(m.department);
    el.innerHTML = `<time>${time(m.ts)}</time><b style="color:${color}">${esc(agentName(m.from))}</b><span>${esc(KIND_VI[m.kind] || m.kind)} · ${esc(plain(m.text).slice(0, 220))}</span>`;
    el.style.cursor = 'pointer';
    el.onclick = () => openTask(m.taskId);
    const tk = $('#ticker');
    tk.prepend(el);
    while (tk.children.length > 12) tk.lastChild.remove();
  }

  async function preloadTicker() {
    const recent = [...S.tasks.values()].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
    if (!recent) return;
    try {
      const d = await api(`/api/tasks/${recent.id}`);
      d.transcript.slice(-8).forEach(addTicker);
    } catch {}
  }

  function showTooltip(id, x, y) {
    const tt = $('#tooltip');
    if (!id) {
      tt.hidden = true;
      return;
    }
    const a = S.agents.get(id);
    if (!a) return;
    const st = a.state || { status: 'idle' };
    const u = a.usage || {};
    tt.innerHTML = `<b>${esc(a.title)}</b> <small>@${esc(a.id)}</small><div style="margin-bottom:4px"></div>
      <div class="tt-row"><span>Phòng</span><span>${esc(deptShort(a.department))}</span></div>
      <div class="tt-row"><span>Trạng thái</span><span style="color:${window.STATUS_COLOR[st.status]}">${esc(STATUS_VI[st.status] || st.status)}</span></div>
      ${st.activity ? `<div class="tt-row"><span>Đang</span><span>${esc(st.activity.slice(0, 40))}</span></div>` : ''}
      <div class="tt-row"><span>Token in/out</span><span>${fmt(u.input)} / ${fmt(u.output)}</span></div>
      <div class="tt-row"><span>Model</span><span>${esc(a.model)}</span></div>`;
    tt.hidden = false;
    const stage = $('#stage').getBoundingClientRect();
    const left = Math.min(x + 16, stage.width - 290);
    const top = Math.min(y + 12, stage.height - tt.offsetHeight - 10);
    tt.style.left = `${Math.max(8, left)}px`;
    tt.style.top = `${Math.max(8, top)}px`;
  }

  // ── Khung & tab ──────────────────────────────────────────────────────────
  function setTab(tab) {
    S.tab = tab;
    $$('.tabs button').forEach((b) => b.classList.toggle('active', b.dataset.tab === tab));
    $$('.tab-body').forEach((b) => b.classList.toggle('active', b.dataset.body === tab));
    if (tab === 'tasks') S.selectedTask ? renderTaskDetail(true) : renderTaskList();
    if (tab === 'people') S.selectedAgent ? renderAgentDetail(false) : renderPeople();
    if (tab === 'tokens') renderTokens();
    if (tab === 'logs') loadLogs();
  }

  function bindUi() {
    $$('.tabs button').forEach((b) => b.addEventListener('click', () => setTab(b.dataset.tab)));
    const form = $('#task-form');
    form.addEventListener('change', (e) => {
      if (e.target.name === 'mode') syncMode();
    });
    form.addEventListener('submit', submitTask);
    $('#btn-new-project').onclick = () => {
      $('#project-form').hidden = false;
      $('#project-form [name=id]').focus();
    };
    $('#btn-cancel-project').onclick = () => ($('#project-form').hidden = true);
    $('#project-form').addEventListener('submit', saveProject);
    $('#btn-refresh-rt').onclick = () => loadRuntimes(true);
    for (const id of ['#log-dept', '#log-agent', '#log-level']) $(id).addEventListener('change', loadLogs);
  }

  function renderAll() {
    renderKpis();
    renderAssign();
    renderProjects();
    updateRunning();
  }

  function renderKpis() {
    const t = S.usage.total || {};
    $('#k-in').textContent = fmt(t.input);
    $('#k-out').textContent = fmt(t.output);
    $('#k-cache').textContent = fmt(t.cacheRead);
    $('#k-calls').textContent = fmt(t.calls);
  }

  // ── Giao việc ────────────────────────────────────────────────────────────
  function renderAssign() {
    const deptOpts = S.departments.map((d) => `<option value="${esc(d.id)}">${esc(d.name)}</option>`).join('');
    $('#sel-dept').innerHTML = deptOpts;
    $('#sel-proj-dept').innerHTML = `<option value="auto">Tự động</option>${deptOpts}<option value="joint">Liên phòng</option>`;
    $('#sel-project').innerHTML = S.projects.length
      ? S.projects.map((p) => `<option value="${esc(p.id)}">${esc(p.name)} (${esc(CLS_VI[p.classification] || p.classification)})</option>`).join('')
      : '<option value="">— chưa có dự án —</option>';
    const f = $('#task-form');
    f.discussionRounds.placeholder = S.defaults.discussionRounds ?? 1;
    f.maxParallel.placeholder = S.defaults.maxParallel ?? 3;
    f.budgetTokens.placeholder = S.defaults.budgetTokens ?? '';
    f.review.checked = S.defaults.review !== false;
    syncMode();
  }

  function syncMode() {
    const mode = $('#task-form').mode.value;
    $('#row-dept').hidden = mode !== 'department';
    $('#row-project').hidden = mode !== 'project';
  }

  async function submitTask(e) {
    e.preventDefault();
    const f = e.target;
    const msg = $('#form-msg');
    const mode = f.mode.value;
    const opt = {};
    if (f.discussionRounds.value !== '') opt.discussionRounds = Number(f.discussionRounds.value);
    if (f.maxParallel.value !== '') opt.maxParallel = Number(f.maxParallel.value);
    if (f.budgetTokens.value !== '') opt.budgetTokens = Number(f.budgetTokens.value);
    if (f.runtime.value) opt.runtime = f.runtime.value;
    opt.review = f.review.checked;
    const body = { brief: f.brief.value, title: f.title.value || undefined, mode, options: opt };
    if (mode === 'department') body.department = f.department.value;
    if (mode === 'project') {
      if (!f.projectId.value) {
        msg.className = 'form-msg err';
        msg.textContent = 'Hãy tạo dự án trước';
        return;
      }
      body.projectId = f.projectId.value;
    }
    const btn = f.querySelector('button[type=submit]');
    btn.disabled = true;
    try {
      const t = await api('/api/tasks', { method: 'POST', body: JSON.stringify(body) });
      S.tasks.set(t.id, t);
      msg.className = 'form-msg ok';
      msg.textContent = `Đã giao ${t.id}`;
      f.brief.value = '';
      f.title.value = '';
      openTask(t.id);
    } catch (err) {
      msg.className = 'form-msg err';
      msg.textContent = err.message;
    } finally {
      btn.disabled = false;
    }
  }

  function renderProjects() {
    const ul = $('#projects');
    if (!S.projects.length) {
      ul.innerHTML = '<li class="empty" style="justify-content:center">Chưa có dự án. Tạo dự án để agent làm việc trong thư mục riêng.</li>';
      return;
    }
    ul.innerHTML = S.projects
      .map(
        (p) => `<li><span class="dot" style="background:${deptColor(p.department === 'auto' || p.department === 'joint' ? 'office' : p.department)}"></span>
        <div class="grow"><b>${esc(p.name)}</b> <small>${esc(p.id)} · ${esc(p.department === 'auto' ? 'tự động' : p.department === 'joint' ? 'liên phòng' : deptShort(p.department))}${p.runtime ? ' · ' + esc(p.runtime) : ''} · ${esc(p.workspace || 'workspaces/' + p.id)}</small></div>
        <span class="cls ${esc(p.classification)}">${esc(CLS_VI[p.classification] || p.classification)}</span>
        <button class="btn ghost sm" data-del="${esc(p.id)}" title="Xóa dự án">×</button></li>`,
      )
      .join('');
    ul.querySelectorAll('[data-del]').forEach((b) =>
      b.addEventListener('click', async () => {
        if (!confirm(`Xóa dự án ${b.dataset.del}? (không xóa file trong workspace)`)) return;
        await api(`/api/projects/${b.dataset.del}`, { method: 'DELETE' });
        S.projects = S.projects.filter((p) => p.id !== b.dataset.del);
        renderProjects();
        renderAssign();
      }),
    );
  }

  async function saveProject(e) {
    e.preventDefault();
    const f = e.target;
    const body = Object.fromEntries(new FormData(f).entries());
    if (!body.budgetTokens) delete body.budgetTokens;
    try {
      const p = await api('/api/projects', { method: 'POST', body: JSON.stringify(body) });
      S.projects = S.projects.filter((x) => x.id !== p.id).concat(p);
      f.reset();
      f.hidden = true;
      renderProjects();
      renderAssign();
    } catch (err) {
      alert(err.message);
    }
  }

  async function loadRuntimes(refresh) {
    try {
      S.runtimes = await api('/api/runtimes' + (refresh ? '?refresh=1' : ''));
    } catch {
      return;
    }
    $('#runtimes').innerHTML = S.runtimes
      .map(
        (r) => `<li><span class="dot" style="background:${r.ok ? 'var(--ok)' : '#475569'}"></span>
        <div class="grow"><b>${esc(r.id)}</b> <small>${esc(r.label)} · ${esc(r.detail)}</small></div>
        <span class="cls ${r.local ? 'public' : ''}" title="Dữ liệu ${r.local ? 'ở lại trên máy' : 'gửi tới nhà cung cấp bên ngoài'}">${r.local ? 'cục bộ' : 'bên ngoài'}</span></li>`,
      )
      .join('');
    const opts = '<option value="">Mặc định</option>' + S.runtimes.map((r) => `<option value="${esc(r.id)}">${esc(r.id)}${r.ok ? '' : ' (chưa sẵn sàng)'}</option>`).join('');
    $('#sel-runtime').innerHTML = opts;
    $('#sel-proj-runtime').innerHTML = opts;
  }

  // ── Nhiệm vụ ─────────────────────────────────────────────────────────────
  function renderTaskList() {
    $('#task-detail').hidden = true;
    const el = $('#task-list');
    el.hidden = false;
    const tasks = [...S.tasks.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    if (!tasks.length) {
      el.innerHTML = '<div class="empty">Chưa có nhiệm vụ nào. Sang tab <b>Giao việc</b> để bắt đầu.</div>';
      return;
    }
    el.innerHTML = tasks
      .map((t) => {
        const depts = (t.departments.length ? t.departments : t.department ? [t.department] : []).map((d) => `<span style="color:${deptColor(d)}">${esc(deptShort(d))}</span>`).join(' → ');
        return `<button class="task" data-id="${esc(t.id)}">
          <div class="t-top"><span class="status ${t.status}">${TASK_VI[t.status] || t.status}</span><span class="t-title">${esc(t.title)}</span></div>
          <div class="t-meta"><span>${esc(t.id)}</span><span>${esc(MODE_VI[t.mode] || t.mode)}</span>${depts ? `<span>${depts}</span>` : ''}${t.phase ? `<span>pha: ${esc(t.phase)}</span>` : ''}<span>token <b>${fmt(total(t.usage))}</b></span><span>${dateTime(t.createdAt)}</span></div>
        </button>`;
      })
      .join('');
    el.querySelectorAll('.task').forEach((b) => b.addEventListener('click', () => openTask(b.dataset.id)));
  }

  async function openTask(id) {
    S.selectedTask = id;
    S.taskView = S.taskView || 'chat';
    S.taskFile = null;
    if (S.tab !== 'tasks') setTab('tasks');
    else renderTaskDetail(true);
  }

  async function renderTaskDetail(fetchData) {
    const id = S.selectedTask;
    if (!id) return renderTaskList();
    if (fetchData || !S.taskDetail || S.taskDetail.task.id !== id) {
      try {
        S.taskDetail = await api(`/api/tasks/${id}`);
      } catch (e) {
        S.selectedTask = null;
        return renderTaskList();
      }
    }
    const t = S.tasks.get(id) || S.taskDetail.task;
    S.taskDetail.task = t;
    $('#task-list').hidden = true;
    const el = $('#task-detail');
    el.hidden = false;
    const runs = t.runs || [];
    const blocks = runs
      .map((r) => {
        const idx = r.status === 'done' ? 5 : PHASE_INDEX[r.phase] ?? -1;
        const phases = PHASES.map(([k, l], i) => `<span class="${i < idx ? 'done' : i === idx && r.status === 'running' ? 'now' : ''}">${l}</span>`).join('');
        const rows = r.subtasks
          .map(
            (s) => `<div class="st-row">
              <div class="st-top"><code>${esc(s.id)}</code><span class="st-title" title="${esc(s.description)}">${esc(s.title)}</span><span class="status ${s.status}">${TASK_VI[s.status] || s.status}</span></div>
              <div class="st-meta"><span class="who">${av(s.assignee)}${esc(agentName(s.assignee))}</span>${s.dependsOn.length ? `<span>sau ${esc(s.dependsOn.join(', '))}</span>` : ''}<span class="mono">${fmt(s.usage.input)} in / ${fmt(s.usage.output)} out</span>${s.attempts > 1 ? `<span>${s.attempts} lần</span>` : ''}${s.output ? `<a data-file="${esc(s.output)}">xem sản phẩm →</a>` : ''}</div>
              ${s.error ? `<div class="st-err">${esc(s.error)}</div>` : ''}
            </div>`,
          )
          .join('');
        return `<div class="dept-block">
          <h3><span class="dot" style="background:${deptColor(r.department)}"></span>${esc(deptName(r.department))}<span class="status ${r.status}">${TASK_VI[r.status] || r.status}</span><small style="margin-left:auto;font-family:var(--mono)">${fmt(total(r.usage))} token</small></h3>
          <div class="phases">${phases}</div>
          ${r.planSummary ? `<div class="md" style="color:var(--muted);margin-bottom:6px">${md(r.planSummary)}</div>` : ''}
          ${rows ? `<div class="subtasks">${rows}</div>` : ''}
          ${r.review ? `<p style="font-size:12.5px;margin:6px 0 0">🔍 Review: ${r.review.approved ? '<b style="color:var(--ok)">duyệt</b>' : '<b style="color:var(--warn)">cần sửa</b>'} — ${esc(r.review.summary)}</p>` : ''}
        </div>`;
      })
      .join('');
    const canCancel = t.status === 'running' || t.status === 'queued';
    el.innerHTML = `<button class="btn ghost sm back" id="td-back">← Danh sách</button>
      <div class="td-head"><h2>${esc(t.title)}</h2>
        <div class="t-meta"><span class="status ${t.status}">${TASK_VI[t.status] || t.status}</span><span>${esc(t.id)}</span><span>${esc(MODE_VI[t.mode] || t.mode)}</span>
        <span class="cls ${esc(t.classification)}">${esc(CLS_VI[t.classification] || t.classification)}</span>
        ${t.projectId ? `<span>dự án: ${esc(t.projectId)}</span>` : ''}<span>token <b style="font-family:var(--mono);color:var(--text)">${fmt(t.usage.input)} in / ${fmt(t.usage.output)} out</b></span>
        ${canCancel ? '<button class="btn ghost sm danger" id="td-cancel">Hủy</button>' : ''}</div>
        ${t.routing ? `<p style="font-size:12.5px;color:var(--muted);margin:0 0 8px">🧭 ${esc(t.routing.reason)}</p>` : ''}
        ${t.error ? `<p style="font-size:12.5px;color:var(--bad);margin:0 0 8px">${esc(t.error)}</p>` : ''}
      </div>
      <details class="doc" style="margin-bottom:10px"><summary style="cursor:pointer;color:var(--muted);font-size:12.5px">Yêu cầu gốc</summary><div class="md">${md(t.brief)}</div></details>
      ${blocks || '<div class="empty">Đang định tuyến…</div>'}
      <div class="subtabs">
        <button data-v="chat" class="${S.taskView === 'chat' ? 'active' : ''}">💬 Hội thoại (${S.taskDetail.transcript.length})</button>
        <button data-v="final" class="${S.taskView === 'final' ? 'active' : ''}" ${t.finalPath ? '' : 'disabled'}>🏁 Báo cáo</button>
        <button data-v="files" class="${S.taskView === 'files' ? 'active' : ''}">📦 Sản phẩm</button>
        <button data-v="tokens" class="${S.taskView === 'tokens' ? 'active' : ''}">🔢 Token</button>
      </div>
      <div id="td-body"></div>`;
    $('#td-back').onclick = () => {
      S.selectedTask = null;
      S.taskDetail = null;
      renderTaskList();
    };
    if (canCancel) $('#td-cancel').onclick = () => api(`/api/tasks/${t.id}/cancel`, { method: 'POST', body: '{}' }).catch((e) => alert(e.message));
    el.querySelectorAll('.subtabs button').forEach((b) =>
      b.addEventListener('click', () => {
        S.taskView = b.dataset.v;
        S.taskFile = null;
        el.querySelectorAll('.subtabs button').forEach((x) => x.classList.toggle('active', x === b));
        renderTaskBody();
      }),
    );
    el.querySelectorAll('a[data-file]').forEach((a) =>
      a.addEventListener('click', () => {
        S.taskView = 'files';
        S.taskFile = a.dataset.file;
        renderTaskBody();
      }),
    );
    renderTaskBody();
  }

  async function renderTaskBody() {
    const box = $('#td-body');
    if (!box || !S.taskDetail) return;
    const d = S.taskDetail;
    const t = d.task;
    if (S.taskView === 'chat') {
      const list = d.transcript;
      box.innerHTML = list.length
        ? `<div class="chat">${list
            .map((m) => `<div class="msg k-${esc(m.kind)}">${av(m.from)}<div class="bubble"><header><b>${esc(agentName(m.from))}</b><span class="kind">${esc(KIND_VI[m.kind] || m.kind)}${m.round ? ` · vòng ${m.round}` : ''}</span><span style="margin-left:auto">${time(m.ts)}</span></header><div class="md">${md(m.text)}</div></div></div>`)
            .join('')}</div>`
        : '<div class="empty">Chưa có trao đổi.</div>';
      return;
    }
    if (S.taskView === 'final' || (S.taskView === 'files' && S.taskFile)) {
      const path = S.taskView === 'final' ? t.finalPath || 'FINAL.md' : S.taskFile;
      box.innerHTML = '<div class="empty">Đang tải…</div>';
      try {
        const text = await api(`/api/tasks/${t.id}/file?path=${encodeURIComponent(path)}`);
        box.innerHTML = `<div class="doc"><div style="font-size:11.5px;color:var(--faint);margin-bottom:6px;font-family:var(--mono)">${esc(path)}</div><div class="md">${md(typeof text === 'string' ? text : JSON.stringify(text))}</div></div>`;
      } catch (e) {
        box.innerHTML = `<div class="empty">${esc(e.message)}</div>`;
      }
      return;
    }
    if (S.taskView === 'files') {
      try {
        d.outputs = (await api(`/api/tasks/${t.id}`)).outputs;
      } catch {}
      box.innerHTML = d.outputs?.length
        ? `<ul class="projects">${d.outputs.map((f) => `<li><span class="grow"><a data-o="outputs/${esc(f)}" style="color:#93c5fd;cursor:pointer">${esc(f)}</a></span></li>`).join('')}</ul>`
        : '<div class="empty">Chưa có file đầu ra.</div>';
      box.querySelectorAll('[data-o]').forEach((a) =>
        a.addEventListener('click', () => {
          S.taskFile = a.dataset.o;
          renderTaskBody();
        }),
      );
      return;
    }
    if (S.taskView === 'tokens') {
      let rows = d.usage;
      try {
        rows = (await api(`/api/usage?by=agent&task=${encodeURIComponent(t.id)}`)).rows;
      } catch {}
      box.innerHTML = usageTable(rows, 'Agent', (k) => `<span class="who">${av(k)}${esc(agentName(k))}</span>`);
    }
  }

  // ── Nhân sự ──────────────────────────────────────────────────────────────
  function agentCard(a) {
    const st = a.state || { status: 'idle' };
    const u = a.usage || {};
    return `<button class="agent-card" data-agent="${esc(a.id)}">
      <img src="${avatarUrl(a.id)}" width="34" height="34" alt="" style="image-rendering:pixelated;background:var(--bg-2);border-radius:7px">
      <div style="min-width:0"><b>${esc(a.name)}${a.role === 'lead' ? ' ★' : ''}</b><div class="role">@${esc(a.id)} · ${esc(a.title)}</div>
      <div class="st"><span class="dot" style="background:${window.STATUS_COLOR[st.status]}"></span>${esc(STATUS_VI[st.status] || st.status)}${st.activity && st.status !== 'discussing' ? ` · ${esc(st.activity.slice(0, 26))}` : ''}</div>
      <div class="tok">${fmt(u.input)} in · ${fmt(u.output)} out</div></div></button>`;
  }

  function renderPeople() {
    if (S.selectedAgent) return;
    $('#agent-detail').hidden = true;
    const el = $('#people');
    el.hidden = false;
    const rank = (d, a) => (a.id === d.lead ? -1 : d.members.indexOf(a.id) < 0 ? 99 : d.members.indexOf(a.id));
    const groups = S.departments.map((d) => ({
      id: d.id, name: d.name, color: d.color, purpose: d.purpose,
      list: [...S.agents.values()].filter((a) => a.department === d.id).sort((a, b) => rank(d, a) - rank(d, b)),
    }));
    const office = [...S.agents.values()].filter((a) => !S.departments.some((d) => d.id === a.department));
    if (office.length) groups.unshift({ id: 'office', name: 'Văn phòng điều phối', color: '#b91c1c', purpose: 'routing', list: office });
    el.innerHTML = groups
      .map((g) => {
        const u = S.usage.byDepartment.find((x) => x.key === g.id);
        return `<div class="dept-head"><span class="dot" style="background:${g.color}"></span><h2>${esc(g.name)}</h2><small>${g.list.length} người · ${fmt(total(u))} token</small></div>
          <div class="agents-grid">${g.list.map(agentCard).join('')}</div>`;
      })
      .join('');
    el.querySelectorAll('[data-agent]').forEach((b) => b.addEventListener('click', () => openAgent(b.dataset.agent)));
  }

  async function openAgent(id) {
    S.selectedAgent = id;
    office.select(id);
    if (S.tab !== 'people') setTab('people');
    else renderAgentDetail(true);
  }

  async function renderAgentDetail(fetchData = true) {
    const id = S.selectedAgent;
    if (!id) return renderPeople();
    if (fetchData || !S.agentDetail || S.agentDetail.agent.id !== id) {
      try {
        S.agentDetail = await api(`/api/agents/${id}`);
      } catch {
        S.selectedAgent = null;
        return renderPeople();
      }
    }
    const d = S.agentDetail;
    const a = d.agent;
    const live = S.agents.get(id);
    const st = live?.state || d.state || { status: 'idle' };
    const u = live?.usage || d.usage || {};
    $('#people').hidden = true;
    const el = $('#agent-detail');
    el.hidden = false;
    el.innerHTML = `<button class="btn ghost sm back" id="ad-back" style="margin-bottom:10px">← Nhân sự</button>
      <div class="ad-head"><img src="${avatarUrl(id)}" width="56" height="56" alt="" style="image-rendering:pixelated;background:var(--bg-2);border-radius:10px">
        <div><h2 style="font-size:16px">${esc(a.title)} <small>@${esc(a.id)}</small></h2>
        <div style="color:var(--muted);font-size:12.5px"><span style="color:${deptColor(a.department)}">${esc(deptName(a.department))}</span> · vai trò ${esc(a.role)} · model ${esc(a.model)}</div>
        <div class="st" style="font-size:12.5px;margin-top:3px"><span class="dot" style="background:${window.STATUS_COLOR[st.status]}"></span> ${esc(STATUS_VI[st.status] || st.status)}${st.activity ? ` · ${esc(st.activity)}` : ''}${st.runtime ? ` · <code>${esc(st.runtime)}</code>` : ''}</div></div></div>
      <div class="stats">
        <div class="stat"><span>Input</span><b>${fmt(u.input)}</b></div>
        <div class="stat"><span>Output</span><b>${fmt(u.output)}</b></div>
        <div class="stat"><span>Cache đọc</span><b>${fmt(u.cacheRead)}</b></div>
        <div class="stat"><span>Lượt gọi</span><b>${fmt(u.calls)}</b></div>
      </div>
      <p style="font-size:13px">${esc(a.summary)}</p>
      <div class="tags">${a.skills.map((s) => `<span>${esc(s)}</span>`).join('')}</div>
      <div class="tags">${(a.tools || []).map((s) => `<span style="color:#93c5fd">${esc(s)}</span>`).join('') || '<span>không dùng công cụ</span>'}</div>
      <h3 style="font-size:13px;margin:12px 0 6px">Đầu ra trực tiếp</h3>
      <div class="live" id="live-box">${esc(S.live.get(id) || '(chưa có — nội dung hiện khi agent đang trả lời với runtime hỗ trợ stream)')}</div>
      <h3 style="font-size:13px;margin:12px 0 6px">Nhật ký vị trí</h3>
      <ol class="logs">${d.logs.slice(-60).reverse().map(logRow).join('') || '<li class="empty">Chưa có log</li>'}</ol>
      ${d.byTask?.length ? `<h3 style="font-size:13px;margin:12px 0 6px">Token theo nhiệm vụ</h3>${usageTable(d.byTask, 'Nhiệm vụ', (k) => esc(S.tasks.get(k)?.title?.slice(0, 30) || k))}` : ''}
      <details class="doc" style="margin-top:12px"><summary style="cursor:pointer;font-weight:600">Hồ sơ vị trí (agent.md)</summary><div class="md">${md(a.body)}</div>
      ${a.sources?.length ? `<h3>Nguồn tham khảo</h3><ul>${a.sources.map((s) => `<li>${esc(s)}</li>`).join('')}</ul>` : ''}</details>`;
    $('#ad-back').onclick = () => {
      S.selectedAgent = null;
      S.agentDetail = null;
      office.select(null);
      renderPeople();
    };
  }

  // ── Token ────────────────────────────────────────────────────────────────
  function usageTable(rows, label, labelFn, clickAttr) {
    if (!rows || !rows.length) return '<div class="empty">Chưa có số liệu.</div>';
    return `<table class="tbl"><thead><tr><th>${label}</th><th>Input</th><th>Output</th><th>Cache</th><th>Tổng</th><th>Lượt</th><th>Chi phí</th></tr></thead><tbody>${rows
      .map(
        (r) => `<tr ${clickAttr ? `class="click" ${clickAttr}="${esc(r.key)}"` : ''}><td>${labelFn ? labelFn(r.key) : esc(r.key)}</td><td>${fmt(r.input)}</td><td>${fmt(r.output)}</td><td>${fmt((r.cacheRead || 0) + (r.cacheWrite || 0))}</td><td><b>${fmt(r.total ?? total(r))}</b></td><td>${r.calls || 0}${r.estimatedCalls ? `<small title="${r.estimatedCalls} lượt token ước lượng (runtime không báo usage)" style="color:var(--faint)">≈</small>` : ''}</td><td>${usd(r.costUsd || 0)}</td></tr>`,
      )
      .join('')}</tbody></table>`;
  }

  function bars(rows, labelFn) {
    const max = Math.max(1, ...rows.map((r) => r.total ?? total(r)));
    return `<div class="key"><span><i style="background:#60a5fa"></i>input</span><span><i style="background:#f59e0b"></i>output</span><span><i style="background:#334155"></i>cache</span></div>
      <div class="bars">${rows
        .map((r) => {
          const pct = (v) => ((v || 0) / max) * 100;
          return `<div class="bar-row"><span class="lbl">${labelFn(r.key)}</span><div class="bar"><i class="in" style="width:${pct(r.input)}%"></i><i class="out" style="width:${pct(r.output)}%"></i><i class="cache" style="width:${pct((r.cacheRead || 0) + (r.cacheWrite || 0))}%"></i></div><span class="val">${fmt(r.total ?? total(r))}</span></div>`;
        })
        .join('')}</div>`;
  }

  function renderTokens() {
    const u = S.usage;
    const t = u.total || {};
    const days = u.byDay || [];
    const maxDay = Math.max(1, ...days.map((d) => d.total || 0));
    $('#tokens').innerHTML = `
      <div class="stats" style="grid-template-columns:repeat(3,1fr)">
        <div class="stat"><span>Input</span><b>${fmt(t.input)}</b></div>
        <div class="stat"><span>Output</span><b>${fmt(t.output)}</b></div>
        <div class="stat"><span>Cache đọc / ghi</span><b>${fmt(t.cacheRead)} / ${fmt(t.cacheWrite)}</b></div>
        <div class="stat"><span>Lượt gọi</span><b>${fmt(t.calls)}</b></div>
        <div class="stat"><span>Lượt ước lượng</span><b>${fmt(t.estimatedCalls)}</b></div>
        <div class="stat"><span>Chi phí</span><b>${usd(t.costUsd || 0)}</b></div>
      </div>
      <div class="card"><h2>Theo phòng ban</h2>${bars(u.byDepartment, (k) => `<span style="color:${deptColor(k)}" title="${esc(deptName(k))}">${esc(deptShort(k))}</span>`)}</div>
      <div class="card"><h2>Theo agent</h2>${usageTable(u.byAgent, 'Agent', (k) => `<span class="who">${av(k)}${esc(agentName(k))}</span>`, 'data-ag')}</div>
      <div class="card"><h2>Theo nhiệm vụ</h2>${usageTable(u.byTask.slice(0, 20), 'Nhiệm vụ', (k) => esc(S.tasks.get(k)?.title?.slice(0, 34) || k), 'data-tk')}</div>
      <div class="card"><h2>Theo model</h2>${usageTable(u.byModel, 'Model')}</div>
      ${days.length ? `<div class="card"><h2>Theo ngày</h2><div class="spark">${days.map((d) => `<div title="${esc(d.key)}: ${fmt(d.total)}" style="height:${((d.total || 0) / maxDay) * 100}%"></div>`).join('')}</div><div class="spark-lbl"><span>${esc(days[0].key)}</span><span>${esc(days[days.length - 1].key)}</span></div></div>` : ''}
      <p style="font-size:12px;color:var(--muted)">Số liệu lấy từ sổ cái <code>data/usage/ledger.jsonl</code>. Lượt "ước lượng" là khi runtime không báo usage (ví dụ một số CLI) — token được ước tính theo độ dài văn bản. Xem trong terminal: <code>ccoding usage --watch</code>.</p>`;
    $$('#tokens [data-ag]').forEach((r) => r.addEventListener('click', () => openAgent(r.dataset.ag)));
    $$('#tokens [data-tk]').forEach((r) => r.addEventListener('click', () => openTask(r.dataset.tk)));
  }

  // ── Nhật ký ──────────────────────────────────────────────────────────────
  function logRow(e) {
    const scope = [e.department ? deptShort(e.department) : '', e.agentId ? agentName(e.agentId) : ''].filter(Boolean).join(' / ');
    return `<li><time>${time(e.ts).slice(0, 8)}</time><span class="lv ${esc(e.level)}">${esc(e.level.slice(0, 4).toUpperCase())}</span><span class="lm">${scope ? `<b>${esc(scope)}</b> · ` : ''}${esc(e.msg)}${e.taskId ? ` <small>${esc(e.taskId)}</small>` : ''}</span></li>`;
  }

  function logMatches(e) {
    const d = $('#log-dept').value;
    const a = $('#log-agent').value;
    const l = $('#log-level').value;
    return (!d || e.department === d) && (!a || e.agentId === a) && (!l || e.level === l);
  }

  function prependLog(e) {
    const ol = $('#logs');
    ol.insertAdjacentHTML('afterbegin', logRow(e));
    while (ol.children.length > 400) ol.lastChild.remove();
  }

  async function loadLogs() {
    const dSel = $('#log-dept');
    const aSel = $('#log-agent');
    if (dSel.options.length <= 1) {
      dSel.innerHTML = '<option value="">Mọi phòng</option>' + [...S.departments.map((d) => [d.id, d.name]), ['office', 'Điều phối']].map(([id, n]) => `<option value="${esc(id)}">${esc(n)}</option>`).join('');
      aSel.innerHTML = '<option value="">Mọi agent</option>' + [...S.agents.values()].map((a) => `<option value="${esc(a.id)}">${esc(a.name)}</option>`).join('');
    }
    const q = new URLSearchParams({ limit: '300' });
    if (aSel.value) q.set('agent', aSel.value);
    else if (dSel.value) q.set('department', dSel.value);
    if ($('#log-level').value) q.set('level', $('#log-level').value);
    try {
      const rows = await api(`/api/logs?${q}`);
      $('#logs').innerHTML = rows.filter(logMatches).reverse().map(logRow).join('') || '<li class="empty">Chưa có log</li>';
    } catch (e) {
      $('#logs').innerHTML = `<li class="empty">${esc(e.message)}</li>`;
    }
  }

  init().catch((e) => {
    document.body.insertAdjacentHTML('afterbegin', `<div style="background:#7f1d1d;color:#fff;padding:10px 16px">Không tải được trạng thái: ${esc(e.message)}</div>`);
  });
})();
