// UX-3: bảng lệnh Ctrl+K (⌘K) — đi tới màn / nhiệm vụ / dự án / agent và thao tác theo ngữ cảnh (nhiệm vụ đang mở),
// tìm không dấu ("duyet ke hoach" khớp "Duyệt kế hoạch"), mục xem gần đây. ↑/↓ chọn · Enter chạy · Esc đóng.
(function () {
  let C = null;
  const esc = (s) => C.esc(s);
  const P = { open: false, items: [], view: [], i: 0 };
  const RECENT_KEY = 'ccoding.recent';
  const norm = (s) =>
    String(s ?? '')
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/đ/g, 'd')
      .replace(/Đ/g, 'D')
      .toLowerCase();
  const recent = {
    get() {
      try {
        return JSON.parse(localStorage.getItem(RECENT_KEY) || '[]');
      } catch {
        return [];
      }
    },
    push(kind, id) {
      try {
        const l = recent.get().filter((x) => !(x.kind === kind && x.id === id));
        l.unshift({ kind, id });
        localStorage.setItem(RECENT_KEY, JSON.stringify(l.slice(0, 12)));
      } catch {}
    },
  };
  P.visit = (kind, id) => id && recent.push(kind, id);

  /** Điểm khớp: 0 = không khớp; cao hơn = tốt hơn (đầu chuỗi > đầu từ > chuỗi con > chữ cái đầu các từ, vd. "dtg" → "Dòng thời gian"). */
  function score(q, text) {
    if (!q) return 1;
    const t = norm(text);
    const initials = t
      .split(/[^a-z0-9]+/)
      .filter(Boolean)
      .map((w) => w[0])
      .join('');
    let total = 0;
    for (const w of q.split(/\s+/).filter(Boolean)) {
      const i = t.indexOf(w);
      if (i === 0) total += 30;
      else if (i > 0 && /[\s\-·_/:(@]/.test(t[i - 1])) total += 20;
      else if (i > 0) total += 10;
      else if (w.length >= 2 && initials.includes(w)) total += 6;
      else return 0;
    }
    return total;
  }

  // ── Danh sách lệnh ───────────────────────────────────────────────────────
  function currentTask() {
    const S = C.S;
    if (S.tab === 'tasks' && S.selectedTask) return S.tasks.get(S.selectedTask);
    if (S.tab === 'assign') {
      const id = window.Chat?.convId?.();
      const c = id && window.Chat?.current?.();
      return c ? S.tasks.get(c.last.id) || c.last : undefined;
    }
    if (S.tab === 'inbox' && window.Inbox?.sel) return S.tasks.get(window.Inbox.sel);
    return undefined;
  }
  const post = (t, path, body, ok) => async () => {
    try {
      const r = await C.api(`/api/tasks/${encodeURIComponent(t.id)}/${path}`, { method: 'POST', body: JSON.stringify(body || {}) });
      if (r?.id) C.S.tasks.set(r.id, r);
      C.toast({ level: 'info', title: ok, msg: t.title });
    } catch (e) {
      C.toast({ level: 'error', title: 'Không thực hiện được', msg: e.message });
    }
  };
  function taskActions(t) {
    const out = [];
    const a = (icon, label, run, hint) => out.push({ group: `Nhiệm vụ đang mở · ${t.title.slice(0, 40)}`, icon, label, hint, run });
    const live = t.status === 'running' || t.status === 'queued';
    const plan = t.status === 'paused' && t.pause?.reason === 'plan';
    a('💬', 'Mở hội thoại', () => window.Chat?.open(t.id));
    a('📋', 'Mở trang nhiệm vụ', () => C.openTask(t.id, 'chat'));
    if ((t.runs || []).length) a('⏱', 'Dòng thời gian các hạng mục', () => C.openTask(t.id, 'timeline'), 'Gantt · đường găng');
    if (window.UX?.hasDiff(t)) a('🧬', 'Xem thay đổi (diff)', () => C.openTask(t.id, 'diff'));
    if (t.finalPath) a('🏁', 'Mở báo cáo cuối', () => C.openTask(t.id, 'final'));
    a('📡', 'Lượt gọi agent', () => C.openTask(t.id, 'calls'));
    if (plan) a('✅', 'Duyệt kế hoạch & thực thi', async () => {
      try {
        await window.Flow.approvePlan(t.id);
        C.toast({ level: 'info', title: 'Đã duyệt kế hoạch', msg: t.title });
      } catch (e) {
        C.toast({ level: 'error', title: 'Không duyệt được', msg: e.message });
      }
    });
    if (t.status === 'running') a('⏸', 'Tạm dừng', post(t, 'pause', {}, 'Đã yêu cầu tạm dừng'));
    if (['paused', 'failed', 'cancelled'].includes(t.status) && !plan) a('▶', 'Chạy tiếp tới khi xong', post(t, 'resume', { budgetMode: 'complete' }, 'Tiếp tục'));
    if (t.status === 'done' && t.attention) a('✅', 'Duyệt kết quả', post(t, 'review', { decision: 'approve' }, 'Đã duyệt kết quả'));
    if (live || t.status === 'paused') a('⏹', 'Hủy nhiệm vụ', () => confirm(`Hủy "${t.title}"?`) && post(t, 'cancel', {}, 'Đã gửi lệnh hủy')());
    if (t.branch && !live) a('🚀', 'Sẵn sàng gộp / đẩy nhánh', () => C.openTask(t.id, 'chat'), 'mở trang nhiệm vụ → 🚀');
    a('↻', 'Giao lại tương tự', () => C.prefillAssign({ mode: t.mode, department: t.department, projectId: t.projectId, agentId: t.agentId, title: t.title, brief: t.brief }));
    a('⧉', 'Chép mã nhiệm vụ', () => navigator.clipboard?.writeText(t.id).then(() => C.toast({ level: 'info', title: `Đã chép ${t.id}`, msg: '' })));
    return out;
  }
  const TAB_ITEMS = [
    ['🏠', 'Tổng quan', 'home'],
    ['💬', 'Prompt — hội thoại', 'assign'],
    ['📥', 'Cần bạn', 'inbox', 'I'],
    ['📁', 'Dự án', 'projects'],
    ['📋', 'Nhiệm vụ', 'tasks'],
    ['⭐', 'Nhiệm vụ gắn sao', 'tasks:starred'],
    ['👥', 'Nhân sự', 'people'],
    ['📚', 'Thư viện prompt', 'prompts'],
    ['🔢', 'Token', 'tokens'],
    ['⛽', 'Hạn mức', 'quota'],
    ['📈', 'KPI agent', 'kpi'],
    ['🧾', 'Nhật ký', 'logs'],
  ];
  function build() {
    const S = C.S;
    const items = [];
    const cur = currentTask();
    if (cur) items.push(...taskActions(cur));
    // gần đây
    for (const r of recent.get()) {
      if (r.kind === 'task' && S.tasks.has(r.id) && r.id !== cur?.id) {
        const t = S.tasks.get(r.id);
        items.push({ group: 'Xem gần đây', icon: '🕘', label: t.title, hint: `${t.id} · ${C.TASK_VI[t.status] || t.status}`, run: () => window.Chat?.open(t.id), recent: true });
      } else if (r.kind === 'project' && S.projects.some((p) => p.id === r.id)) {
        const p = S.projects.find((x) => x.id === r.id);
        items.push({ group: 'Xem gần đây', icon: '📁', label: p.name, hint: p.id, run: () => window.Drive?.openProject(p.id), recent: true });
      }
    }
    for (const [icon, label, tab, key] of TAB_ITEMS)
      items.push({
        group: 'Đi tới',
        icon,
        label,
        hint: key ? `phím ${key}` : '',
        run: () => (tab.startsWith('tasks:') ? window.Drive?.goTasks(tab.split(':')[1]) : (tab === 'people' && (S.selectedAgent = null), C.setTab(tab))),
      });
    const mk = (icon, label, run, hint) => items.push({ group: 'Tạo & thao tác', icon, label, hint, run });
    mk('📝', 'Nhiệm vụ mới', () => C.prefillAssign({}), 'phím N');
    mk('📌', 'Giao riêng cho một agent', () => C.prefillAssign({ mode: 'agent' }));
    mk('📁', 'Dự án mới', () => C.newProject());
    mk('📚', 'Prompt mới', () => window.Director?.editPrompt({ body: '' }));
    mk('📎', 'Tải tệp lên & giao việc', () => (C.prefillAssign({}), document.getElementById('files')?.click()));
    mk('🏢', 'Ẩn/hiện ô Văn phòng', () => window.Drive?.setSide(window.Drive.sideMode() === 'hidden' ? 'open' : 'hidden'), 'phím V');
    mk('🔔', 'Cảnh báo & thông báo trình duyệt', () => document.getElementById('bell')?.click());
    mk('❓', 'Trợ giúp & phím tắt', () => window.Director?.help(), 'phím ?');
    // nhiệm vụ (mới nhất trước), dự án, agent
    const tasks = [...S.tasks.values()].sort((a, b) => String(b.updatedAt || b.createdAt).localeCompare(String(a.updatedAt || a.createdAt)));
    for (const t of tasks) items.push({ group: 'Nhiệm vụ', icon: { running: '⚡', queued: '⏳', paused: '⏸', failed: '❌', done: '✓', cancelled: '⏹' }[t.status] || '•', label: t.title, hint: `${t.id} · ${C.TASK_VI[t.status] || t.status}${t.projectId ? ` · ${t.projectId}` : ''}`, keys: `${t.id} ${t.projectId || ''}`, run: () => window.Chat?.open(t.id), task: true });
    for (const p of S.projects) items.push({ group: 'Dự án', icon: '📁', label: p.name, hint: p.id, keys: p.id, run: () => window.Drive?.openProject(p.id) });
    for (const a of S.agents.values()) items.push({ group: 'Agent', icon: '👤', label: a.name, hint: `@${a.id} · ${a.title || ''}`, keys: `${a.id} ${a.title || ''}`, run: () => C.openAgent(a.id) });
    return items;
  }
  function filter(q) {
    const nq = norm(q).trim();
    if (!nq) {
      // chưa gõ: thao tác của nhiệm vụ đang mở, gần đây, đi tới, tạo — không liệt kê hết nhiệm vụ/agent
      return P.items.filter((x) => !x.task && x.group !== 'Dự án' && x.group !== 'Agent').slice(0, 60);
    }
    const scored = P.items
      .map((x) => {
        const base = score(nq, `${x.label} ${x.keys || ''} ${x.hint || ''}`);
        return { x, s: base ? base + (x.recent ? 5 : 0) + (x.group.startsWith('Nhiệm vụ đang mở') ? 8 : 0) : 0 };
      })
      .filter((r) => r.s > 0);
    // giữ nhóm liền nhau: nhóm có mục khớp tốt nhất lên trước, trong nhóm theo điểm
    const best = new Map();
    for (const r of scored) best.set(r.x.group, Math.max(best.get(r.x.group) ?? 0, r.s));
    return scored
      .sort((a, b) => best.get(b.x.group) - best.get(a.x.group) || (a.x.group === b.x.group ? b.s - a.s : a.x.group.localeCompare(b.x.group)))
      .slice(0, 50)
      .map((r) => r.x);
  }

  // ── Vẽ ────────────────────────────────────────────────────────────────────
  function paint() {
    const ul = document.querySelector('.pal-list');
    if (!ul) return;
    let last = '';
    ul.innerHTML = P.view.length
      ? P.view
          .map((x, i) => {
            const head = x.group !== last ? `<li class="pal-g" role="presentation">${esc(x.group)}</li>` : '';
            last = x.group;
            return `${head}<li role="option" id="pal-${i}" data-i="${i}" aria-selected="${i === P.i}" class="pal-it${i === P.i ? ' on' : ''}"><span class="pal-ic">${esc(x.icon)}</span><span class="pal-l">${esc(x.label)}</span>${x.hint ? `<small>${esc(x.hint)}</small>` : ''}</li>`;
          })
          .join('')
      : '<li class="pal-empty">Không có lệnh nào khớp.</li>';
    document.querySelector('.pal input')?.setAttribute('aria-activedescendant', P.view.length ? `pal-${P.i}` : '');
    ul.querySelector('.pal-it.on')?.scrollIntoView({ block: 'nearest' });
  }
  P.show = () => {
    // menu tương tác của văn phòng (E) bắt phím ở pha capture — đóng trước để gõ vào bảng lệnh không chạy mục menu
    window.Director?.closeMenu?.();
    if (!C) return;
    let wrap = document.querySelector('.pal-wrap');
    if (!wrap) {
      wrap = document.createElement('div');
      wrap.className = 'pal-wrap';
      wrap.innerHTML = `<div class="pal" role="dialog" aria-modal="true" aria-label="Bảng lệnh"><input type="text" role="combobox" aria-expanded="true" aria-controls="pal-list" aria-autocomplete="list" placeholder="Gõ lệnh, tên nhiệm vụ, dự án, agent… (không dấu cũng được)" autocomplete="off" spellcheck="false" /><ul class="pal-list" id="pal-list" role="listbox"></ul><div class="pal-foot"><span><kbd>↑</kbd><kbd>↓</kbd> chọn</span><span><kbd>Enter</kbd> chạy</span><span><kbd>Esc</kbd> đóng</span><span class="grow"></span><span><kbd>Ctrl</kbd>+<kbd>K</kbd></span></div></div>`;
      document.body.appendChild(wrap);
      const input = wrap.querySelector('input');
      input.addEventListener('input', () => {
        P.view = filter(input.value);
        P.i = 0;
        paint();
      });
      input.addEventListener('keydown', (e) => {
        if (e.key === 'ArrowDown' || (e.key === 'n' && e.ctrlKey)) {
          e.preventDefault();
          P.i = Math.min(P.view.length - 1, P.i + 1);
          paint();
        } else if (e.key === 'ArrowUp' || (e.key === 'p' && e.ctrlKey)) {
          e.preventDefault();
          P.i = Math.max(0, P.i - 1);
          paint();
        } else if (e.key === 'Enter') {
          e.preventDefault();
          run(P.i);
        } else if (e.key === 'Escape') {
          e.preventDefault();
          P.hide();
        }
      });
      wrap.addEventListener('mousedown', (e) => {
        if (e.target === wrap) P.hide();
      });
      wrap.querySelector('.pal-list').addEventListener('click', (e) => {
        const li = e.target.closest('[data-i]');
        if (li) run(Number(li.dataset.i));
      });
    }
    P.prevFocus = document.activeElement;
    P.items = build();
    P.view = filter('');
    P.i = 0;
    wrap.hidden = false;
    P.open = true;
    const input = wrap.querySelector('input');
    input.value = '';
    paint();
    input.focus();
  };
  P.hide = () => {
    const wrap = document.querySelector('.pal-wrap');
    if (wrap) wrap.hidden = true;
    P.open = false;
    if (P.prevFocus?.isConnected) P.prevFocus.focus?.();
  };
  function run(i) {
    const x = P.view[i];
    if (!x) return;
    P.hide();
    // chạy sau khi đóng (lệnh có thể mở hộp thoại khác / chuyển màn)
    setTimeout(() => x.run(), 0);
  }
  P.init = () => {
    C = window.CC;
    document.addEventListener(
      'keydown',
      (e) => {
        if ((e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && e.key.toLowerCase() === 'k') {
          if (document.querySelector('.modal-wrap, .tour')) return;
          e.preventDefault();
          e.stopImmediatePropagation();
          return P.open ? P.hide() : P.show();
        }
      },
      true,
    );
  };
  window.Palette = P;
})();
