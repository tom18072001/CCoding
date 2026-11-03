// UI-6: hộp soạn "Nhiệm vụ mới" nổi kiểu Paperclip — phím C hoặc nút ở cột trái, giao việc không rời trang đang xem.
// Chỉ gồm tiêu đề, mô tả, người nhận, dự án; cần tùy chọn sâu (ngân sách, runtime, tệp) → "Mở trình giao việc đầy đủ".
(function () {
  const $ = (s, el = document) => el.querySelector(s);
  let C = null;
  let wrap = null;
  const esc = (s) => C.esc(s);

  function assignees() {
    const S = C.S;
    const depts = (S.departments || []).map((d) => `<option value="dept:${esc(d.id)}">Phòng ${esc(d.name)}</option>`).join('');
    const agents = [...S.agents.values()]
      .filter((a) => a.role !== 'router')
      .map((a) => `<option value="agent:${esc(a.id)}">${esc(a.name)} · ${esc(C.deptShort(a.department))}</option>`)
      .join('');
    return `<option value="auto">Tự động (điều phối chọn phòng)</option><option value="joint">Liên phòng (Nghiên cứu → Phát triển)</option>${depts ? `<optgroup label="Phòng ban">${depts}</optgroup>` : ''}${agents ? `<optgroup label="Agent">${agents}</optgroup>` : ''}`;
  }
  function projects() {
    return `<option value="">Không thuộc dự án</option>${C.S.projects.map((p) => `<option value="${esc(p.id)}">${esc(p.name)} · ${esc(C.CLS_VI[p.classification] || p.classification)}</option>`).join('')}`;
  }

  /** Thân yêu cầu POST /api/tasks từ hộp soạn. */
  function body(f) {
    const who = f.who.value;
    const proj = f.proj.value || undefined;
    const b = { title: f.title.value.trim() || undefined, brief: f.brief.value.trim() || f.title.value.trim(), options: {} };
    if (who.startsWith('agent:')) Object.assign(b, { mode: 'agent', agentId: who.slice(6), projectId: proj });
    else if (who.startsWith('dept:')) Object.assign(b, { mode: 'department', department: who.slice(5), projectId: proj });
    else if (who === 'joint') Object.assign(b, { mode: 'joint', projectId: proj });
    else Object.assign(b, proj ? { mode: 'project', projectId: proj } : { mode: 'auto' });
    return b;
  }

  function close() {
    wrap?.remove();
    wrap = null;
  }
  function open(pre = {}) {
    C = window.CC;
    if (!C) return;
    if (wrap) return $('[name=title]', wrap).focus();
    wrap = document.createElement('div');
    wrap.className = 'cmp-wrap';
    wrap.innerHTML = `<form class="cmp" role="dialog" aria-modal="true" aria-label="Nhiệm vụ mới">
      <div class="cmp-top"><span class="cmp-crumb">CCoding <i>›</i> Nhiệm vụ mới</span><span class="grow"></span><button type="button" class="cmp-x" data-x aria-label="Đóng">×</button></div>
      <input name="title" class="cmp-title" placeholder="Tiêu đề nhiệm vụ" autocomplete="off" />
      <textarea name="brief" class="cmp-brief" rows="6" placeholder="Mô tả yêu cầu: mục tiêu, đầu vào, tiêu chí xong…"></textarea>
      <div class="cmp-props">
        <label class="cmp-chip"><span>Giao cho</span><select name="who">${assignees()}</select></label>
        <label class="cmp-chip"><span>Dự án</span><select name="proj">${projects()}</select></label>
      </div>
      <div class="cmp-msg" aria-live="polite"></div>
      <div class="cmp-foot"><button type="button" class="cmp-link" data-full>Mở trình giao việc đầy đủ</button><span class="grow"></span><kbd>Ctrl</kbd><kbd>Enter</kbd><button type="button" class="btn ghost sm" data-x>Hủy</button><button type="submit" class="btn primary sm">Tạo nhiệm vụ</button></div>
    </form>`;
    document.body.appendChild(wrap);
    const f = $('form', wrap);
    if (pre.who) f.who.value = pre.who;
    if (pre.projectId) f.proj.value = pre.projectId;
    if (pre.title) f.title.value = pre.title;
    wrap.addEventListener('mousedown', (e) => e.target === wrap && close());
    wrap.querySelectorAll('[data-x]').forEach((b) => (b.onclick = close));
    f.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') (e.preventDefault(), close());
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) (e.preventDefault(), f.requestSubmit());
    });
    $('[data-full]', f).onclick = () => {
      const b = body(f);
      close();
      C.prefillAssign({ mode: b.mode, department: b.department, agentId: b.agentId, projectId: b.projectId, title: b.title || '', brief: f.brief.value });
    };
    f.onsubmit = async (e) => {
      e.preventDefault();
      const msg = $('.cmp-msg', f);
      const b = body(f);
      if (!b.brief) return (msg.textContent = 'Nhập tiêu đề hoặc mô tả trước khi tạo'), f.title.focus();
      if (window.Director?.hasSecret?.(b.brief) || window.Director?.hasSecret?.(b.title || '')) return (msg.textContent = 'Yêu cầu có vẻ chứa khóa hoặc mật khẩu — xóa bí mật trước khi giao');
      const btn = $('[type=submit]', f);
      btn.disabled = true;
      try {
        const t = await C.api('/api/tasks', { method: 'POST', body: JSON.stringify(b) });
        C.S.tasks.set(t.id, t);
        close();
        C.toast({ level: 'info', title: `Đã tạo ${C.code(t)}`, msg: t.title });
        C.openTask(t.id);
      } catch (err) {
        msg.textContent = err.message;
        btn.disabled = false;
      }
    };
    f.title.focus();
  }

  document.addEventListener(
    'keydown',
    (e) => {
      if (e.key.toLowerCase() !== 'c' || e.ctrlKey || e.metaKey || e.altKey || wrap) return;
      const el = e.target;
      if (el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName || ''))) return;
      if (document.querySelector('.modal-wrap, .tour, .pal-wrap:not([hidden])') || el?.closest?.('#imenu, canvas')) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      open();
    },
    true,
  );
  window.Compose = { open, close };
})();
