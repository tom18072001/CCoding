// UX-3: hộp "📥 Cần bạn" — mọi việc chờ giám đốc quyết (kế hoạch chờ duyệt, tạm dừng, lỗi, xong nhưng cần xem), duyệt bằng phím
// kiểu triage: J/K chọn · Enter mở hội thoại · O trang nhiệm vụ · 1 hành động chính · 2 hành động phụ · H hoãn 4 giờ · X hủy · Z hoàn tác.
// Hành động chính/phụ chờ 4 giây trước khi gửi (Z để hoàn tác) — duyệt nhầm không tốn token.
(function () {
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  let C = null;
  const esc = (s) => C.esc(s);
  const IB = { sel: null, showSnoozed: false, pending: null };
  const UNDO_MS = 4000;
  const SNOOZE_MS = 4 * 3600e3;
  const snz = {
    get() {
      try {
        return JSON.parse(localStorage.getItem('ccoding.snooze') || '{}');
      } catch {
        return {};
      }
    },
    set(v) {
      try {
        localStorage.setItem('ccoding.snooze', JSON.stringify(v));
      } catch {}
    },
  };

  /** Loại việc + hành động theo trạng thái. */
  function kindOf(t) {
    if (t.status === 'paused' && t.pause?.reason === 'plan') return 'plan';
    if (t.status === 'paused') return 'paused';
    if (t.status === 'failed') return 'failed';
    if (t.status === 'done' && t.attention) return 'attention';
    return null;
  }
  const KIND = {
    plan: { icon: '📝', label: 'Kế hoạch chờ duyệt', p: 'Duyệt kế hoạch', s: 'Sửa kế hoạch', order: 0, cancel: true },
    paused: { icon: '⏸', label: 'Tạm dừng', p: 'Chạy tiếp tới khi xong', s: '+50% ngân sách & tiếp tục', order: 1, cancel: true },
    // lỗi / xong: nhiệm vụ đã dừng, server không cho hủy (409) → không có "Hủy"
    failed: { icon: '❌', label: 'Lỗi', p: 'Chạy tiếp phần chưa xong', s: 'Mở trang nhiệm vụ', order: 2 },
    attention: { icon: '⚠', label: 'Xong — cần xem', p: 'Duyệt kết quả', s: 'Yêu cầu sửa…', order: 3 },
  };
  function items() {
    const now = Date.now();
    const s = snz.get();
    let dirty = false;
    for (const [id, until] of Object.entries(s))
      if (until < now) {
        delete s[id];
        dirty = true;
      }
    if (dirty) snz.set(s);
    return [...C.S.tasks.values()]
      .map((t) => ({ t, k: kindOf(t), snoozed: (s[t.id] || 0) > now }))
      .filter((x) => x.k && (IB.showSnoozed || !x.snoozed))
      .sort((a, b) => KIND[a.k].order - KIND[b.k].order || String(b.t.updatedAt).localeCompare(String(a.t.updatedAt)));
  }
  const why = (x) => {
    const t = x.t;
    if (x.k === 'plan') {
      const r = (t.runs || []).find((r) => r.planReview && !r.planReview.approvedAt);
      return `${r ? `${C.deptName(r.department)} · ${r.subtasks.length} hạng mục` : ''}${r?.estimate ? ` · ≈ ${C.fmt(r.estimate.tokens)} token` : ''}`;
    }
    if (x.k === 'paused') return C.PAUSE_VI[t.pause?.reason] || t.pause?.reason || '';
    if (x.k === 'failed') return t.error || '';
    return t.attention?.detail || '';
  };
  const ago = (iso) => {
    const m = Math.round((Date.now() - Date.parse(iso)) / 60000);
    return m < 1 ? 'vừa xong' : m < 60 ? `${m} phút trước` : m < 1440 ? `${Math.round(m / 60)} giờ trước` : `${Math.round(m / 1440)} ngày trước`;
  };

  // ── Vẽ ────────────────────────────────────────────────────────────────────
  IB.render = (force) => {
    const el = $('#inbox');
    if (!el || !C) return;
    // đang gõ trong ô xem trước (sửa kế hoạch, yêu cầu sửa) → không vẽ lại
    if (!force && (window.Flow?.busy(el) || document.activeElement?.closest?.('#inbox .rv-form, #inbox textarea'))) return;
    const list = items();
    if (!list.some((x) => x.t.id === IB.sel)) IB.sel = list[0]?.t.id ?? null;
    const snoozedN = Object.keys(snz.get()).length;
    const cur = list.find((x) => x.t.id === IB.sel);
    const k = cur ? KIND[cur.k] : null;
    el.innerHTML = `<div class="ib">
      <div class="dv-head"><h1>📥 Cần bạn</h1><span class="ib-n">${list.length ? `${list.length} việc` : ''}</span><span class="grow"></span>
        ${snoozedN ? `<label class="check c-chk"><input type="checkbox" data-ib-snz${IB.showSnoozed ? ' checked' : ''} /> hiện ${snoozedN} việc đã hoãn</label>` : ''}</div>
      <div class="ib-keys" aria-hidden="true"><span><kbd>J</kbd>/<kbd>K</kbd> chọn</span><span><kbd>Enter</kbd> mở hội thoại</span><span><kbd>O</kbd> trang nhiệm vụ</span>${k ? `<span><kbd>1</kbd> ${esc(k.p)}</span><span><kbd>2</kbd> ${esc(k.s)}</span>` : ''}<span><kbd>H</kbd> hoãn 4 giờ</span>${k?.cancel ? '<span><kbd>X</kbd> hủy</span>' : ''}<span><kbd>Z</kbd> hoàn tác</span></div>
      <div class="ib-undo" ${IB.pending ? '' : 'hidden'} role="status" aria-live="polite">${IB.pending ? `⏳ Sẽ <b>${esc(IB.pending.label)}</b> — “${esc(IB.pending.title)}” <button type="button" class="btn ghost sm" data-ib-undo>Hoàn tác (Z)</button>` : ''}</div>
      ${
        list.length
          ? `<div class="ib-body"><ol class="ib-list" role="listbox" aria-label="Việc cần bạn">${list
              .map(
                (x) => `<li role="option" tabindex="-1" data-ib="${esc(x.t.id)}" aria-selected="${x.t.id === IB.sel}" class="${x.t.id === IB.sel ? 'on' : ''}${x.snoozed ? ' snz' : ''}">
                <span class="ib-ic" title="${esc(KIND[x.k].label)}">${KIND[x.k].icon}</span>
                <div class="ib-m"><b>${esc(x.t.title)}</b><small>${esc(KIND[x.k].label)}${why(x) ? ` · ${esc(why(x).slice(0, 140))}` : ''}</small></div>
                <time>${esc(ago(x.t.updatedAt || x.t.createdAt))}${x.snoozed ? ' · 💤' : ''}</time></li>`,
              )
              .join('')}</ol><section class="ib-pv" aria-label="Xem trước">${cur ? preview(cur) : ''}</section></div>`
          : `<div class="empty ib-empty">✅ Không có việc nào chờ bạn quyết.${snoozedN ? ` (${snoozedN} việc đã hoãn)` : ''}</div>`
      }</div>`;
    bind(el, cur);
  };
  function preview(x) {
    const t = x.t;
    const k = KIND[x.k];
    const proj = t.projectId ? C.S.projects.find((p) => p.id === t.projectId)?.name || t.projectId : 'ngoài dự án';
    let body = '';
    if (x.k === 'plan') body = window.Flow?.planHtml(t) || '';
    else if (x.k === 'attention') body = `${window.Flow?.summaryHtml(t) || ''}${window.Flow?.acceptHtml(t) || ''}${window.UX?.checksHtml(t) || ''}${window.Chat?.reviewBox?.(t) || ''}`;
    else
      body = `${window.Flow?.summaryHtml(t) || ''}<div class="pause-box ${esc(t.status)}"><div><b>${esc(k.icon)} ${esc(k.label)}</b><p>${esc(t.pause?.detail || t.error || '')}${t.pause?.resumeAt ? ` · tự tiếp tục lúc ${esc(C.dateTime(t.pause.resumeAt))}` : ''}</p></div>
        <div class="pb-actions"><button type="button" class="btn primary sm" data-ib-act="1">${esc(k.p)} (1)</button>${x.k === 'paused' ? `<button type="button" class="btn ghost sm" data-ib-act="2">${esc(k.s)} (2)</button>` : ''}${k.cancel ? '<button type="button" class="btn ghost sm danger" data-ib-act="x">Hủy (X)</button>' : ''}</div></div>`;
    return `<div class="ib-pvh"><div><h2>${esc(t.title)}</h2><small title="${esc(t.id)}">${esc(C.code(t))} · 📁 ${esc(proj)} · ${esc(C.MODE_VI[t.mode] || t.mode)} · ${esc(ago(t.updatedAt || t.createdAt))}</small></div>
        <div class="ib-go"><button type="button" class="btn ghost sm" data-ib-open="chat">💬 Hội thoại (Enter)</button><button type="button" class="btn ghost sm" data-ib-open="task">📋 Trang nhiệm vụ (O)</button></div></div>
      ${x.k === 'attention' ? `<div class="pb-actions ib-qa"><button type="button" class="btn primary sm" data-ib-act="1">✅ Duyệt kết quả (1)</button><button type="button" class="btn ghost sm" data-ib-act="2">✋ Yêu cầu sửa… (2)</button>${window.UX?.hasDiff(t) ? '<button type="button" class="btn ghost sm" data-ib-open="diff">🧬 Thay đổi</button>' : ''}</div>` : ''}
      ${body}`;
  }
  function bind(el, cur) {
    $('[data-ib-snz]', el)?.addEventListener('change', (e) => {
      IB.showSnoozed = e.target.checked;
      IB.render(true);
    });
    $$('[data-ib]', el).forEach(
      (li) =>
        (li.onclick = () => {
          IB.sel = li.dataset.ib;
          IB.render(true);
        }),
    );
    $('[data-ib-undo]', el)?.addEventListener('click', undo);
    if (!cur) return;
    const pv = $('.ib-pv', el);
    window.Flow?.bind(pv, () => IB.render(true));
    window.Chat?.bindReview?.(pv, () => IB.render(true));
    window.UX?.fillStats(pv);
    $$('[data-ib-open]', pv).forEach((b) => (b.onclick = () => open(cur.t.id, b.dataset.ibOpen)));
    $$('[data-ib-act]', pv).forEach((b) => (b.onclick = () => act(b.dataset.ibAct)));
  }
  function open(id, where) {
    if (where === 'task') return C.openTask(id);
    if (where === 'diff') return C.openTask(id, 'diff');
    window.Chat?.open(id);
  }

  // ── Hành động (chờ 4 giây, Z hoàn tác) ─────────────────────────────────────
  const post = (id, path, body) => C.api(`/api/tasks/${encodeURIComponent(id)}/${path}`, { method: 'POST', body: JSON.stringify(body || {}) });
  /** Hành động vừa gửi (id|nhãn → lúc gửi): bấm lại khi danh sách chưa kịp cập nhật thì không gửi lần hai. */
  const sent = new Map();
  const SENT_MS = 15000;
  function schedule(t, label, run) {
    const key = `${t.id}|${label}`;
    if (IB.pending?.id === t.id && IB.pending.label === label) return; // đang chờ đúng hành động này
    if (Date.now() - (sent.get(key) || 0) < SENT_MS) return C.toast({ level: 'info', title: `Đã gửi "${label}"`, msg: `${t.title} — đang chờ máy chủ cập nhật` });
    // đổi ý trên cùng một việc → bỏ hành động cũ (chưa gửi); việc khác → gửi luôn hành động cũ
    if (IB.pending?.id === t.id) {
      clearTimeout(IB.pending.timer);
      IB.pending = null;
    } else flush();
    const p = { id: t.id, title: t.title, label, run };
    p.timer = setTimeout(async () => {
      if (IB.pending !== p) return;
      IB.pending = null;
      sent.set(key, Date.now());
      try {
        const r = await run();
        if (r?.id) C.S.tasks.set(r.id, r);
        C.toast({ level: 'info', title: `Đã ${label}`, msg: t.title });
      } catch (e) {
        C.toast({ level: 'error', title: `Không ${label} được`, msg: e.message });
      }
      IB.render(true);
    }, UNDO_MS);
    IB.pending = p;
    // chuyển sang việc kế tiếp ngay (kiểu hộp thư)
    const list = items();
    const i = list.findIndex((x) => x.t.id === t.id);
    IB.sel = (list[i + 1] || list[i - 1] || {}).t?.id ?? null;
    IB.render(true);
  }
  /** Có hành động đang chờ mà người dùng làm tiếp việc khác → gửi luôn hành động cũ. */
  function flush() {
    const p = IB.pending;
    if (!p) return;
    clearTimeout(p.timer);
    IB.pending = null;
    sent.set(`${p.id}|${p.label}`, Date.now());
    p.run()
      .then((r) => r?.id && C.S.tasks.set(r.id, r))
      .catch((e) => C.toast({ level: 'error', title: `Không ${p.label} được`, msg: e.message }));
  }
  function undo() {
    const p = IB.pending;
    if (!p) return;
    clearTimeout(p.timer);
    IB.pending = null;
    IB.sel = p.id;
    C.toast({ level: 'info', title: 'Đã hoàn tác', msg: `${p.label} — ${p.title}` });
    IB.render(true);
  }
  function act(key) {
    const x = items().find((i) => i.t.id === IB.sel);
    if (!x) return;
    const t = x.t;
    const budget = t.options?.budgetTokens || 0;
    if (key === 'x') {
      if (!KIND[x.k].cancel)
        return C.toast({ level: 'info', title: t.status === 'done' ? 'Việc đã xong — không hủy được' : 'Nhiệm vụ lỗi đã dừng — không cần hủy', msg: t.status === 'done' ? 'Dùng "Yêu cầu sửa" hoặc hoãn (H).' : 'Hoãn (H) nếu muốn tạm ẩn khỏi danh sách.' });
      if (!confirm(`Hủy "${t.title}"?`)) return;
      return post(t.id, 'cancel').then(() => IB.render(true), (e) => C.toast({ level: 'error', title: 'Không hủy được', msg: e.message }));
    }
    if (key === '1') {
      if (x.k === 'plan') return schedule(t, 'duyệt kế hoạch', () => window.Flow.approvePlan(t.id));
      if (x.k === 'attention') return schedule(t, 'duyệt kết quả', () => post(t.id, 'review', { decision: 'approve' }));
      return schedule(t, 'chạy tiếp', () => post(t.id, 'resume', { budgetMode: 'complete' }));
    }
    if (key === '2') {
      if (x.k === 'plan') return $('.ib-pv .pl-row input, .ib-pv .pl-row select')?.focus();
      if (x.k === 'attention') {
        $('.ib-pv [data-rv-no]')?.click();
        return $('.ib-pv .rv-form textarea')?.focus();
      }
      if (x.k === 'paused') return schedule(t, 'tăng 50% ngân sách & chạy tiếp', () => post(t.id, 'resume', { addBudget: Math.max(100000, Math.round(budget * 0.5)) }));
      return C.openTask(t.id);
    }
  }
  function move(d) {
    const list = items();
    if (!list.length) return;
    const i = Math.max(0, list.findIndex((x) => x.t.id === IB.sel));
    IB.sel = list[Math.min(list.length - 1, Math.max(0, i + d))].t.id;
    IB.render(true);
    $('#inbox .ib-list li.on')?.scrollIntoView({ block: 'nearest' });
  }
  function snooze() {
    const id = IB.sel;
    if (!id) return;
    // việc kế tiếp phải tính trước khi việc này rời danh sách (nếu không sẽ nhảy quá một việc)
    const list = items();
    const i = list.findIndex((x) => x.t.id === id);
    const next = (list[i + 1] || list[i - 1] || {}).t?.id ?? null;
    const s = snz.get();
    if (s[id] > Date.now()) delete s[id];
    else s[id] = Date.now() + SNOOZE_MS;
    snz.set(s);
    const on = !!s[id];
    if (on && !IB.showSnoozed) IB.sel = next;
    C.toast({ level: 'info', title: on ? 'Đã hoãn 4 giờ' : 'Bỏ hoãn', msg: C.S.tasks.get(id)?.title || id });
    IB.render(true);
  }
  // phím: bắt ở pha capture để 1/2/H không bị phím tắt chung (đổi màn, trợ giúp) lấy mất khi đang ở hộp Cần bạn
  function onKey(e) {
    if (!C || C.S.tab !== 'inbox') return;
    if (e.ctrlKey || e.metaKey || e.altKey || document.querySelector('.modal-wrap, .tour, .pal-wrap:not([hidden]), #imenu:not([hidden])')) return;
    const el = e.target;
    if (el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName || ''))) return;
    // phím trong văn phòng (canvas, menu E) thuộc về văn phòng
    if (el?.closest?.('#imenu, canvas')) return;
    const k = e.key.toLowerCase();
    // Enter/Space trên nút, liên kết đang được chọn → để nút đó tự xử lý
    if ((k === 'enter' || k === ' ') && el?.closest?.('button, a[href], [role="button"], summary, label')) return;
    // Esc/Z chỉ khi có hành động đang chờ để hoàn tác
    if ((k === 'escape' || k === 'z') && !IB.pending) return;
    const map = { j: () => move(1), arrowdown: () => move(1), k: () => move(-1), arrowup: () => move(-1), enter: () => IB.sel && open(IB.sel, 'chat'), o: () => IB.sel && open(IB.sel, 'task'), 1: () => act('1'), 2: () => act('2'), h: snooze, x: () => act('x'), z: undo, escape: undo };
    if (!map[k]) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    map[k]();
  }
  IB.changed = () => C?.S.tab === 'inbox' && IB.render(false);
  IB.init = () => {
    C = window.CC;
    document.addEventListener('keydown', onKey, true);
  };
  window.Inbox = IB;
})();
