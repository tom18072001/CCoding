// UX-1: URL riêng cho từng màn (nút Back/Forward, mở tab mới, gửi link), tín hiệu "chờ bạn" trên tiêu đề tab + favicon,
// thông báo trình duyệt khi nhiệm vụ xong / tạm dừng / lỗi / cần xem. Thông báo chỉ có tiêu đề + trạng thái, không có nội dung.
//   #/home · #/chat · #/chat/<id> · #/task/<id>[/<tab>] · #/tasks[/<lọc>] · #/projects · #/project/<id> · #/agent/<id> · #/people …
(function () {
  let C = null;
  let ready = false;
  let applying = false;
  let hold = ''; // URL đang chờ tải dữ liệu (vd. hội thoại của nhiệm vụ vừa giao) — chưa ghi đè
  const R = {};
  const TABS = ['home', 'assign', 'projects', 'tasks', 'people', 'prompts', 'tokens', 'quota', 'kpi', 'logs'];
  const VIEWS = ['chat', 'final', 'files', 'tokens', 'events', 'calls', 'diff'];
  const enc = encodeURIComponent;
  const needsYou = (t) => !!t.attention || t.status === 'paused' || t.status === 'failed';
  const activeSt = (s) => s === 'running' || s === 'queued';

  // ── Định tuyến ───────────────────────────────────────────────────────────
  function current() {
    const S = C.S;
    const tab = S.tab;
    if (tab === 'tasks' && S.selectedTask) return `#/task/${enc(S.selectedTask)}${S.taskView && S.taskView !== 'chat' ? `/${S.taskView}` : ''}`;
    if (tab === 'tasks') {
      const f = window.Drive?.filter?.();
      return f && f !== 'all' ? `#/tasks/${enc(f)}` : '#/tasks';
    }
    if (tab === 'assign') {
      const id = window.Chat?.convId?.();
      return id ? `#/chat/${enc(id)}` : '#/chat';
    }
    if (tab === 'project') {
      const id = window.Drive?.projectId?.();
      return id ? `#/project/${enc(id)}` : '#/projects';
    }
    if (tab === 'people' && S.selectedAgent) return `#/agent/${enc(S.selectedAgent)}`;
    return `#/${tab}`;
  }
  /** Gọi sau mỗi lần đổi màn: ghi URL mới vào lịch sử trình duyệt (không ghi trùng). */
  R.sync = () => {
    if (!ready || applying || !C) return;
    if (hold && location.hash === hold) return;
    hold = '';
    const h = current();
    if (h !== location.hash) history.pushState(null, '', h);
  };
  function apply(hash) {
    const parts = String(hash || '')
      .replace(/^#\/?/, '')
      .split('/')
      .filter(Boolean)
      .map((x) => {
        try {
          return decodeURIComponent(x);
        } catch {
          return x;
        }
      });
    if (!parts.length) return false;
    const [k, id, sub] = parts;
    applying = true;
    try {
      if (k === 'task' && id) C.openTask(id, VIEWS.includes(sub) ? sub : undefined);
      else if (k === 'chat') {
        if (id && C.S.tasks.has(id)) window.Chat.open(id);
        else if (id) {
          // nhiệm vụ vừa giao (SSE chưa tới) hoặc cũ ngoài 100 việc gần nhất → tải rồi mở
          hold = `#/chat/${enc(id)}`;
          C.api(`/api/tasks/${enc(id)}`)
            .then((d) => {
              if (location.hash !== hold) return;
              hold = '';
              C.S.tasks.set(d.task.id, { ...d.task, ...(C.S.tasks.get(d.task.id) || {}) });
              applying = true;
              try {
                window.Chat.open(d.task.id);
              } finally {
                applying = false;
              }
            })
            .catch(() => {
              hold = '';
              C.toast({ level: 'warn', title: 'Không mở được hội thoại', msg: `Không có nhiệm vụ ${id}` });
            });
          if (C.S.tab !== 'assign') {
            window.Chat.reset();
            C.setTab('assign');
          }
        } else {
          window.Chat.reset();
          C.setTab('assign');
        }
      } else if (k === 'project' && id) window.Drive.openProject(id);
      else if (k === 'agent' && id && C.S.agents.has(id)) C.openAgent(id);
      else if (k === 'tasks') window.Drive.goTasks(id || 'all');
      else if (TABS.includes(k)) {
        if (k === 'people') C.S.selectedAgent = null;
        C.setTab(k);
      } else return false;
    } finally {
      applying = false;
    }
    return true;
  }
  const onNav = () => location.hash !== current() && apply(location.hash);

  // ── Tín hiệu "chờ bạn": tiêu đề tab + favicon ────────────────────────────
  const BASE_ICON = "<rect width='16' height='16' rx='3' fill='%231c2130'/><rect x='3' y='3' width='4' height='4' fill='%232563eb'/><rect x='9' y='3' width='4' height='4' fill='%237c3aed'/><rect x='3' y='9' width='10' height='4' fill='%23f59e0b'/>";
  const icon = (dot) => `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'%3E${BASE_ICON}${dot ? "<circle cx='12.5' cy='3.5' r='3.5' fill='%23ef4444' stroke='%230d1017'/>" : ''}%3C/svg%3E`;
  let lastBadge = '';
  function badge() {
    const all = [...C.S.tasks.values()];
    const n = all.filter(needsYou).length;
    const run = all.filter((t) => activeSt(t.status)).length;
    const sig = `${n}|${run}`;
    if (sig === lastBadge) return;
    lastBadge = sig;
    document.title = `${n ? `(${n}) ` : ''}${run ? '▶ ' : ''}CCoding Office`;
    const link = document.querySelector("link[rel='icon']");
    if (link) link.href = icon(n > 0);
  }

  // ── Thông báo trình duyệt ────────────────────────────────────────────────
  const KINDS = { done: '✅ Nhiệm vụ xong', attention: '⚠ Xong — cần bạn xem lại', paused: '⏸ Tạm dừng — chờ bạn quyết', failed: '❌ Nhiệm vụ lỗi' };
  const DEF = { on: false, when: 'hidden', sound: false, hideTitle: false, kinds: { done: true, attention: true, paused: true, failed: true } };
  const cfg = () => {
    try {
      const v = JSON.parse(localStorage.getItem('ccoding.notify') || 'null');
      return v ? { ...DEF, ...v, kinds: { ...DEF.kinds, ...(v.kinds || {}) } } : { ...DEF, kinds: { ...DEF.kinds } };
    } catch {
      return { ...DEF, kinds: { ...DEF.kinds } };
    }
  };
  const save = (c) => {
    try {
      localStorage.setItem('ccoding.notify', JSON.stringify(c));
    } catch {}
  };
  const supported = () => 'Notification' in window && window.isSecureContext;
  const seen = new Map(); // taskId → { status, att }
  function kindOf(prev, t) {
    if (!prev) return null;
    if (t.status === 'done' && activeSt(prev.status)) return t.attention ? 'attention' : 'done';
    if (t.status === 'done' && t.attention && !prev.att) return 'attention';
    if (t.status === 'paused' && prev.status !== 'paused') return 'paused';
    if (t.status === 'failed' && prev.status !== 'failed') return 'failed';
    return null;
  }
  function beep() {
    try {
      const ac = new (window.AudioContext || window.webkitAudioContext)();
      const o = ac.createOscillator();
      const g = ac.createGain();
      o.frequency.value = 880;
      g.gain.setValueAtTime(0.08, ac.currentTime);
      g.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + 0.35);
      o.connect(g).connect(ac.destination);
      o.start();
      o.stop(ac.currentTime + 0.36);
      o.onended = () => ac.close();
    } catch {}
  }
  function notify(kind, t) {
    const c = cfg();
    if (!c.on || !c.kinds[kind] || !supported() || Notification.permission !== 'granted') return;
    if (c.when === 'hidden' && document.visibilityState === 'visible' && document.hasFocus()) return;
    // nhãn Bảo mật/Hạn chế hoặc người dùng chọn ẩn → chỉ mã nhiệm vụ, không có tiêu đề (màn khóa, chia sẻ màn hình)
    const secret = c.hideTitle || ['confidential', 'restricted'].includes(t.classification);
    const why = kind === 'paused' && t.pause?.reason ? ` · ${C.PAUSE_VI[t.pause.reason] || t.pause.reason}` : '';
    try {
      const n = new Notification(KINDS[kind], { body: `${secret ? t.id : String(t.title || t.id).slice(0, 120)}${why}`, tag: `ccoding-${t.id}`, icon: icon(kind !== 'done') });
      n.onclick = () => {
        window.focus();
        location.hash = `#/chat/${enc(t.id)}`;
        n.close();
      };
      if (c.sound) beep();
    } catch {}
  }
  R.onTask = (t) => {
    if (!C || !t?.id) return;
    const prev = seen.get(t.id);
    seen.set(t.id, { status: t.status, att: !!t.attention });
    badge();
    const k = kindOf(prev, t);
    if (k) notify(k, t);
  };

  /** Phần cài đặt thông báo ở đầu bảng 🔔 Cảnh báo. */
  R.settingsHtml = () => {
    const c = cfg();
    const esc = C.esc;
    if (!supported()) return `<div class="nt-set"><b>Thông báo trình duyệt</b><small>Chỉ dùng được khi mở CCoding qua http://127.0.0.1 hoặc localhost (trình duyệt chặn ở địa chỉ khác).</small></div>`;
    const perm = Notification.permission;
    return `<div class="nt-set">
      <label class="check"><input type="checkbox" data-nt="on"${c.on && perm === 'granted' ? ' checked' : ''} /> <b>Thông báo trình duyệt</b></label>
      ${perm === 'denied' ? '<small class="bad">Trình duyệt đang chặn thông báo của trang này — mở lại quyền trong cài đặt trang (biểu tượng ổ khóa ở thanh địa chỉ).</small>' : ''}
      <div class="nt-kinds">${Object.entries(KINDS)
        .map(([k, l]) => `<label class="check"><input type="checkbox" data-nt-k="${esc(k)}"${c.kinds[k] ? ' checked' : ''} /> ${esc(l)}</label>`)
        .join('')}</div>
      <div class="nt-row"><label>Khi nào <select data-nt="when"><option value="hidden"${c.when === 'hidden' ? ' selected' : ''}>Khi không xem CCoding</option><option value="always"${c.when === 'always' ? ' selected' : ''}>Luôn luôn</option></select></label>
      <label class="check"><input type="checkbox" data-nt="sound"${c.sound ? ' checked' : ''} /> âm báo</label>
      <label class="check" title="Nhiệm vụ nhãn Bảo mật/Hạn chế luôn chỉ hiện mã"><input type="checkbox" data-nt="hideTitle"${c.hideTitle ? ' checked' : ''} /> chỉ hiện mã nhiệm vụ</label>
      <button type="button" class="btn ghost sm" data-nt="test">Thử</button></div>
    </div>`;
  };
  R.bindSettings = (box) => {
    const set = (patch) => save({ ...cfg(), ...patch });
    const on = box.querySelector('[data-nt="on"]');
    if (!on) return;
    on.onchange = async () => {
      if (on.checked && Notification.permission !== 'granted') {
        const p = await Notification.requestPermission().catch(() => 'denied');
        if (p !== 'granted') {
          on.checked = false;
          set({ on: false });
          return C.toast({ level: 'warn', title: 'Chưa bật được thông báo', msg: 'Trình duyệt không cho phép — kiểm tra quyền thông báo của trang.' });
        }
      }
      set({ on: on.checked });
    };
    box.querySelectorAll('[data-nt-k]').forEach((x) => (x.onchange = () => set({ kinds: { ...cfg().kinds, [x.dataset.ntK]: x.checked } })));
    box.querySelector('[data-nt="when"]').onchange = (e) => set({ when: e.target.value });
    box.querySelector('[data-nt="sound"]').onchange = (e) => set({ sound: e.target.checked });
    box.querySelector('[data-nt="hideTitle"]').onchange = (e) => set({ hideTitle: e.target.checked });
    box.querySelector('[data-nt="test"]').onclick = () => {
      const c = cfg();
      if (!c.on || Notification.permission !== 'granted') return C.toast({ level: 'info', title: 'Bật thông báo trước', msg: 'Tích "Thông báo trình duyệt" rồi cho phép khi trình duyệt hỏi.' });
      try {
        new Notification('🔔 CCoding Office', { body: 'Thông báo đang hoạt động.', tag: 'ccoding-test', icon: icon(false) });
        if (c.sound) beep();
      } catch {}
    };
  };

  R.init = () => {
    C = window.CC;
    if (!C) return;
    for (const t of C.S.tasks.values()) seen.set(t.id, { status: t.status, att: !!t.attention });
    badge();
    ready = true;
    if (!apply(location.hash)) history.replaceState(null, '', current());
    addEventListener('popstate', onNav);
    addEventListener('hashchange', onNav);
  };

  window.Router = R;
})();
