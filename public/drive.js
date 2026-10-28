// Màn chính kiểu "Drive": cột trái (điều hướng + cây dự án → nhiệm vụ), giữa là trình quản lý (tổng quan, dự án dạng
// thư mục, danh sách nhiệm vụ, trang dự án có ô soạn, màn prompt), phải là ô phụ "Văn phòng" (canvas pixel).
// Dùng cầu nối window.CC (app.js) và window.Director (director.js).
(function () {
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  let C = null;
  const store = {
    get(k, d) {
      try {
        const v = localStorage.getItem(`ccoding.${k}`);
        return v === null ? d : JSON.parse(v);
      } catch {
        return d;
      }
    },
    set(k, v) {
      try {
        localStorage.setItem(`ccoding.${k}`, JSON.stringify(v));
      } catch {}
    },
  };
  const V = {
    filter: 'all',
    query: '',
    mode: '',
    view: store.get('view', 'list'),
    sort: store.get('sort', 'updated'),
    projectId: null,
    expanded: store.get('expanded', {}),
    stars: new Set(store.get('stars', [])),
    quota: null,
    quotaAt: 0,
  };
  const D = {};
  const esc = (s) => C.esc(s);
  const NONE = '__none';
  const FILTERS = [
    ['all', 'Tất cả'],
    ['running', 'Đang chạy'],
    ['attention', 'Cần xem'],
    ['done', 'Xong'],
    ['problem', 'Lỗi / tạm dừng'],
    ['starred', 'Gắn sao'],
  ];
  const SORTS = [
    ['updated', 'Mới cập nhật'],
    ['created', 'Mới tạo'],
    ['title', 'Tên A→Z'],
    ['tokens', 'Token nhiều nhất'],
  ];

  // ── Tiện ích nhiệm vụ ────────────────────────────────────────────────────
  const tasks = () => [...C.S.tasks.values()];
  const needsAttention = (t) => !!t.attention || t.status === 'paused' || t.status === 'failed';
  const active = (t) => t.status === 'running' || t.status === 'queued';
  function progress(t) {
    if (t.status === 'done') return 100;
    const runs = t.runs || [];
    if (!runs.length) return active(t) ? 4 : 0;
    const per = 100 / runs.length;
    let p = 0;
    for (const r of runs) {
      if (r.status === 'done') p += per;
      else {
        const idx = C.PHASE_INDEX[r.phase] ?? -1;
        const subs = r.subtasks || [];
        const sub = subs.length ? subs.filter((s) => s.status === 'done').length / subs.length : 0;
        p += per * Math.max(0, Math.min(1, (idx + (idx === 2 ? sub : 0.5)) / 5));
      }
    }
    return Math.max(3, Math.round(p));
  }
  function phaseLabel(t) {
    if (t.status === 'done') return 'Hoàn thành';
    if (t.status === 'paused') return `Tạm dừng${t.pause?.reason ? ` · ${C.PAUSE_VI[t.pause.reason] || t.pause.reason}` : ''}`;
    if (t.status === 'failed') return 'Lỗi — có thể tiếp tục';
    if (t.status === 'cancelled') return 'Đã hủy';
    const ph = C.PHASES.find(([k]) => k === t.phase) || (t.phase === 'finalize' ? ['', 'Thảo luận'] : t.phase === 'revise' ? ['', 'Sửa theo review'] : t.phase === 'route' ? ['', 'Định tuyến'] : null);
    return ph ? ph[1] : t.status === 'queued' ? 'Chờ chạy' : 'Đang chạy';
  }
  const who = (t) => (t.mode === 'agent' && t.agentId ? `📌 ${C.agentName(t.agentId)}` : C.MODE_VI[t.mode] || t.mode);
  const projName = (id) => (id ? C.S.projects.find((p) => p.id === id)?.name || id : 'Ngoài dự án');
  const assignees = (t) => [...new Set((t.runs || []).flatMap((r) => r.subtasks.map((s) => s.assignee)))].slice(0, 5);
  const updated = (t) => t.updatedAt || t.createdAt;
  function sortList(list) {
    const by = V.sort;
    return list.sort((a, b) =>
      by === 'title' ? a.title.localeCompare(b.title, 'vi') : by === 'tokens' ? C.total(b.usage) - C.total(a.usage) : by === 'created' ? b.createdAt.localeCompare(a.createdAt) : updated(b).localeCompare(updated(a)),
    );
  }
  function matches(t, filter = V.filter) {
    if (filter === 'running' && !active(t)) return false;
    if (filter === 'attention' && !needsAttention(t)) return false;
    if (filter === 'done' && t.status !== 'done') return false;
    if (filter === 'problem' && !['failed', 'paused', 'cancelled'].includes(t.status)) return false;
    if (filter === 'starred' && !V.stars.has(t.id)) return false;
    if (V.mode && t.mode !== V.mode) return false;
    if (V.query) {
      const q = V.query.toLowerCase();
      if (!`${t.title} ${t.id} ${t.brief || ''} ${t.projectId || ''} ${t.agentId || ''}`.toLowerCase().includes(q)) return false;
    }
    return true;
  }
  function star(id, on) {
    if (on ?? !V.stars.has(id)) V.stars.add(id);
    else V.stars.delete(id);
    store.set('stars', [...V.stars]);
  }
  const dot = (t) => `<span class="sdot s-${esc(t.status)}${t.attention ? ' att' : ''}" title="${esc(C.TASK_VI[t.status] || t.status)}"></span>`;

  // ── Hành động ────────────────────────────────────────────────────────────
  async function act(path, body, ok) {
    try {
      const r = await C.api(path, { method: 'POST', body: JSON.stringify(body || {}) });
      if (r && r.id) C.S.tasks.set(r.id, r);
      if (r && r.task) C.S.tasks.set(r.task.id, r.task);
      if (ok) C.toast({ level: 'info', title: ok, msg: '' });
      D.changed();
      return r;
    } catch (e) {
      C.toast({ level: 'error', title: 'Không thực hiện được', msg: e.message });
    }
  }
  function again(t) {
    C.prefillAssign({ mode: t.mode, department: t.department, projectId: t.projectId, agentId: t.agentId, title: t.title, brief: t.brief });
  }

  // menu ngữ cảnh (chuột phải / nút ⋮)
  let ctx = null;
  function closeCtx() {
    ctx?.remove();
    ctx = null;
  }
  function ctxMenu(items, x, y) {
    closeCtx();
    ctx = document.createElement('div');
    ctx.className = 'ctx-menu';
    ctx.setAttribute('role', 'menu');
    ctx.innerHTML = items.filter(Boolean).map((it, i) => (it === '-' ? '<hr>' : `<button data-i="${i}" ${it.danger ? 'class="danger"' : ''}>${it.icon || ''} ${esc(it.label)}</button>`)).join('');
    document.body.appendChild(ctx);
    const r = ctx.getBoundingClientRect();
    ctx.style.left = `${Math.min(x, innerWidth - r.width - 8)}px`;
    ctx.style.top = `${Math.min(y, innerHeight - r.height - 8)}px`;
    const list = items.filter(Boolean);
    $$('button', ctx).forEach((b) => (b.onclick = () => (closeCtx(), list[Number(b.dataset.i)].run())));
    setTimeout(() => document.addEventListener('mousedown', (e) => !ctx?.contains(e.target) && closeCtx(), { once: true }), 0);
  }
  function taskMenu(t, x, y) {
    ctxMenu(
      [
        { icon: '📂', label: 'Mở', run: () => C.openTask(t.id) },
        { icon: '💬', label: 'Mở dạng hội thoại', run: () => window.Chat?.open(t.id) },
        t.projectId && { icon: '📁', label: `Mở dự án ${projName(t.projectId)}`, run: () => openProject(t.projectId) },
        { icon: V.stars.has(t.id) ? '☆' : '⭐', label: V.stars.has(t.id) ? 'Bỏ gắn sao' : 'Gắn sao', run: () => (star(t.id), D.changed()) },
        { icon: '↻', label: 'Giao lại tương tự', run: () => again(t) },
        '-',
        t.status === 'running' && { icon: '⏸', label: 'Tạm dừng', run: () => act(`/api/tasks/${t.id}/pause`, {}, 'Đã yêu cầu tạm dừng') },
        ['paused', 'failed', 'cancelled'].includes(t.status) && (t.runs || []).length && { icon: '▶', label: 'Tiếp tục (chạy tới khi xong)', run: () => act(`/api/tasks/${t.id}/resume`, { budgetMode: 'complete' }, 'Đã tiếp tục') },
        ['running', 'queued', 'paused'].includes(t.status) && { icon: '✕', label: 'Hủy nhiệm vụ', danger: true, run: () => confirm(`Hủy "${t.title}"?`) && act(`/api/tasks/${t.id}/cancel`, {}, 'Đã gửi lệnh hủy') },
        { icon: '📋', label: 'Sao chép mã nhiệm vụ', run: () => navigator.clipboard?.writeText(t.id).then(() => C.toast({ level: 'info', title: `Đã chép ${t.id}`, msg: '' })) },
      ],
      x,
      y,
    );
  }
  function projectMenu(p, x, y) {
    ctxMenu(
      [
        { icon: '📂', label: 'Mở', run: () => openProject(p.id) },
        { icon: '📝', label: 'Giao việc trong dự án', run: () => C.prefillAssign({ mode: 'project', projectId: p.id }) },
        { icon: '📌', label: 'Giao riêng cho một agent', run: () => C.prefillAssign({ mode: 'agent', projectId: p.id }) },
        '-',
        { icon: '⚙', label: 'Sửa cấu hình', run: () => C.editProject(p.id) },
      ],
      x,
      y,
    );
  }

  // ── Khung hiển thị nhiệm vụ: danh sách / lưới ───────────────────────────
  function rowHtml(t, opts = {}) {
    const pct = progress(t);
    return `<div class="drow${C.S.selectedTask === t.id ? ' sel' : ''}" data-id="${esc(t.id)}" tabindex="0" role="row">
      <button class="star${V.stars.has(t.id) ? ' on' : ''}" data-star title="Gắn sao">${V.stars.has(t.id) ? '★' : '☆'}</button>
      <div class="c-name">${dot(t)}<div><b>${esc(t.title)}</b><small>${esc(t.id)} · ${esc(who(t))}${t.followUpOf ? ' · ↪ tiếp nối' : ''}</small></div></div>
      ${opts.noProject ? '' : `<div class="c-proj">${t.projectId ? `📁 ${esc(projName(t.projectId))}` : '<span class="muted">—</span>'}</div>`}
      <div class="c-stat"><span class="status ${esc(t.status)}">${esc(C.TASK_VI[t.status] || t.status)}</span>${t.attention ? '<span class="status attention">⚠</span>' : ''}<div class="pbar" title="${esc(phaseLabel(t))} · ${pct}%"><i style="width:${pct}%"></i></div><small>${esc(phaseLabel(t))}</small></div>
      <div class="c-people">${assignees(t).map((a) => C.av(a, 'av xs')).join('')}</div>
      <div class="c-tok">${C.fmt(C.total(t.usage))}</div>
      <div class="c-date" title="${esc(new Date(updated(t)).toLocaleString('vi-VN'))}">${esc(C.dateTime(updated(t)))}</div>
      <button class="more" data-more title="Thao tác">⋮</button></div>`;
  }
  function cardHtml(t) {
    const pct = progress(t);
    return `<div class="tcard" data-id="${esc(t.id)}" tabindex="0">
      <div class="tc-top">${dot(t)}<span class="status ${esc(t.status)}">${esc(C.TASK_VI[t.status] || t.status)}</span>${t.attention ? '<span class="status attention">⚠ cần xem</span>' : ''}<button class="star${V.stars.has(t.id) ? ' on' : ''}" data-star>${V.stars.has(t.id) ? '★' : '☆'}</button><button class="more" data-more>⋮</button></div>
      <b class="tc-title">${esc(t.title)}</b>
      <small>${esc(who(t))} · ${t.projectId ? `📁 ${esc(projName(t.projectId))}` : 'ngoài dự án'}</small>
      <div class="pbar"><i style="width:${pct}%"></i></div>
      <div class="tc-foot"><span class="c-people">${assignees(t).map((a) => C.av(a, 'av xs')).join('')}</span><small>${C.fmt(C.total(t.usage))} token · ${esc(C.dateTime(updated(t)))}</small></div></div>`;
  }
  function bindItems(el) {
    $$('[data-id]', el).forEach((row) => {
      const t = C.S.tasks.get(row.dataset.id);
      if (!t) return;
      row.addEventListener('click', (e) => {
        if (e.target.closest('[data-star]')) {
          e.stopPropagation();
          star(t.id);
          return D.changed();
        }
        if (e.target.closest('[data-more]')) {
          e.stopPropagation();
          const r = e.target.getBoundingClientRect();
          return taskMenu(t, r.left, r.bottom + 4);
        }
        C.openTask(t.id);
      });
      row.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        taskMenu(t, e.clientX, e.clientY);
      });
      row.addEventListener('keydown', (e) => e.key === 'Enter' && C.openTask(t.id));
    });
  }
  function taskTable(list, opts = {}) {
    if (!list.length) return `<div class="empty">${opts.empty || 'Không có nhiệm vụ nào khớp.'}</div>`;
    if (V.view === 'grid') return `<div class="tcards">${list.map(cardHtml).join('')}</div>`;
    return `<div class="dtable${opts.noProject ? ' noproj' : ''}" role="table"><div class="dhead" role="row"><span></span><span>Tên</span>${opts.noProject ? '' : '<span>Dự án</span>'}<span>Tiến độ</span><span>Người làm</span><span>Token</span><span>Cập nhật</span><span></span></div>${list.map((t) => rowHtml(t, opts)).join('')}</div>`;
  }
  function toolbar(opts = {}) {
    return `<div class="dv-toolbar">
      <div class="chips">${FILTERS.map(([k, l]) => `<button data-f="${k}" class="${V.filter === k ? 'on' : ''}">${l}${k === 'running' ? ` <em>${tasks().filter(active).length || ''}</em>` : k === 'attention' ? ` <em class="warn">${tasks().filter(needsAttention).length || ''}</em>` : ''}</button>`).join('')}</div>
      <span class="grow"></span>
      ${V.query ? `<button class="chip-q" data-clearq>🔎 “${esc(V.query)}” ✕</button>` : ''}
      <select data-mode title="Chế độ"><option value="">Mọi chế độ</option>${Object.entries(C.MODE_VI).map(([k, v]) => `<option value="${k}" ${V.mode === k ? 'selected' : ''}>${esc(v)}</option>`).join('')}</select>
      <select data-sort title="Sắp xếp">${SORTS.map(([k, v]) => `<option value="${k}" ${V.sort === k ? 'selected' : ''}>${v}</option>`).join('')}</select>
      <div class="seg"><button data-v="list" class="${V.view === 'list' ? 'on' : ''}" title="Danh sách">☰</button><button data-v="grid" class="${V.view === 'grid' ? 'on' : ''}" title="Lưới">▦</button></div>
      ${opts.newBtn ? `<button class="btn primary sm" data-newtask>＋ Nhiệm vụ</button>` : ''}</div>`;
  }
  function bindToolbar(el, rerender) {
    $$('[data-f]', el).forEach((b) => (b.onclick = () => ((V.filter = b.dataset.f), rerender(), syncNav())));
    const m = $('[data-mode]', el);
    if (m) m.onchange = () => ((V.mode = m.value), rerender());
    const s = $('[data-sort]', el);
    if (s) s.onchange = () => ((V.sort = s.value), store.set('sort', V.sort), rerender());
    $$('[data-v]', el).forEach((b) => (b.onclick = () => ((V.view = b.dataset.v), store.set('view', V.view), rerender())));
    const q = $('[data-clearq]', el);
    if (q) q.onclick = () => ((V.query = ''), ($('#gsearch').value = ''), rerender());
  }

  /** Thay renderTaskList của app.js: danh sách nhiệm vụ kiểu Drive. */
  D.renderTasks = (el) => {
    const list = sortList(tasks().filter((t) => matches(t)));
    const title = FILTERS.find(([k]) => k === V.filter)?.[1] || 'Nhiệm vụ';
    el.innerHTML = `<div class="dv-head"><h1>${V.filter === 'all' ? '📋 Nhiệm vụ' : `📋 Nhiệm vụ · ${esc(title)}`}</h1><button class="btn primary sm" data-newtask>＋ Nhiệm vụ mới</button></div>${toolbar()}${taskTable(list, { empty: tasks().length ? 'Không có nhiệm vụ nào khớp bộ lọc.' : 'Chưa có nhiệm vụ nào — bấm <b>＋ Mới</b> để giao việc đầu tiên.' })}`;
    bindToolbar(el, () => D.renderTasks(el));
    bindItems(el);
    $$('[data-newtask]', el).forEach((b) => (b.onclick = () => C.prefillAssign({})));
    crumbs();
  };

  // ── Tổng quan ────────────────────────────────────────────────────────────
  function folderHtml(p, list) {
    const run = list.filter(active).length;
    const att = list.filter(needsAttention).length;
    const tok = list.reduce((n, t) => n + C.total(t.usage), 0);
    const last = list.map(updated).sort().at(-1);
    const cls = p ? p.classification : '';
    return `<div class="folder cls-${esc(cls)}" data-proj="${esc(p ? p.id : NONE)}" tabindex="0">
      <div class="f-top"><span class="f-ico">${p ? '📁' : '🗂'}</span><b>${esc(p ? p.name : 'Ngoài dự án')}</b>${p ? `<button class="more" data-pmore title="Thao tác">⋮</button>` : ''}</div>
      <small>${p ? `${esc(p.id)} · <span class="cls ${esc(cls)}">${esc(C.CLS_VI[cls] || cls)}</span>` : 'thư mục riêng của từng nhiệm vụ'}</small>
      <div class="f-meta"><span>${list.length} nhiệm vụ</span>${run ? `<span class="run">● ${run} đang chạy</span>` : ''}${att ? `<span class="att">⚠ ${att}</span>` : ''}<span>${C.fmt(tok)} token</span></div>
      <small class="f-last">${last ? `cập nhật ${esc(C.dateTime(last))}` : 'chưa có nhiệm vụ'}</small></div>`;
  }
  function bindFolders(el) {
    $$('[data-proj]', el).forEach((f) => {
      f.onclick = (e) => {
        if (e.target.closest('[data-pmore]')) {
          e.stopPropagation();
          const r = e.target.getBoundingClientRect();
          return projectMenu(C.S.projects.find((p) => p.id === f.dataset.proj), r.left, r.bottom + 4);
        }
        openProject(f.dataset.proj);
      };
      f.onkeydown = (e) => e.key === 'Enter' && openProject(f.dataset.proj);
      f.oncontextmenu = (e) => {
        const p = C.S.projects.find((x) => x.id === f.dataset.proj);
        if (!p) return;
        e.preventDefault();
        projectMenu(p, e.clientX, e.clientY);
      };
    });
  }
  function folders(limit) {
    const all = tasks();
    const list = C.S.projects
      .map((p) => ({ p, list: all.filter((t) => t.projectId === p.id) }))
      .sort((a, b) => (a.list.map(updated).sort().at(-1) || '').localeCompare(b.list.map(updated).sort().at(-1) || '') * -1);
    const none = all.filter((t) => !t.projectId);
    const items = [...list.map((x) => folderHtml(x.p, x.list)), folderHtml(null, none)];
    return `<div class="folders">${(limit ? items.slice(0, limit) : items).join('')}</div>`;
  }

  function renderHome() {
    const el = $('#home');
    const all = tasks();
    const run = sortList(all.filter(active));
    const att = sortList(all.filter(needsAttention)).slice(0, 6);
    const recent = sortList(all.slice()).slice(0, 8);
    const week = all.filter((t) => t.status === 'done' && t.finishedAt && Date.now() - new Date(t.finishedAt).getTime() < 7 * 864e5).length;
    const q = V.quota;
    const h = new Date().getHours();
    el.innerHTML = `<div class="home">
      <div class="hero"><h1>${h < 11 ? 'Chào buổi sáng' : h < 14 ? 'Chào buổi trưa' : h < 18 ? 'Chào buổi chiều' : 'Chào buổi tối'}, giám đốc 👋</h1><p>Văn phòng có ${C.S.agents.size} agent · ${run.length} việc đang chạy · ${att.length} việc cần bạn xem.</p></div>
      <div class="quick">
        <button data-q="task"><span>📝</span><b>Nhiệm vụ mới</b><small>Viết prompt, điều phối viên chọn phòng</small></button>
        <button data-q="agent"><span>📌</span><b>Giao riêng</b><small>Một agent làm luôn, nhanh và rẻ</small></button>
        <button data-q="project"><span>📁</span><b>Dự án mới</b><small>Repo/thư mục, lệnh kiểm tra, quyền</small></button>
        <button data-q="prompts"><span>📚</span><b>Thư viện prompt</b><small>Mẫu có sẵn & prompt đã lưu</small></button>
      </div>
      <div class="stats" style="grid-template-columns:repeat(4,1fr)">
        <div class="stat"><span>Đang chạy</span><b>${run.length}</b></div>
        <div class="stat"><span>Cần xem</span><b>${all.filter(needsAttention).length}</b></div>
        <div class="stat"><span>Xong 7 ngày</span><b>${week}</b></div>
        <div class="stat"><span>Token hôm nay</span><b>${q ? C.fmt(C.total(q.today)) : '—'}</b></div></div>
      ${att.length ? `<section><div class="sec-head"><h2>⚠ Cần bạn quyết định</h2><a data-go="attention">Xem tất cả →</a></div>${taskTable(att)}</section>` : ''}
      <section><div class="sec-head"><h2>⚡ Đang chạy</h2><a data-go="running">Xem tất cả →</a></div>${taskTable(run.slice(0, 6), { empty: 'Không có việc đang chạy.' })}</section>
      <section><div class="sec-head"><h2>📁 Dự án</h2><a data-go="projects">Tất cả dự án →</a></div>${folders(8)}</section>
      <section><div class="sec-head"><h2>🕘 Gần đây</h2><a data-go="all">Tất cả nhiệm vụ →</a></div>${taskTable(recent, { empty: 'Chưa có nhiệm vụ nào.' })}</section></div>`;
    $$('[data-q]', el).forEach(
      (b) =>
        (b.onclick = () => {
          const k = b.dataset.q;
          if (k === 'task') C.prefillAssign({});
          if (k === 'agent') C.prefillAssign({ mode: 'agent' });
          if (k === 'project') C.newProject();
          if (k === 'prompts') C.setTab('prompts');
        }),
    );
    $$('[data-go]', el).forEach((a) => (a.onclick = () => (a.dataset.go === 'projects' ? C.setTab('projects') : goTasks(a.dataset.go))));
    bindItems(el);
    bindFolders(el);
  }

  function goTasks(filter) {
    V.filter = filter || 'all';
    C.S.selectedTask = null;
    C.S.taskDetail = null;
    C.setTab('tasks');
  }

  // ── Dự án ────────────────────────────────────────────────────────────────
  function renderProjects() {
    const el = $('#projects-view');
    el.innerHTML = `<div class="dv-head"><h1>📁 Dự án</h1><button class="btn primary sm" data-newproj>＋ Dự án mới</button></div>
      <p class="muted-p">Mỗi dự án là một "thư mục": repo hoặc thư mục làm việc, nhãn dữ liệu, lệnh kiểm tra và nhân sự riêng. Nhấp để mở, chuột phải hoặc ⋮ để thao tác.</p>${folders()}`;
    $('[data-newproj]', el).onclick = () => C.newProject();
    bindFolders(el);
  }

  function openProject(id) {
    V.projectId = id;
    C.S.selectedTask = null;
    C.setTab('project');
  }

  function renderProject() {
    const el = $('#project-view');
    const id = V.projectId;
    const p = id && id !== NONE ? C.S.projects.find((x) => x.id === id) : null;
    if (id !== NONE && !p) return C.setTab('projects');
    const list = sortList(tasks().filter((t) => (p ? t.projectId === p.id : !t.projectId) && matches(t)));
    const workers = [...C.S.agents.values()].filter((a) => C.S.departments.some((d) => d.id === a.department) && (!p?.agents?.length || p.agents.includes(a.id)));
    const chips = p
      ? [
          `<span class="cls ${esc(p.classification)}">${esc(C.CLS_VI[p.classification] || p.classification)}</span>`,
          `<span title="Thư mục làm việc">📂 <code>${esc(p.workspace || `workspaces/${p.id}`)}</code></span>`,
          p.baseRef ? `<span>🌿 từ <code>${esc(p.baseRef)}</code></span>` : '',
          p.runtime ? `<span>⚙ ${esc(p.runtime)}</span>` : '',
          `<span>🛠 ${esc(p.toolAccess || 'exec')}</span>`,
          (p.checkCommands || []).length ? `<span title="${esc(p.checkCommands.join('\n'))}">🧪 ${p.checkCommands.length} lệnh kiểm tra</span>` : '',
          p.department && p.department !== 'auto' ? `<span>🏢 ${esc(p.department === 'joint' ? 'Liên phòng' : C.deptShort(p.department))}</span>` : '',
        ].filter(Boolean)
      : ['<span>Mỗi nhiệm vụ có thư mục làm việc riêng trong <code>workspaces/</code></span>'];
    el.innerHTML = `<div class="dv-head"><h1>${p ? '📁' : '🗂'} ${esc(p ? p.name : 'Ngoài dự án')}</h1>${p ? '<button class="btn ghost sm" data-edit>⚙ Sửa cấu hình</button>' : ''}</div>
      <div class="p-chips">${chips.join('')}</div>
      ${p?.description ? `<p class="muted-p">${esc(p.description)}</p>` : ''}
      <div class="p-compose compose-box">
        <textarea id="pc-brief" rows="3" placeholder="Giao việc ${p ? `trong dự án ${esc(p.name)}` : 'mới'}: mục tiêu, phạm vi, tiêu chí hoàn thành…   (Ctrl+Enter)"></textarea>
        <div class="compose-bar"><div class="prompt-tools" id="pc-tools"></div><span class="grow"></span>
          <label class="c-sel">Giao cho<select id="pc-who"><option value="">${p ? 'Cả phòng (theo cấu hình dự án)' : 'Tự động (điều phối chọn phòng)'}</option>${workers.map((a) => `<option value="${esc(a.id)}">📌 ${esc(a.name)}</option>`).join('')}</select></label>
          <button class="btn primary send" id="pc-send">Giao việc ➤</button></div></div>
      <div class="prompt-check" id="pc-check"></div>
      <div class="p-people"><small>Nhân sự${p?.agents?.length ? ' của dự án' : ''} — nhấp để giao việc riêng:</small>${workers.map((a) => `<button class="pp" data-ag="${esc(a.id)}" title="${esc(a.title)}">${C.av(a.id, 'av xs')}${esc(a.name)}</button>`).join('')}</div>
      <div class="sec-head"><h2>Nhiệm vụ (${list.length})</h2></div>${toolbar()}${taskTable(list, { noProject: true, empty: 'Chưa có nhiệm vụ nào trong dự án này — viết yêu cầu ở ô trên để bắt đầu.' })}`;
    if (p) $('[data-edit]', el).onclick = () => C.editProject(p.id);
    const brief = $('#pc-brief', el);
    window.Director?.attachTools?.($('#pc-tools', el), brief, $('#pc-check', el), p ? 'project' : 'scratch');
    const send = async () => {
      const text = brief.value.trim();
      if (!text) return brief.focus();
      const agentId = $('#pc-who', el).value;
      const body = agentId ? { mode: 'agent', agentId, projectId: p?.id, brief: text } : p ? { mode: 'project', projectId: p.id, brief: text } : { mode: 'auto', brief: text };
      try {
        const t = await C.api('/api/tasks', { method: 'POST', body: JSON.stringify(body) });
        C.S.tasks.set(t.id, t);
        C.toast({ level: 'info', title: `Đã giao ${t.id}`, msg: t.title, taskId: t.id });
        brief.value = '';
        renderProject();
      } catch (e) {
        C.toast({ level: 'error', title: 'Không giao được', msg: e.message });
      }
    };
    $('#pc-send', el).onclick = send;
    brief.onkeydown = (e) => e.key === 'Enter' && (e.ctrlKey || e.metaKey) && (e.preventDefault(), send());
    $$('[data-ag]', el).forEach((b) => (b.onclick = () => window.Director?.assignAgent(b.dataset.ag, { projectId: p?.id })));
    bindToolbar(el, renderProject);
    bindItems(el);
    crumbs();
  }

  // ── Màn prompt (giao việc mới) ──────────────────────────────────────────
  async function renderCompose() {
    const hero = $('#compose-hero');
    if (!hero) return;
    let saved = [];
    try {
      saved = (await C.api('/api/prompts')).slice(0, 4);
    } catch {}
    const tpl = [...saved, ...(window.Director?.builtins || [])].slice(0, 6);
    hero.innerHTML = `<h1>Hôm nay giao việc gì?</h1><p class="muted-p">Viết yêu cầu như nhắn cho một trưởng nhóm giỏi: mục tiêu, phạm vi, tiêu chí hoàn thành, đầu ra. Chọn chế độ ở thanh dưới ô soạn — <b>Giao riêng</b> khi chỉ cần một người làm.</p>
      <div class="tpl">${tpl.map((p, i) => `<button data-tpl="${i}" title="${esc(p.body.slice(0, 200))}">${p.builtin ? '✨' : '📌'} ${esc(p.title)}</button>`).join('')}<button data-tpl="lib">📚 Thư viện…</button></div>`;
    $$('[data-tpl]', hero).forEach(
      (b) =>
        (b.onclick = () => {
          if (b.dataset.tpl === 'lib') return window.Director?.promptLibrary();
          const p = tpl[Number(b.dataset.tpl)];
          const f = $('#task-form');
          f.brief.value = p.body;
          if (!p.builtin) C.api(`/api/prompts/${p.id}/use`, { method: 'POST', body: '{}' }).catch(() => {});
          if (p.mode) C.prefillAssign({ mode: p.mode, agentId: p.agentId, projectId: p.projectId, department: p.department });
          f.brief.dispatchEvent(new Event('input'));
          f.brief.focus();
        }),
    );
  }

  // ── Chi tiết nhiệm vụ: ô soạn (chỉ dẫn bổ sung / giao tiếp nối), gắn sao ─
  D.taskRendered = (t) => {
    const el = $('#task-detail');
    if (!el || el.hidden) return;
    const head = $('.td-head h2', el);
    if (head && !$('[data-star]', head)) {
      head.insertAdjacentHTML('afterbegin', `<button class="star${V.stars.has(t.id) ? ' on' : ''}" data-star title="Gắn sao">${V.stars.has(t.id) ? '★' : '☆'}</button> `);
      $('[data-star]', head).onclick = () => (star(t.id), C.renderTaskDetail(false));
    }
    const back = $('#td-back');
    if (back) back.insertAdjacentHTML('afterend', `${t.projectId ? ` <button class="btn ghost sm back" data-openproj>📁 ${esc(projName(t.projectId))}</button>` : ''} <button class="btn ghost sm back" data-openchat title="Xem nhiệm vụ (và các lượt tiếp nối) dạng hội thoại, trả lời ngay bên dưới">💬 Dạng hội thoại</button>`);
    $('[data-openproj]', el)?.addEventListener('click', () => openProject(t.projectId));
    $('[data-openchat]', el)?.addEventListener('click', () => window.Chat?.open(t.id));
    const live = ['running', 'queued', 'paused'].includes(t.status);
    const old = $('.dock', el);
    const keep = old ? $('textarea', old).value : '';
    old?.remove();
    el.insertAdjacentHTML(
      'beforeend',
      `<div class="dock"><div class="compose-box">
        <textarea rows="2" placeholder="${live ? 'Gửi chỉ dẫn bổ sung — agent áp dụng từ lượt làm việc tiếp theo (vd. "nhớ viết test cho trường hợp rỗng")…' : 'Giao việc tiếp nối nhiệm vụ này — kế thừa dự án/chế độ/agent, báo cáo trước được đưa vào làm đầu vào…'}   (Ctrl+Enter)"></textarea>
        <div class="compose-bar"><small>${live ? '📝 Chỉ dẫn hiện trong hội thoại và vào bối cảnh các lượt gọi sau; lượt đang chạy làm nốt theo yêu cầu cũ.' : `↪ Tạo nhiệm vụ mới tiếp nối ${esc(t.id)}`}</small><span class="grow"></span>
        <button class="btn primary send" data-dock>${live ? 'Gửi chỉ dẫn' : 'Giao tiếp nối ➤'}</button></div></div></div>`,
    );
    const dock = $('.dock', el);
    const ta = $('textarea', dock);
    ta.value = keep;
    const send = async () => {
      const text = ta.value.trim();
      if (!text) return ta.focus();
      if (live) {
        const r = await act(`/api/tasks/${t.id}/notes`, { text }, 'Đã gửi chỉ dẫn');
        if (r) ta.value = '';
      } else {
        try {
          const nt = await C.api('/api/tasks', { method: 'POST', body: JSON.stringify({ brief: text, followUp: t.id }) });
          C.S.tasks.set(nt.id, nt);
          ta.value = '';
          C.toast({ level: 'info', title: `Đã giao tiếp nối ${nt.id}`, msg: nt.title, taskId: nt.id });
          C.openTask(nt.id);
        } catch (e) {
          C.toast({ level: 'error', title: 'Không giao được', msg: e.message });
        }
      }
    };
    $('[data-dock]', dock).onclick = send;
    ta.onkeydown = (e) => e.key === 'Enter' && (e.ctrlKey || e.metaKey) && (e.preventDefault(), send());
    crumbs();
    renderTree();
  };

  // ── Cột trái: cây dự án → nhiệm vụ, gần đây, đồng hồ token ─────────────
  function renderTree() {
    let tree = $('#nav-tree');
    if (!tree) {
      tree = document.createElement('div');
      tree.id = 'nav-tree';
      tree.className = 'tree';
      $('#nav-meter').before(tree);
    }
    const all = tasks();
    const byUpd = (a, b) => updated(b).localeCompare(updated(a));
    const inChat = C.S.tab === 'assign';
    const item = (t) => `<button class="t-task${(C.S.selectedTask === t.id && C.S.tab === 'tasks') || (inChat && window.Chat?.inConv(t.id)) ? ' sel' : ''}" data-t="${esc(t.id)}" title="${esc(t.title)} · ${esc(C.TASK_VI[t.status] || t.status)}">${dot(t)}<span>${esc(t.title)}</span></button>`;
    const projs = C.S.projects
      .map((p) => ({ p, list: all.filter((t) => t.projectId === p.id).sort(byUpd) }))
      .sort((a, b) => (b.list[0] ? updated(b.list[0]) : '').localeCompare(a.list[0] ? updated(a.list[0]) : ''));
    const starred = all.filter((t) => V.stars.has(t.id)).sort(byUpd).slice(0, 8);
    const loose = all.filter((t) => !t.projectId).sort(byUpd).slice(0, 10);
    tree.innerHTML = `${starred.length ? `<div class="nav-sep">⭐ Gắn sao</div>${starred.map(item).join('')}` : ''}
      <div class="nav-sep">Dự án <button class="mini" data-np title="Dự án mới">＋</button></div>
      ${projs
        .map(({ p, list }) => {
          const open = V.expanded[p.id] ?? false;
          const run = list.filter(active).length;
          return `<div class="t-proj${C.S.tab === 'project' && V.projectId === p.id ? ' sel' : ''}"><button class="caret" data-x="${esc(p.id)}" aria-label="Mở/đóng">${open ? '▾' : '▸'}</button><button class="t-pname" data-p="${esc(p.id)}">📁 <span>${esc(p.name)}</span>${run ? `<em>${run}</em>` : ''}</button></div>${open ? `<div class="t-kids">${list.slice(0, 8).map(item).join('') || '<small class="t-empty">chưa có nhiệm vụ</small>'}${list.length > 8 ? `<button class="t-more" data-p="${esc(p.id)}">… ${list.length - 8} nhiệm vụ nữa</button>` : ''}</div>` : ''}`;
        })
        .join('') || '<small class="t-empty">chưa có dự án</small>'}
      <div class="nav-sep">Gần đây · ngoài dự án</div>${loose.map(item).join('') || '<small class="t-empty">—</small>'}`;
    // đang ở màn Prompt → mở dạng hội thoại; nơi khác → trang quản lý nhiệm vụ
    $$('[data-t]', tree).forEach((b) => (b.onclick = () => (C.S.tab === 'assign' && window.Chat ? window.Chat.open(b.dataset.t) : C.openTask(b.dataset.t))));
    $$('[data-p]', tree).forEach((b) => (b.onclick = () => openProject(b.dataset.p)));
    $$('[data-x]', tree).forEach((b) => (b.onclick = () => ((V.expanded[b.dataset.x] = !(V.expanded[b.dataset.x] ?? false)), store.set('expanded', V.expanded), renderTree())));
    const np = $('[data-np]', tree);
    if (np) np.onclick = () => C.newProject();
  }

  async function loadQuota(force) {
    if (!force && V.quota && Date.now() - V.quotaAt < 30000) return V.quota;
    try {
      V.quota = await C.api('/api/quota');
      V.quotaAt = Date.now();
    } catch {}
    return V.quota;
  }
  async function renderMeter() {
    const q = await loadQuota();
    const el = $('#nav-meter');
    if (!el || !q) return;
    const rts = q.runtimes.filter((r) => r.inOrder && !r.disabled);
    el.innerHTML = `<button class="meter" data-mq title="Xem hạn mức chi tiết"><b>⛽ Token hôm nay: ${C.fmt(C.total(q.today))}</b>${rts
      .map((r) => {
        const pct = r.dailyTokenLimit ? Math.round((r.usedToday / r.dailyTokenLimit) * 100) : null;
        const off = r.keyEnv && !r.keySet ? ' · chưa có khóa' : r.health?.until && new Date(r.health.until) > new Date() ? ' · tạm ngừng' : '';
        return `<span class="m-row"><span>${esc(r.label || r.id)}${off}</span>${pct !== null ? `<i class="m-bar"><i style="width:${Math.min(100, pct)}%"></i></i>` : `<small>${C.fmt(r.usedToday)}</small>`}</span>`;
      })
      .join('')}</button>`;
    $('[data-mq]', el).onclick = () => C.setTab('quota');
  }

  // ── Thanh trên vùng chính: đường dẫn + tìm kiếm ─────────────────────────
  const TAB_VI = { home: '🏠 Tổng quan', projects: '📁 Dự án', tasks: '📋 Nhiệm vụ', assign: '💬 Prompt', people: '👥 Nhân sự', prompts: '📚 Thư viện prompt', tokens: '🔢 Token', quota: '⛽ Hạn mức', kpi: '📈 KPI', logs: '🧾 Nhật ký' };
  function crumbs() {
    const el = $('#crumbs');
    if (!el || !C) return;
    const S = C.S;
    const parts = [];
    if (S.tab === 'project') {
      parts.push(['📁 Dự án', () => C.setTab('projects')], [projName(V.projectId === NONE ? null : V.projectId)]);
    } else if (S.tab === 'tasks' && S.selectedTask) {
      const t = S.tasks.get(S.selectedTask);
      if (t?.projectId) parts.push(['📁 Dự án', () => C.setTab('projects')], [projName(t.projectId), () => openProject(t.projectId)]);
      else parts.push(['📋 Nhiệm vụ', () => goTasks(V.filter)]);
      parts.push([t ? t.title : S.selectedTask]);
    } else if (S.tab === 'tasks') {
      parts.push(['📋 Nhiệm vụ', () => goTasks('all')]);
      if (V.filter !== 'all') parts.push([FILTERS.find(([k]) => k === V.filter)?.[1] || V.filter]);
    } else if (S.tab === 'assign') {
      const c = window.Chat?.current();
      if (c) {
        if (c.root.projectId) parts.push(['📁 ' + projName(c.root.projectId), () => openProject(c.root.projectId)]);
        parts.push(['💬 Prompt', () => window.Chat.newConv()], [c.root.title]);
      } else parts.push(['💬 Prompt'], ['Cuộc mới']);
    } else if (S.tab === 'people' && S.selectedAgent) {
      parts.push(['👥 Nhân sự', () => (C.S.selectedAgent = null, C.setTab('people'))], [C.agentName(S.selectedAgent)]);
    } else parts.push([TAB_VI[S.tab] || S.tab]);
    el.innerHTML = parts.map(([l, fn], i) => (fn && i < parts.length - 1 ? `<a data-c="${i}">${esc(l)}</a>` : `<span>${esc(l)}</span>`)).join('<i>›</i>');
    $$('[data-c]', el).forEach((a) => (a.onclick = parts[Number(a.dataset.c)][1]));
  }

  function bindSearch() {
    const input = $('#gsearch');
    const box = $('#gs-results');
    const render = () => {
      const q = input.value.trim().toLowerCase();
      if (!q) return (box.hidden = true);
      const ts = tasks().filter((t) => `${t.title} ${t.id} ${t.brief || ''}`.toLowerCase().includes(q)).sort((a, b) => updated(b).localeCompare(updated(a))).slice(0, 6);
      const ps = C.S.projects.filter((p) => `${p.name} ${p.id} ${p.description || ''}`.toLowerCase().includes(q)).slice(0, 4);
      const as = [...C.S.agents.values()].filter((a) => `${a.name} ${a.id} ${a.title} ${(a.skills || []).join(' ')}`.toLowerCase().includes(q)).slice(0, 4);
      box.innerHTML =
        `${ps.map((p) => `<button data-sp="${esc(p.id)}">📁 <b>${esc(p.name)}</b><small>${esc(p.id)}</small></button>`).join('')}${ts.map((t) => `<button data-st="${esc(t.id)}">${dot(t)}<b>${esc(t.title)}</b><small>${esc(t.id)} · ${esc(C.TASK_VI[t.status] || t.status)}</small></button>`).join('')}${as.map((a) => `<button data-sa="${esc(a.id)}">${C.av(a.id, 'av xs')}<b>${esc(a.name)}</b><small>${esc(a.title.slice(0, 40))}</small></button>`).join('')}` +
        `<button data-sall>🔎 Tìm “${esc(input.value.trim())}” trong mọi nhiệm vụ <kbd>Enter</kbd></button>`;
      box.hidden = false;
      $$('[data-sp]', box).forEach((b) => (b.onmousedown = () => openProject(b.dataset.sp)));
      $$('[data-st]', box).forEach((b) => (b.onmousedown = () => C.openTask(b.dataset.st)));
      $$('[data-sa]', box).forEach((b) => (b.onmousedown = () => C.openAgent(b.dataset.sa)));
      $('[data-sall]', box).onmousedown = all;
    };
    const all = () => {
      V.query = input.value.trim();
      V.filter = 'all';
      box.hidden = true;
      goTasks('all');
    };
    input.oninput = render;
    input.onfocus = render;
    input.onblur = () => setTimeout(() => (box.hidden = true), 150);
    input.onkeydown = (e) => {
      if (e.key === 'Enter') all();
      if (e.key === 'Escape') (input.value = ''), (box.hidden = true), input.blur();
    };
  }

  // ── Ô phụ Văn phòng ──────────────────────────────────────────────────────
  function applySide(mode) {
    const app = $('#app');
    app.classList.toggle('side-hidden', mode === 'hidden');
    app.classList.toggle('side-wide', mode === 'wide');
    const o = C.office();
    if (o) o.disabled = mode === 'hidden' || !!window.Chat?.previewOpen();
    $('#btn-side-toggle')?.classList.toggle('on', mode !== 'hidden');
  }
  function setSide(mode) {
    store.set('side', mode);
    applySide(mode);
  }
  const sideMode = () => store.get('side', innerWidth < 1250 ? 'hidden' : 'open');

  // cột trái thu gọn thành dải biểu tượng (mặc định ở màn Prompt để luồng hội thoại rộng hơn)
  const navKey = () => (C.S.tab === 'assign' ? 'navMiniChat' : 'navMini');
  const navMini = () => store.get(navKey(), C.S.tab === 'assign');
  function applyNav() {
    const on = navMini() && innerWidth > 900;
    $('#app').classList.toggle('nav-mini', on);
    const b = $('#btn-nav-mini');
    if (b) {
      b.textContent = on ? '»' : '«';
      b.title = on ? 'Mở rộng cột trái' : 'Thu gọn cột trái';
    }
  }

  // ── Điều hướng ───────────────────────────────────────────────────────────
  function syncNav() {
    const tab = C.S.tab;
    $$('#sidenav .nav').forEach((b) => {
      const on = b.dataset.tab === tab && (tab !== 'tasks' || (b.dataset.filter || 'all') === V.filter);
      b.classList.toggle('active', on);
    });
    const run = tasks().filter(active).length;
    const att = tasks().filter(needsAttention).length;
    $('#badge-att').textContent = att || '';
    $('#badge-projects').textContent = C.S.projects.length || '';
    $('#badge-tasks').textContent = run || '';
  }

  D.onTab = (tab) => {
    if (!C) return;
    closeCtx();
    if (tab === 'home') renderHome();
    if (tab === 'projects') renderProjects();
    if (tab === 'project') renderProject();
    if (tab === 'prompts') window.Director?.promptLibrary({ container: $('#prompts-view') });
    if (tab === 'assign') {
      renderCompose();
      window.Chat?.show();
    }
    applyNav();
    syncNav();
    crumbs();
    renderTree();
    $('#main .tab-body.active')?.scrollTo?.(0, 0);
  };

  /** Dữ liệu đổi (SSE nhiệm vụ, dự án lưu) → vẽ lại phần đang xem (trừ khi đang ở chi tiết nhiệm vụ: app.js tự cập nhật). */
  D.changed = () => {
    if (!C) return;
    syncNav();
    renderTree();
    const tab = C.S.tab;
    if (tab === 'home') renderHome();
    if (tab === 'projects') renderProjects();
    if (tab === 'project' && !document.activeElement?.closest?.('#project-view .p-compose')) renderProject();
    if (tab === 'tasks' && !C.S.selectedTask) D.renderTasks($('#task-list'));
    if (tab === 'assign') window.Chat?.changed();
  };

  // dùng chung cho chat.js
  Object.assign(D, { setSide, sideMode, phaseLabel, progress, taskMenu, crumbs, openProject, applyNav });

  D.init = () => {
    C = window.CC;
    if (!C) return;
    $$('#sidenav .nav').forEach(
      (b) =>
        (b.onclick = () => {
          if (b.dataset.tab === 'tasks') {
            V.filter = b.dataset.filter || 'all';
            C.S.selectedTask = null;
            C.S.taskDetail = null;
          }
          if (b.dataset.tab === 'people') C.S.selectedAgent = null;
          C.setTab(b.dataset.tab);
        }),
    );
    const nb = $('#btn-new');
    const nm = $('#new-menu');
    nb.onclick = (e) => {
      e.stopPropagation();
      nm.hidden = !nm.hidden;
    };
    document.addEventListener('mousedown', (e) => !nm.contains(e.target) && e.target !== nb && (nm.hidden = true));
    $$('[data-new]', nm).forEach(
      (b) =>
        (b.onclick = () => {
          nm.hidden = true;
          const k = b.dataset.new;
          if (k === 'task') C.prefillAssign({});
          if (k === 'agent') C.prefillAssign({ mode: 'agent' });
          if (k === 'project') C.newProject();
          if (k === 'prompt') window.Director?.editPrompt({ body: '' });
          if (k === 'upload') {
            C.prefillAssign({});
            $('#files').click();
          }
        }),
    );
    bindSearch();
    $('#btn-side-toggle').onclick = () => setSide(sideMode() === 'hidden' ? 'open' : 'hidden');
    $('#btn-side-hide').onclick = () => setSide('hidden');
    $('#btn-side-wide').onclick = () => setSide(sideMode() === 'wide' ? 'open' : 'wide');
    applySide(sideMode());
    $$('#sidenav .nav').forEach((b) => !b.title && (b.title = $('span', b)?.textContent || ''));
    $('#btn-nav-mini').onclick = () => (store.set(navKey(), !navMini()), applyNav());
    addEventListener('resize', () => applyNav());
    document.addEventListener('keydown', (e) => {
      const el = e.target;
      if (el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName || ''))) return;
      if (e.ctrlKey || e.metaKey || e.altKey || document.querySelector('.modal-wrap, .tour')) return;
      if (e.key === '/') {
        e.preventDefault();
        $('#gsearch').focus();
      }
      if (e.key.toLowerCase() === 'v') setSide(sideMode() === 'hidden' ? 'open' : 'hidden');
    });
    renderMeter();
    setInterval(() => loadQuota(true).then(renderMeter), 30000);
    loadQuota().then(() => C.S.tab === 'home' && renderHome());
  };

  window.Drive = D;
})();
