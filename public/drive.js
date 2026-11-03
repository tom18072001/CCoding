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
    // UX-4: mặc định xem dạng cây (khóa mới để người đang dùng "danh sách" cũng chuyển sang cây một lần)
    view: store.get('view2', 'tree'),
    tree: store.get('treeOpen', {}),
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
    const ph = C.PHASES.find(([k]) => k === t.phase) || (t.phase === 'finalize' ? ['', 'Thảo luận'] : t.phase === 'revise' ? ['', 'Sửa theo review'] : t.phase === 'route' ? ['', 'Định tuyến'] : t.phase === 'accept' ? ['', 'CTO nghiệm thu'] : null);
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
      if (!`${t.title} ${t.id} ${C.code(t)} ${t.brief || ''} ${t.projectId || ''} ${t.agentId || ''}`.toLowerCase().includes(q)) return false;
    }
    return true;
  }
  function star(id, on) {
    if (on ?? !V.stars.has(id)) V.stars.add(id);
    else V.stars.delete(id);
    store.set('stars', [...V.stars]);
  }
  const dot = (t) => `<span class="sdot s-${esc(t.status)}${t.attention ? ' att' : ''}" title="${esc(C.TASK_VI[t.status] || t.status)}"></span>`;

  // ── Cây nhiệm vụ kiểu issue tracker (UX-4) ───────────────────────────────
  // cha của một nhiệm vụ: nhiệm vụ gốc khi được tách ra từ một hạng mục, hoặc nhiệm vụ trước khi là việc nối tiếp
  const parentOf = (t) => t.splitFrom?.taskId || t.followUpOf || null;
  const isLive = (t) => t.status === 'running';
  const DAY = 86400e3;
  /** Thời gian tương đối ngắn: vừa xong · 7 phút · 3 giờ · 2 ngày. */
  function rel(iso) {
    const ms = Date.now() - Date.parse(iso);
    if (!(ms >= 0)) return '';
    const m = Math.floor(ms / 60000);
    if (m < 1) return 'vừa xong';
    if (m < 60) return `${m} phút`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h} giờ`;
    const d = Math.floor(h / 24);
    return d < 30 ? `${d} ngày` : new Date(iso).toLocaleDateString('vi-VN');
  }
  const SUB_VI = { pending: 'Chưa làm', running: 'Đang làm', done: 'Xong', failed: 'Lỗi', skipped: 'Bỏ qua' };
  /** Biểu tượng trạng thái hình tròn (chưa làm ○ · đang chạy ◔ quay · xong ✓ · lỗi ✕ · tạm dừng ‖ · hủy/bỏ qua −). */
  function si(status, opts = {}) {
    const label = opts.label || C.TASK_VI[status] || SUB_VI[status] || status;
    return `<span class="si si-${esc(status)}${opts.att ? ' att' : ''}" role="img" aria-label="${esc(label)}" title="${esc(label)}"></span>`;
  }
  const subsOf = (t) => (t.runs || []).flatMap((r) => r.subtasks.filter((x) => !x.splitTo).map((x) => ({ r, s: x })));
  /**
   * Số việc đang chạy ngay bên dưới một dòng (mỗi việc đếm một lần): hạng mục đang làm của chính nhiệm vụ này + nhiệm vụ con đang
   * chạy ở mọi tầng (hạng mục của nhiệm vụ con được đếm ở dòng của nhiệm vụ con, không cộng lên dòng cha).
   */
  function liveBelow(t, kids) {
    const own = isLive(t) ? subsOf(t).filter((x) => x.s.status === 'running').length : 0;
    return own + liveTasksBelow(t, kids);
  }
  function liveTasksBelow(t, kids, seen = new Set()) {
    if (seen.has(t.id)) return 0;
    seen.add(t.id);
    let n = 0;
    for (const k of kids.get(t.id) || []) n += (isLive(k) ? 1 : 0) + liveTasksBelow(k, kids, seen);
    return n;
  }
  /** Lần cập nhật mới nhất trong cả nhánh (nhiệm vụ + mọi nhiệm vụ con) — để xếp gốc và đặt vạch "Cũ hơn một ngày". */
  function latestIn(t, kids, memo, seen = new Set()) {
    if (memo.has(t.id)) return memo.get(t.id);
    let v = updated(t);
    if (!seen.has(t.id)) {
      seen.add(t.id);
      for (const k of kids.get(t.id) || []) {
        const x = latestIn(k, kids, memo, seen);
        if (x > v) v = x;
      }
    }
    memo.set(t.id, v);
    return v;
  }
  /** Còn nhiệm vụ con chưa xong (đang chạy, chờ chạy, tạm dừng) ở bất kỳ tầng nào bên dưới. */
  function pendingBelow(t, kids, seen = new Set()) {
    if (seen.has(t.id)) return false;
    seen.add(t.id);
    return (kids.get(t.id) || []).some((k) => ['running', 'queued', 'paused'].includes(k.status) || pendingBelow(k, kids, seen));
  }
  function treeRow(t, depth, ctx) {
    const kids = ctx.flat ? [] : ctx.kids.get(t.id) || [];
    const subs = subsOf(t);
    const below = liveBelow(t, ctx.kids);
    const has = kids.length + subs.length > 0;
    // tự mở: nhiệm vụ đang chạy hoặc còn việc con chưa xong; người dùng đã mở/đóng thì theo lựa chọn đó
    const recent = kids.length && Date.now() - Date.parse(latestIn(t, ctx.kids, ctx.memo)) < DAY;
    const open = has && (V.tree[t.id] ?? (!ctx.collapsed && (isLive(t) || below > 0 || pendingBelow(t, ctx.kids) || recent || (ctx.searching && kids.length > 0))));
    const multi = (t.runs || []).length > 1;
    const p = parentOf(t);
    const orphan = p && !ctx.inList.has(p) ? C.S.tasks.get(p) : null;
    const pills = `${isLive(t) ? '<span class="lp">● đang chạy</span>' : ''}${t.status === 'paused' && t.pause?.reason === 'plan' ? '<span class="lp warn">chờ duyệt kế hoạch</span>' : ''}${t.attention ? `<span class="lp warn" title="${esc(t.attention.detail)}">⚠ cần xem</span>` : ''}${below ? `<span class="lp o" title="${below} việc đang chạy bên dưới (hạng mục, nhiệm vụ con)">↳ ${below} đang chạy</span>` : ''}`;
    let html = `<div class="trow${C.S.selectedTask === t.id ? ' sel' : ''}" style="--d:${depth}" data-id="${esc(t.id)}" tabindex="0" role="treeitem" aria-level="${depth + 1}"${has ? ` aria-expanded="${open}"` : ''}>
      ${has ? `<button class="tcar" data-tog aria-label="${open ? 'Thu gọn' : 'Mở rộng'}">${open ? '▾' : '▸'}</button>` : '<span></span>'}
      ${si(t.status, { att: !!t.attention })}
      <div class="tmain"><span class="tc" title="${esc(t.id)}">${esc(C.code(t))}</span>${pills}<span class="tt">${esc(t.title)}</span>${
        orphan ? `<small class="tpar" title="${esc(orphan.title)}">↪ ${esc(C.code(orphan))}</small>` : ''
      }${ctx.noProject || !t.projectId ? '' : `<small class="tproj">📁 ${esc(projName(t.projectId))}</small>`}</div>
      <div class="c-people">${assignees(t).slice(0, 3).map((a) => C.av(a, 'av xs')).join('')}</div>
      <time title="${esc(new Date(updated(t)).toLocaleString('vi-VN'))}">${esc(rel(updated(t)))}</time>
      <span class="tact"><button class="star${V.stars.has(t.id) ? ' on' : ''}" data-star title="Gắn sao">${V.stars.has(t.id) ? '★' : '☆'}</button><button class="more" data-more title="Thao tác">⋮</button></span></div>`;
    if (!open) return html;
    for (const { r, s: x } of subs) {
      const run = x.status === 'running' && isLive(t);
      html += `<div class="trow sub" style="--d:${depth + 1}" data-id="${esc(t.id)}" data-sub="${esc(x.id)}" tabindex="-1" role="treeitem" aria-level="${depth + 2}">
        <span></span>${si(x.status === 'running' && !isLive(t) ? 'pending' : x.status)}
        <div class="tmain"><span class="tc">${multi ? `${esc(C.deptShort(r.department))}·` : ''}${esc(x.id)}</span>${run ? '<span class="lp">● đang làm</span>' : ''}<span class="tt">${esc(x.title)}</span></div>
        <div class="c-people">${x.assignee ? `${C.av(x.assignee, 'av xs')}<small>${esc(C.agentName(x.assignee))}</small>` : ''}</div>
        <time>${x.attempts > 1 ? `${x.attempts} lần` : ''}</time><span></span></div>`;
    }
    for (const k of kids) html += treeRow(k, depth + 1, ctx);
    return html;
  }
  /** Danh sách dạng cây: nhiệm vụ gốc → hạng mục + nhiệm vụ con (việc nối, việc tách); "Cũ hơn một ngày" khi xếp theo cập nhật. */
  function treeHtml(list, opts = {}) {
    const inList = new Set(list.map((t) => t.id));
    const kids = new Map();
    for (const t of list) {
      const p = parentOf(t);
      if (!opts.flat && p && inList.has(p) && p !== t.id) (kids.get(p) || kids.set(p, []).get(p)).push(t);
    }
    // nhiệm vụ con xếp theo thứ tự tạo (số thứ tự), gốc theo cách sắp xếp đang chọn
    for (const arr of kids.values()) arr.sort((a, b) => (a.seq || 0) - (b.seq || 0) || a.createdAt.localeCompare(b.createdAt));
    const roots = list.filter((t) => opts.flat || !parentOf(t) || !inList.has(parentOf(t)) || parentOf(t) === t.id);
    const ctx = { kids, inList, memo: new Map(), flat: !!opts.flat, collapsed: !!opts.flat, noProject: !!opts.noProject, searching: !!V.query || V.filter !== 'all' || !!V.mode };
    // gốc xếp theo lần cập nhật mới nhất của cả nhánh: việc nối vừa chạy kéo nhiệm vụ gốc cũ lên đầu
    if (!opts.flat && V.sort === 'updated') roots.sort((a, b) => latestIn(b, kids, ctx.memo).localeCompare(latestIn(a, kids, ctx.memo)));
    let old = false;
    const rows = roots
      .map((t) => {
        let sep = '';
        if (!old && !opts.flat && V.sort === 'updated' && Date.now() - Date.parse(latestIn(t, kids, ctx.memo)) > DAY) {
          old = true;
          sep = '<div class="tsep" role="presentation"><span>Cũ hơn một ngày</span></div>';
        }
        return sep + treeRow(t, 0, ctx);
      })
      .join('');
    return `<div class="ttree" role="tree" aria-label="Nhiệm vụ">${rows}</div>`;
  }

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
        { icon: '🔁', label: 'Lặp lại định kỳ…', run: () => window.Pages?.routineFromTask(t) },
        '-',
        t.status === 'running' && { icon: '⏸', label: 'Tạm dừng', run: () => act(`/api/tasks/${t.id}/pause`, {}, 'Đã yêu cầu tạm dừng') },
        ['paused', 'failed', 'cancelled'].includes(t.status) && (t.runs || []).length && { icon: '▶', label: 'Tiếp tục (chạy tới khi xong)', run: () => act(`/api/tasks/${t.id}/resume`, { budgetMode: 'complete' }, 'Đã tiếp tục') },
        ['running', 'queued', 'paused'].includes(t.status) && { icon: '✕', label: 'Hủy nhiệm vụ', danger: true, run: () => confirm(`Hủy "${t.title}"?`) && act(`/api/tasks/${t.id}/cancel`, {}, 'Đã gửi lệnh hủy') },
        { icon: '📋', label: `Sao chép mã nhiệm vụ (${C.code(t)})`, run: () => navigator.clipboard?.writeText(C.code(t)).then(() => C.toast({ level: 'info', title: `Đã chép ${C.code(t)}`, msg: t.title })) },
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
      <div class="c-name">${dot(t)}<div><b>${esc(t.title)}</b><small title="${esc(t.id)}">${esc(C.code(t))} · ${esc(who(t))}${t.followUpOf ? ' · ↪ tiếp nối' : ''}</small></div></div>
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
        if (e.target.closest('[data-tog]')) {
          e.stopPropagation();
          return toggle(row);
        }
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
      row.addEventListener('keydown', (e) => {
        if (e.target !== row) return;
        if (e.key === 'Enter') return C.openTask(t.id);
        // cây: ←/→ thu gọn/mở rộng, ↑/↓ chuyển dòng
        if (row.classList.contains('trow') && ['ArrowRight', 'ArrowLeft', 'ArrowDown', 'ArrowUp'].includes(e.key)) {
          e.preventDefault();
          const exp = row.getAttribute('aria-expanded');
          if (e.key === 'ArrowRight' && exp === 'false') return toggle(row);
          if (e.key === 'ArrowLeft' && exp === 'true') return toggle(row);
          const rows = $$('.trow:not(.sub)', row.closest('.ttree'));
          const i = rows.indexOf(row) + (e.key === 'ArrowDown' ? 1 : e.key === 'ArrowUp' ? -1 : 0);
          rows[Math.max(0, Math.min(rows.length - 1, i))]?.focus();
        }
      });
    });
  }
  /** Mở/đóng một nhánh cây rồi vẽ lại màn đang xem, giữ con trỏ trên dòng đó. */
  /**
   * Vẽ lại một vùng mà không làm mất con trỏ bàn phím: nhớ dòng đang được focus (theo nhiệm vụ + hạng mục) trong vùng đó rồi
   * focus lại dòng tương ứng sau khi vẽ (sự kiện SSE vẽ lại danh sách liên tục khi có việc đang chạy).
   */
  function keepFocus(el, render) {
    const a = document.activeElement;
    const row = el && a && el.contains(a) ? a.closest('[data-id]') : null;
    const id = row?.dataset.id;
    const sub = row?.dataset.sub;
    render();
    if (!id) return;
    const sel = `[data-id="${CSS.escape(id)}"]${sub ? `[data-sub="${CSS.escape(sub)}"]` : ':not([data-sub])'}`;
    $(sel, el)?.focus({ preventScroll: true });
  }
  function toggle(row) {
    const box = row.closest('.tab-body') || document;
    const id = row.dataset.id;
    delete V.tree[id];
    V.tree[id] = row.getAttribute('aria-expanded') !== 'true';
    // chỉ nhớ 300 lần mở/đóng gần nhất
    const keys = Object.keys(V.tree);
    for (const k of keys.slice(0, Math.max(0, keys.length - 300))) delete V.tree[k];
    store.set('treeOpen', V.tree);
    D.changed();
    $(`.trow[data-id="${CSS.escape(id)}"]:not(.sub)`, box)?.focus({ preventScroll: true });
  }
  function taskTable(list, opts = {}) {
    if (!list.length) return `<div class="empty">${opts.empty || 'Không có nhiệm vụ nào khớp.'}</div>`;
    if (V.view === 'grid') return `<div class="tcards">${list.map(cardHtml).join('')}</div>`;
    if (V.view === 'tree') return treeHtml(list, opts);
    return `<div class="dtable${opts.noProject ? ' noproj' : ''}" role="table"><div class="dhead" role="row"><span></span><span>Tên</span>${opts.noProject ? '' : '<span>Dự án</span>'}<span>Tiến độ</span><span>Người làm</span><span>Token</span><span>Cập nhật</span><span></span></div>${list.map((t) => rowHtml(t, opts)).join('')}</div>`;
  }
  function toolbar(opts = {}) {
    return `<div class="dv-toolbar">
      <div class="chips">${FILTERS.map(([k, l]) => `<button data-f="${k}" class="${V.filter === k ? 'on' : ''}">${l}${k === 'running' ? ` <em>${tasks().filter(active).length || ''}</em>` : k === 'attention' ? ` <em class="warn">${tasks().filter(needsAttention).length || ''}</em>` : ''}</button>`).join('')}</div>
      <span class="grow"></span>
      ${V.query ? `<button class="chip-q" data-clearq>🔎 “${esc(V.query)}” ✕</button>` : ''}
      <select data-mode title="Chế độ"><option value="">Mọi chế độ</option>${Object.entries(C.MODE_VI).map(([k, v]) => `<option value="${k}" ${V.mode === k ? 'selected' : ''}>${esc(v)}</option>`).join('')}</select>
      <select data-sort title="Sắp xếp">${SORTS.map(([k, v]) => `<option value="${k}" ${V.sort === k ? 'selected' : ''}>${v}</option>`).join('')}</select>
      <div class="seg" role="group" aria-label="Kiểu xem"><button data-v="tree" class="${V.view === 'tree' ? 'on' : ''}" title="Cây: nhiệm vụ → hạng mục, việc nối, việc tách" aria-label="Xem dạng cây"><svg class="ic sm" viewBox="0 0 24 24"><path d="M6 3v12"/><path d="M6 9h6a3 3 0 0 1 3 3v0"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="12" r="3"/></svg></button><button data-v="list" class="${V.view === 'list' ? 'on' : ''}" title="Bảng" aria-label="Xem dạng bảng"><svg class="ic sm" viewBox="0 0 24 24"><path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/></svg></button><button data-v="grid" class="${V.view === 'grid' ? 'on' : ''}" title="Lưới" aria-label="Xem dạng lưới"><svg class="ic sm" viewBox="0 0 24 24"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg></button></div>
      ${opts.newBtn ? `<button class="btn primary sm" data-newtask>＋ Nhiệm vụ</button>` : ''}</div>`;
  }
  function bindToolbar(el, rerender) {
    $$('[data-f]', el).forEach((b) => (b.onclick = () => ((V.filter = b.dataset.f), rerender(), syncNav())));
    const m = $('[data-mode]', el);
    if (m) m.onchange = () => ((V.mode = m.value), rerender());
    const s = $('[data-sort]', el);
    if (s) s.onchange = () => ((V.sort = s.value), store.set('sort', V.sort), rerender());
    $$('[data-v]', el).forEach((b) => (b.onclick = () => ((V.view = b.dataset.v), store.set('view2', V.view), rerender())));
    const q = $('[data-clearq]', el);
    if (q) q.onclick = () => ((V.query = ''), ($('#gsearch').value = ''), rerender());
  }

  /** Thay renderTaskList của app.js: danh sách nhiệm vụ kiểu Drive. */
  // mọi nơi vẽ lại danh sách (SSE nhiệm vụ trong app.js, đồng bộ 20 giây, D.changed) đều giữ con trỏ bàn phím
  D.renderTasks = (el) => keepFocus(el, () => renderTaskListInto(el));
  function renderTaskListInto(el) {
    const list = sortList(tasks().filter((t) => matches(t)));
    const title = FILTERS.find(([k]) => k === V.filter)?.[1] || 'Nhiệm vụ';
    el.innerHTML = `<div class="dv-head"><h1>${V.filter === 'all' ? '📋 Nhiệm vụ' : `📋 Nhiệm vụ · ${esc(title)}`}</h1><button class="btn primary sm" data-newtask>＋ Nhiệm vụ mới</button></div>${toolbar()}${taskTable(list, { empty: tasks().length ? 'Không có nhiệm vụ nào khớp bộ lọc.' : 'Chưa có nhiệm vụ nào — bấm <b>＋ Mới</b> để giao việc đầu tiên.' })}`;
    bindToolbar(el, () => D.renderTasks(el));
    bindItems(el);
    $$('[data-newtask]', el).forEach((b) => (b.onclick = () => C.prefillAssign({})));
    crumbs();
  }

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

  // ── Tổng quan kiểu Paperclip (UI-5): agent đang làm · 4 chỉ số · 3 biểu đồ 14 ngày · hoạt động + nhiệm vụ gần đây ──
  const ICON = {
    bot: '<svg class="ic" viewBox="0 0 24 24"><rect x="4" y="8" width="16" height="11" rx="2"/><path d="M12 4v4M9 13h.01M15 13h.01"/></svg>',
    circle: '<svg class="ic" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="3"/></svg>',
    coins: '<svg class="ic" viewBox="0 0 24 24"><ellipse cx="12" cy="6" rx="8" ry="3"/><path d="M4 6v6c0 1.7 3.6 3 8 3s8-1.3 8-3V6"/><path d="M4 12v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6"/></svg>',
    shield: '<svg class="ic" viewBox="0 0 24 24"><path d="M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6Z"/><path d="m9 12 2 2 4-4"/></svg>',
  };
  const homeLogs = { at: 0, rows: [] };
  async function loadHomeLogs() {
    if (Date.now() - homeLogs.at < 15000) return;
    homeLogs.at = Date.now();
    try {
      const rows = await C.api('/api/logs?limit=60');
      homeLogs.rows = (Array.isArray(rows) ? rows : rows.items || []).filter((e) => e.taskId && ACT_VI[e.kind]);
      if (C.S.tab === 'home') renderHome();
    } catch {}
  }
  const dayKey = (d) => new Date(d).toLocaleDateString('sv-SE');
  function last14() {
    const out = [];
    for (let i = 13; i >= 0; i--) out.push(dayKey(Date.now() - i * DAY));
    return out;
  }
  /** Cột nhỏ cho thẻ biểu đồ: series = [{ key, values: [14 số], color }] xếp chồng theo ngày. */
  function bars(series, max) {
    const n = 14;
    const w = 300;
    const h = 72;
    const gap = 4;
    const bw = (w - gap * (n - 1)) / n;
    const top = max || Math.max(1, ...Array.from({ length: n }, (_, i) => series.reduce((s, x) => s + (x.values[i] || 0), 0)));
    let out = '';
    for (let i = 0; i < n; i++) {
      let y = h;
      for (const sr of series) {
        const v = sr.values[i] || 0;
        if (!v) continue;
        const bh = Math.max(2, (v / top) * (h - 4));
        y -= bh;
        out += `<rect x="${(i * (bw + gap)).toFixed(1)}" y="${y.toFixed(1)}" width="${bw.toFixed(1)}" height="${bh.toFixed(1)}" rx="2" fill="${sr.color}"><title>${esc(sr.key)}: ${v}</title></rect>`;
      }
      if (y === h) out += `<rect x="${(i * (bw + gap)).toFixed(1)}" y="${h - 2}" width="${bw.toFixed(1)}" height="2" rx="1" fill="var(--line)"/>`;
    }
    return `<svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" aria-hidden="true">${out}</svg>`;
  }
  const ACT_VI = {
    'task.start': 'bắt đầu',
    'task.done': 'hoàn thành',
    'task.failed': 'gặp lỗi ở',
    'task.paused': 'tạm dừng',
    'task.resumed': 'tiếp tục',
    'task.cancelled': 'hủy',
    'accept.done': 'nghiệm thu',
  };
  function actRow(e) {
    const t = e.taskId ? C.S.tasks.get(e.taskId) : null;
    const who = e.agentId ? C.agentName(e.agentId) : 'Hệ thống';
    const short = (C.S.agents.get(e.agentId)?.short || who).split(/\s+/).map((w) => w[0]).join('').slice(0, 2);
    return `<div class="act"${t ? ` data-id="${esc(t.id)}" style="cursor:pointer"` : ''}><span class="bdg">${esc(short)}</span><div class="tx"><b>${esc(who)}</b> ${esc(ACT_VI[e.kind] || e.kind)}${t ? ` <b>${esc(C.code(t))}</b> ${esc(t.title.slice(0, 60))}` : ''}</div><span class="tm">${esc(rel(e.ts))}</span></div>`;
  }
  function renderHome() {
    const el = $('#home');
    const all = tasks();
    loadHomeLogs();
    const agents = [...C.S.agents.values()];
    const busy = agents.filter((a) => a.state && a.state.status && a.state.status !== 'idle');
    const errs = agents.filter((a) => a.state?.status === 'error').length;
    const run = all.filter((t) => t.status === 'running');
    const queued = all.filter((t) => t.status === 'queued').length;
    const paused = all.filter((t) => t.status === 'paused');
    const att = all.filter(needsAttention);
    const days = last14();
    const byDay = new Map((C.S.usage.byDay || []).map((d) => [d.key, d]));
    const today = byDay.get(days.at(-1));
    const week = days.slice(-7).reduce((s, d) => s + (byDay.get(d) ? C.total(byDay.get(d)) : 0), 0);
    const created = (st) => days.map((d) => all.filter((t) => dayKey(t.createdAt) === d && st(t)).length);
    const doneD = created((t) => t.status === 'done');
    const failD = created((t) => t.status === 'failed' || t.status === 'cancelled');
    const liveD = created((t) => active(t) || t.status === 'paused');
    const sum = (xs) => xs.reduce((s, x) => s + x, 0);
    const finished = sum(doneD) + sum(failD);
    const rate = finished ? Math.round((100 * sum(doneD)) / finished) : null;
    const rateD = days.map((_, i) => (doneD.at(i) + failD.at(i) ? Math.round((100 * doneD.at(i)) / (doneD.at(i) + failD.at(i))) : 0));
    const hold = paused.filter((t) => t.pause && (t.pause.reason === 'budget' || t.pause.reason === 'quota'));
    const recent = sortList(all.slice()).slice(0, 8);
    const short = (d) => new Date(d).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' });
    const agentRows = busy.length
      ? busy
          .slice(0, 8)
          .map(
            (a) =>
              `<div class="ag-row" data-ag="${esc(a.id)}">${C.av(a.id, 'av xs')}<b>${esc(a.name)}</b><small>${esc(a.state?.activity || (a.state?.taskId && C.S.tasks.get(a.state.taskId)?.title) || C.STATUS_VI[a.state?.status] || '')}</small>${a.state?.status === 'error' ? '<span class="pill-live" style="color:var(--red-fg)">Lỗi</span>' : '<span class="pill-live">Đang chạy</span>'}</div>`,
          )
          .join('')
      : '<div class="empty-row">Không agent nào đang chạy.</div>';
    const taskRows = recent.length
      ? recent
          .map(
            (t) =>
              `<div class="trow" data-id="${esc(t.id)}">${si(t.status, { att: !!t.attention })}<span class="code">${esc(C.code(t))}</span><span class="tt">${esc(t.title)}</span>${assignees(t)
                .slice(0, 3)
                .map((id) => C.av(id, 'av xs'))
                .join('')}<span class="tm">${esc(rel(updated(t)))}</span></div>`,
          )
          .join('')
      : '<div class="empty-row">Chưa có nhiệm vụ nào. Bấm <b>Nhiệm vụ mới</b> ở cột trái để bắt đầu.</div>';
    el.innerHTML = `<div class="dash">
      ${hold.length ? `<div class="banner">⚠ ${hold.length} nhiệm vụ đang tạm dừng vì chạm trần ngân sách hoặc hết hạn mức token.<a data-go="quota">Mở Hạn mức →</a></div>` : ''}
      <section><h3 class="lbl">Agent đang làm</h3><div class="box agents-live">${agentRows}</div></section>
      <section class="metrics">
        <div class="metric" data-go="people">${ICON.bot}<b>${busy.length}</b><span>Agent đang làm</span><small>trên ${agents.length} agent · ${errs} lỗi</small></div>
        <div class="metric" data-go="running">${ICON.circle}<b>${run.length}</b><span>Nhiệm vụ đang chạy</span><small>${queued} chờ, ${paused.length} tạm dừng</small></div>
        <div class="metric" data-go="tokens">${ICON.coins}<b>${today ? C.fmt(C.total(today)) : '0'}</b><span>Token hôm nay</span><small>7 ngày: ${C.fmt(week)}${today?.costUsd ? ` · $${today.costUsd.toFixed(2)}` : ''}</small></div>
        <div class="metric" data-go="inbox">${ICON.shield}<b>${att.length}</b><span>Cần bạn</span><small>${att.length ? 'lỗi, tạm dừng hoặc chờ duyệt' : 'không có việc chờ'}</small></div>
      </section>
      <section class="charts">
        <div class="chart"><h4>Lượt gọi model</h4><span class="sub">14 ngày qua</span>${bars([{ key: 'Lượt gọi', values: days.map((d) => byDay.get(d)?.calls || 0), color: 'var(--text-2)' }])}<div class="foot"><span>${short(days[0])}</span><span>hôm nay</span></div></div>
        <div class="chart"><h4>Nhiệm vụ theo trạng thái</h4><span class="sub">Theo ngày tạo, 14 ngày qua</span>${bars([
          { key: 'Xong', values: doneD, color: 'var(--ok)' },
          { key: 'Đang chạy / tạm dừng', values: liveD, color: 'var(--info)' },
          { key: 'Lỗi / hủy', values: failD, color: 'var(--bad)' },
        ])}<div class="legend2"><span><i style="background:var(--ok)"></i>Xong</span><span><i style="background:var(--info)"></i>Đang chạy</span><span><i style="background:var(--bad)"></i>Lỗi / hủy</span></div></div>
        <div class="chart"><h4>Tỉ lệ hoàn thành</h4><span class="sub">${rate === null ? 'Chưa có nhiệm vụ kết thúc' : `${rate}% nhiệm vụ kết thúc là xong`}</span>${bars([{ key: '% xong', values: rateD, color: 'var(--ok)' }], 100)}<div class="foot"><span>${short(days[0])}</span><span>hôm nay</span></div></div>
      </section>
      <section class="cols">
        <div><h3 class="lbl">Hoạt động gần đây</h3><div class="box">${homeLogs.rows.length ? homeLogs.rows.slice(-10).reverse().map(actRow).join('') : '<div class="empty-row">Chưa có hoạt động.</div>'}</div></div>
        <div><h3 class="lbl">Nhiệm vụ gần đây</h3><div class="box">${taskRows}</div></div>
      </section></div>`;
    $$('[data-go]', el).forEach((a) => {
      const g = a.dataset.go;
      a.onclick = () => (['people', 'tokens', 'inbox', 'quota'].includes(g) ? C.setTab(g) : goTasks(g));
    });
    $$('[data-ag]', el).forEach((r) => (r.onclick = () => C.openAgent(r.dataset.ag)));
    $$('[data-id]', el).forEach((r) => (r.onclick = () => C.openTask(r.dataset.id)));
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
    // giám đốc duyệt / yêu cầu sửa bằng tay
    $('.rv-box', el)?.remove();
    const rv = window.Chat?.reviewBox?.(t);
    if (rv) {
      $('.td-head', el)?.insertAdjacentHTML('afterend', rv);
      window.Chat.bindReview(el, () => C.renderTaskDetail(true));
    }
    const live = ['running', 'queued', 'paused'].includes(t.status);
    const old = $('.dock', el);
    const keep = old ? $('textarea', old).value : '';
    old?.remove();
    ($('.td-main', el) || el).insertAdjacentHTML(
      'beforeend',
      `<div class="dock"><div class="compose-box">
        <textarea rows="2" placeholder="${live ? 'Gửi chỉ dẫn bổ sung — agent áp dụng từ lượt làm việc tiếp theo (vd. "nhớ viết test cho trường hợp rỗng")…' : 'Giao việc tiếp nối nhiệm vụ này — kế thừa dự án/chế độ/agent, báo cáo trước được đưa vào làm đầu vào…'}   (Ctrl+Enter)"></textarea>
        <div class="compose-bar"><small>${live ? '📝 Chỉ dẫn hiện trong hội thoại và vào bối cảnh các lượt gọi sau; lượt đang chạy làm nốt theo yêu cầu cũ.' : `↪ Tạo nhiệm vụ mới tiếp nối ${esc(C.code(t))}`}</small>${!live && t.branch && t.projectId ? `<label class="check c-chk" title="Worktree của việc mới tách từ nhánh ${esc(t.branch)}; bỏ chọn: tách từ nhánh xuất phát của dự án"><input type="checkbox" data-cont checked /> 🌿 nối tiếp nhánh</label>` : ''}<span class="grow"></span>
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
          const cont = $('[data-cont]', dock);
          const nt = await C.api('/api/tasks', { method: 'POST', body: JSON.stringify({ brief: text, followUp: t.id, ...(cont ? { continueBranch: cont.checked } : {}) }) });
          C.S.tasks.set(nt.id, nt);
          ta.value = '';
          C.toast({ level: 'info', title: `Đã giao tiếp nối ${C.code(nt)}`, msg: nt.title, taskId: nt.id });
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

  // ── Cột trái (UX-4): dự án ngay dưới mục "Dự án", agent đang làm, nhiệm vụ gần đây ─────────────
  /** Agent đang làm → số việc (hạng mục đang làm trong nhiệm vụ đang chạy; trưởng phòng đang lập kế hoạch/review tính 1). */
  function agentLive() {
    const n = new Map();
    for (const t of tasks())
      if (isLive(t)) for (const r of t.runs || []) for (const x of r.subtasks) if (x.status === 'running' && x.assignee) n.set(x.assignee, (n.get(x.assignee) || 0) + 1);
    for (const a of C.S.agents.values()) {
      const st = a.state;
      if (st && !['idle', 'error', 'waiting'].includes(st.status) && st.taskId && isLive(C.S.tasks.get(st.taskId) || {}) && !n.has(a.id)) n.set(a.id, 1);
    }
    return [...n].sort((x, y) => y[1] - x[1] || C.agentName(x[0]).localeCompare(C.agentName(y[0]), 'vi'));
  }
  function renderTree() {
    const projBox = $('#nav-projects');
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
    // dự án: theo hoạt động gần nhất, kèm số việc đang chạy
    const projs = C.S.projects
      .map((p) => ({ p, list: all.filter((t) => t.projectId === p.id).sort(byUpd) }))
      .sort((a, b) => (b.list[0] ? updated(b.list[0]) : '').localeCompare(a.list[0] ? updated(a.list[0]) : ''));
    const PMAX = 6;
    if (projBox)
      projBox.innerHTML = `${projs
        .slice(0, PMAX)
        .map(({ p, list }) => {
          const run = list.filter(isLive).length;
          return `<button class="nav-p${C.S.tab === 'project' && V.projectId === p.id ? ' sel' : ''}" data-p="${esc(p.id)}" title="${esc(p.name)}${run ? ` · ${run} việc đang chạy` : ''}"><span>${esc(p.name)}</span>${run ? `<em class="live">${run}</em>` : ''}</button>`;
        })
        .join('')}${projs.length > PMAX ? `<button class="nav-p more" data-allp>… ${projs.length - PMAX} dự án nữa</button>` : ''}${projs.length ? '' : '<button class="nav-p more" data-np>＋ Tạo dự án đầu tiên</button>'}`;
    const ag = agentLive();
    const AMAX = 6;
    const item = (t) =>
      `<button class="t-task${(C.S.selectedTask === t.id && C.S.tab === 'tasks') || (inChat && window.Chat?.inConv(t.id)) ? ' sel' : ''}" data-t="${esc(t.id)}" title="${esc(C.code(t))} · ${esc(t.title)} · ${esc(C.TASK_VI[t.status] || t.status)}">${si(t.status, { att: !!t.attention })}<span>${esc(t.title)}</span>${isLive(t) ? '<em class="live" aria-label="đang chạy"></em>' : ''}</button>`;
    tree.innerHTML = `<div class="nav-sep">Agent đang làm <button class="mini" data-people title="Xem tất cả nhân sự">Tất cả</button></div>
      ${
        ag.length
          ? ag
              .slice(0, AMAX)
              .map(([id, n]) => `<button class="t-task t-agent" data-a="${esc(id)}" title="${esc(C.agentName(id))} · ${n} việc đang làm">${C.av(id, 'av xs')}<span>${esc(C.agentName(id))}</span><em class="live">${n}</em></button>`)
              .join('') + (ag.length > AMAX ? `<button class="t-more" data-people>… ${ag.length - AMAX} agent nữa</button>` : '')
          : '<small class="t-empty">Không agent nào đang làm</small>'
      }
      <div class="nav-sep">Gần đây</div>${all.sort(byUpd).slice(0, 6).map(item).join('') || '<small class="t-empty">Chưa có nhiệm vụ</small>'}`;
    // đang ở màn Prompt → mở dạng hội thoại; nơi khác → trang quản lý nhiệm vụ
    $$('[data-t]', tree).forEach((b) => (b.onclick = () => (C.S.tab === 'assign' && window.Chat ? window.Chat.open(b.dataset.t) : C.openTask(b.dataset.t))));
    $$('[data-a]', tree).forEach((b) => (b.onclick = () => C.openAgent(b.dataset.a)));
    $$('[data-people]', tree).forEach((b) => (b.onclick = () => ((C.S.selectedAgent = null), C.setTab('people'))));
    if (projBox) {
      $$('[data-p]', projBox).forEach((b) => (b.onclick = () => openProject(b.dataset.p)));
      const more = $('[data-allp]', projBox);
      if (more) more.onclick = () => C.setTab('projects');
      const np = $('[data-np]', projBox);
      if (np) np.onclick = () => C.newProject();
    }
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
  const TAB_VI = { routines: 'Việc định kỳ', artifacts: 'Sản phẩm', skills: 'Kỹ năng & Kết nối', audit: 'Kiểm toán', home: 'Tổng quan', inbox: 'Cần bạn', projects: 'Dự án', tasks: 'Nhiệm vụ', assign: 'Prompt', people: 'Agent', prompts: 'Thư viện prompt', tokens: 'Token', quota: 'Hạn mức', kpi: 'KPI', logs: 'Nhật ký' };
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
      parts.push(['Agent', () => (C.S.selectedAgent = null, C.setTab('people'))], [C.agentName(S.selectedAgent)]);
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
      const ts = tasks().filter((t) => `${t.title} ${t.id} ${C.code(t)} ${t.brief || ''}`.toLowerCase().includes(q)).sort((a, b) => updated(b).localeCompare(updated(a))).slice(0, 6);
      const ps = C.S.projects.filter((p) => `${p.name} ${p.id} ${p.description || ''}`.toLowerCase().includes(q)).slice(0, 4);
      const as = [...C.S.agents.values()].filter((a) => `${a.name} ${a.id} ${a.title} ${(a.skills || []).join(' ')}`.toLowerCase().includes(q)).slice(0, 4);
      box.innerHTML =
        `${ps.map((p) => `<button data-sp="${esc(p.id)}">📁 <b>${esc(p.name)}</b><small>${esc(p.id)}</small></button>`).join('')}${ts.map((t) => `<button data-st="${esc(t.id)}">${dot(t)}<b>${esc(t.title)}</b><small>${esc(C.code(t))} · ${esc(C.TASK_VI[t.status] || t.status)}</small></button>`).join('')}${as.map((a) => `<button data-sa="${esc(a.id)}">${C.av(a.id, 'av xs')}<b>${esc(a.name)}</b><small>${esc(a.title.slice(0, 40))}</small></button>`).join('')}` +
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
    store.set('side2', mode);
    applySide(mode);
  }
  // UI-5: Văn phòng là ngăn kéo — mặc định đóng (khóa mới để người dùng cũ cũng chuyển một lần)
  const sideMode = () => store.get('side2', 'hidden');

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
    const run = tasks().filter(isLive).length;
    const wait = tasks().filter((t) => t.status === 'queued').length;
    const att = tasks().filter(needsAttention).length;
    $('#badge-att').textContent = att || '';
    $('#badge-projects').textContent = C.S.projects.length || '';
    const b = $('#badge-tasks');
    b.textContent = run || '';
    b.title = `${run} nhiệm vụ đang chạy${wait ? ` · ${wait} đang chờ chạy` : ''}`;
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
    if (tab === 'home') keepFocus($('#home'), renderHome);
    if (tab === 'projects') renderProjects();
    if (tab === 'project' && !document.activeElement?.closest?.('#project-view .p-compose')) keepFocus($('#project-view'), renderProject);
    if (tab === 'tasks' && !C.S.selectedTask) D.renderTasks($('#task-list'));
    if (tab === 'assign') window.Chat?.changed();
  };

  // dùng chung cho chat.js
  Object.assign(D, { renderTree, setSide, sideMode, phaseLabel, progress, taskMenu, crumbs, openProject, applyNav, goTasks, filter: () => V.filter, projectId: () => V.projectId });

  D.init = () => {
    C = window.CC;
    if (!C) return;
    $$('#sidenav .nav').forEach(
      (b) =>
        (b.onclick = () => {
          if (b.dataset.act === 'search') return window.Palette ? window.Palette.show() : $('#gsearch').focus();
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

  // UI-5: dùng ở trang chi tiết nhiệm vụ (biểu tượng trạng thái, mở dự án từ bảng Thuộc tính)
  D.statusIcon = (status) => si(status);
  D.openProject = (id) => openProject(id);
  window.Drive = D;
})();
