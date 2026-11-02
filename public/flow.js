// UX-2: duyệt kế hoạch trước khi thực thi, thẻ tóm tắt hoàn tất, "sẵn sàng gộp" (đẩy nhánh / fast-forward / mở PR).
// Dùng chung cho màn Prompt (chat.js) và trang nhiệm vụ (app.js). Bản nháp sửa kế hoạch và trạng thái bảng gộp giữ ở đây
// để không mất khi trang được vẽ lại theo sự kiện thời gian thực.
(function () {
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  let C = null;
  const esc = (s) => C.esc(s);
  const F = {
    draft: new Map(), // taskId → { [subtaskId]: { assignee, deps, title, description, remove } , note }
    ship: new Map(), // taskId → { at, data, open, busy, err }
  };
  const planPaused = (t) => !!t && t.status === 'paused' && t.pause?.reason === 'plan';
  const live = (t) => !!t && ['running', 'queued'].includes(t.status);
  F.planPaused = planPaused;

  // ── Duyệt kế hoạch (C1) ──────────────────────────────────────────────────
  const draftOf = (id) => {
    if (!F.draft.has(id)) F.draft.set(id, { subs: {}, note: '' });
    return F.draft.get(id);
  };
  function pendingRun(t) {
    return (t.runs || []).find((r) => r.planReview && !r.planReview.approvedAt);
  }
  F.planHtml = (t) => {
    if (!planPaused(t)) return '';
    const run = pendingRun(t);
    if (!run) return '';
    const d = draftOf(t.id);
    const roster = run.planReview.roster || [];
    const ids = run.subtasks.map((s) => s.id);
    const rows = run.subtasks
      .map((s) => {
        const e = d.subs[s.id] || {};
        const who = e.assignee ?? s.assignee;
        const deps = e.deps ?? s.dependsOn.join(', ');
        const rm = !!e.remove;
        const cap = roster.find((r) => r.id === who)?.cap || '';
        return `<div class="pl-row${rm ? ' rm' : ''}" data-s="${esc(s.id)}">
          <code>${esc(s.id)}</code>
          <div class="pl-main"><input class="pl-title" data-f="title" value="${esc(e.title ?? s.title)}" aria-label="Tiêu đề ${esc(s.id)}" ${rm ? 'disabled' : ''} />
            <details class="pl-desc"><summary>Mô tả & tiêu chí xong</summary><textarea data-f="description" rows="4" aria-label="Mô tả ${esc(s.id)}" ${rm ? 'disabled' : ''}>${esc(e.description ?? s.description ?? '')}</textarea></details></div>
          <label class="pl-who">Người làm<select data-f="assignee" ${rm ? 'disabled' : ''}>${roster.map((r) => `<option value="${esc(r.id)}"${r.id === who ? ' selected' : ''}>${esc(r.name)}</option>`).join('')}</select><small title="Năng lực công cụ trong nhiệm vụ này">${esc(cap)}</small></label>
          <label class="pl-dep">Sau<input data-f="deps" value="${esc(deps)}" placeholder="—" list="pl-ids-${esc(t.id)}" aria-label="Phụ thuộc của ${esc(s.id)} (vd. S1, S2)" ${rm ? 'disabled' : ''} /></label>
          <label class="check pl-rm" title="Bỏ hạng mục này khỏi kế hoạch"><input type="checkbox" data-f="remove"${rm ? ' checked' : ''} /> bỏ</label>
        </div>`;
      })
      .join('');
    const over = run.estimate && run.estimate.tokens > run.estimate.budget * 1.2;
    const est = run.estimate ? `📏 Ước tính ≈ ${C.fmt(run.estimate.tokens)} token${run.estimate.basis ? ` (${esc(run.estimate.basis)})` : ''} · ngân sách còn ${C.fmt(run.estimate.budget)}${over ? ' — <b class="warn">vượt ngân sách: nên bỏ bớt hạng mục, tách nhiệm vụ hoặc tăng ngân sách</b>' : ''}` : '';
    const auto = t.pause?.resumeAt ? ` · tự duyệt lúc ${esc(C.dateTime(t.pause.resumeAt))}` : '';
    const dirty = Object.keys(d.subs).length > 0;
    return `<div class="pl-box" data-pl="${esc(t.id)}" data-dept="${esc(run.department)}">
      <div class="pl-head"><b>📝 Kế hoạch chờ giám đốc duyệt</b><span>${esc(C.deptName(run.department))} · ${run.subtasks.length} hạng mục${auto}</span></div>
      ${run.planSummary ? `<div class="md pl-sum">${C.md(run.planSummary)}</div>` : ''}
      ${est ? `<p class="pl-est">${est}</p>` : ''}
      <datalist id="pl-ids-${esc(t.id)}">${ids.map((x) => `<option value="${esc(x)}"></option>`).join('')}</datalist>
      <div class="pl-rows">${rows}</div>
      <textarea class="pl-note" data-f="note" rows="2" placeholder="Chỉ dẫn kèm khi duyệt (tùy chọn) — vd. ưu tiên test trước, không sửa giao diện cũ…" aria-label="Chỉ dẫn kèm khi duyệt">${esc(d.note || '')}</textarea>
      <div class="pb-actions"><button type="button" class="btn primary sm" data-pl-go>✅ Duyệt & thực thi</button><button type="button" class="btn ghost sm" data-pl-save${dirty ? '' : ' disabled'}>💾 Lưu thay đổi</button><button type="button" class="btn ghost sm" data-pl-reset${dirty ? '' : ' disabled'}>↺ Bỏ sửa</button><span class="grow"></span><button type="button" class="btn ghost sm danger" data-pl-cancel>Hủy nhiệm vụ</button></div>
      <p class="pl-hint">Đổi người làm theo năng lực (việc cần chạy lệnh → người "chạy lệnh"), sửa phụ thuộc ("S1, S2"), bỏ hạng mục không cần. Duyệt xong văn phòng vào thực thi ngay.</p>
    </div>`;
  };
  function collect(t) {
    const d = draftOf(t.id);
    const run = pendingRun(t);
    if (!run) return [];
    const out = [];
    for (const s of run.subtasks) {
      const e = d.subs[s.id];
      if (!e) continue;
      const x = { id: s.id };
      if (e.remove) x.remove = true;
      else {
        if (e.assignee !== undefined && e.assignee !== s.assignee) x.assignee = e.assignee;
        if (e.title !== undefined && e.title.trim() !== s.title) x.title = e.title;
        if (e.description !== undefined && e.description.trim() !== (s.description || '').trim()) x.description = e.description;
        if (e.deps !== undefined) {
          const deps = e.deps.split(/[\s,;]+/).map((v) => v.trim().toUpperCase()).filter(Boolean);
          if (deps.join(',') !== s.dependsOn.join(',')) x.dependsOn = deps;
        }
      }
      if (Object.keys(x).length > 1) out.push(x);
    }
    return out;
  }
  function bindPlan(root, after) {
    $$('[data-pl]', root).forEach((box) => {
      const id = box.dataset.pl;
      const t = C.S.tasks.get(id);
      if (!t) return;
      const d = draftOf(id);
      const refreshBtns = () => {
        const dirty = Object.keys(d.subs).length > 0;
        box.querySelector('[data-pl-save]').disabled = !dirty;
        box.querySelector('[data-pl-reset]').disabled = !dirty;
      };
      box.addEventListener('input', (e) => {
        const f = e.target.dataset?.f;
        if (!f) return;
        if (f === 'note') return void (d.note = e.target.value);
        const sid = e.target.closest('[data-s]')?.dataset.s;
        if (!sid) return;
        const cur = (d.subs[sid] ??= {});
        if (f === 'remove') {
          cur.remove = e.target.checked;
          const row = e.target.closest('.pl-row');
          row.classList.toggle('rm', cur.remove);
          row.querySelectorAll('input:not([data-f=remove]), select, textarea').forEach((x) => (x.disabled = cur.remove));
        } else cur[f] = e.target.value;
        if (f === 'assignee') {
          const cap = pendingRun(t)?.planReview.roster.find((r) => r.id === e.target.value)?.cap || '';
          e.target.parentElement.querySelector('small').textContent = cap;
        }
        refreshBtns();
      });
      const post = async (approve) => {
        const subtasks = collect(t);
        const body = { department: box.dataset.dept, subtasks, approve };
        if (approve && d.note.trim()) {
          if (window.Director?.hasSecret?.(d.note)) return C.toast({ level: 'error', title: 'Có vẻ chứa khóa/mật khẩu', msg: 'Xóa bí mật khỏi chỉ dẫn trước khi gửi.' });
          body.note = d.note.trim();
        }
        $$('button', box).forEach((b) => (b.disabled = true));
        try {
          const r = await C.api(`/api/tasks/${encodeURIComponent(id)}/plan`, { method: 'POST', body: JSON.stringify(body) });
          if (r?.id) C.S.tasks.set(r.id, r);
          F.draft.delete(id);
          C.toast({ level: 'info', title: approve ? 'Đã duyệt kế hoạch — vào thực thi' : `Đã lưu ${subtasks.length} thay đổi kế hoạch`, msg: t.title });
          after?.();
        } catch (e) {
          C.toast({ level: 'error', title: 'Không thực hiện được', msg: e.message });
          $$('button', box).forEach((b) => (b.disabled = false));
          refreshBtns();
        }
      };
      box.querySelector('[data-pl-go]').onclick = () => post(true);
      box.querySelector('[data-pl-save]').onclick = () => post(false);
      box.querySelector('[data-pl-reset]').onclick = () => {
        F.draft.delete(id);
        after?.();
      };
      box.querySelector('[data-pl-cancel]').onclick = async () => {
        if (!confirm(`Hủy "${t.title}"?`)) return;
        try {
          await C.api(`/api/tasks/${encodeURIComponent(id)}/cancel`, { method: 'POST', body: '{}' });
          after?.();
        } catch (e) {
          C.toast({ level: 'error', title: 'Không hủy được', msg: e.message });
        }
      };
    });
  }

  // ── Thẻ tóm tắt hoàn tất (A5) ────────────────────────────────────────────
  function dur(t) {
    const ms = new Date(t.finishedAt || t.updatedAt) - new Date(t.startedAt || t.createdAt);
    if (!(ms > 0)) return '';
    const m = Math.round(ms / 60000);
    return m < 1 ? `${Math.round(ms / 1000)} giây` : m < 60 ? `${m} phút` : `${Math.floor(m / 60)} giờ ${m % 60} phút`;
  }
  F.summaryHtml = (t) => {
    if (!t || !['done', 'failed', 'cancelled'].includes(t.status) || !(t.runs || []).length) return '';
    const subs = t.runs.flatMap((r) => r.subtasks.filter((s) => !s.splitTo));
    const done = subs.filter((s) => s.status === 'done').length;
    const redo = subs.filter((s) => s.attempts > 1).length;
    const reviewed = t.runs.filter((r) => r.review);
    const open = t.runs.flatMap((r) => (r.review && !r.review.approved ? r.review.issues.filter((i) => i.severity !== 'minor') : []));
    const rv = !reviewed.length ? ['—', 'không review'] : open.length || t.attention?.reason === 'review' ? ['⚠', `cần xem · ${open.length} lỗi còn mở`] : ['✓', reviewed.some((r) => r.review.by === 'director') ? 'giám đốc duyệt' : 'reviewer duyệt'];
    const ac = t.acceptance;
    const acN = ac ? ac.criteria.filter((c) => c.result === 'pass').length : 0;
    const pc = t.projectChecks;
    const okN = (l) => (l || []).filter((c) => c.ok).length;
    const ck = pc && (pc.latest || pc.baseline) ? `${okN(pc.baseline)}/${(pc.baseline || []).length} → ${okN(pc.latest)}/${(pc.latest || pc.baseline || []).length}` : '';
    const last = (t.shipped || []).at(-1);
    const cell = (icon, label, val, cls = '') => `<div class="sm-c ${cls}"><span>${icon} ${esc(label)}</span><b>${val}</b></div>`;
    return `<div class="sm-card">
      ${cell('⏱', 'Thời gian', esc(dur(t) || '—'))}
      ${cell('🔢', 'Token', esc(C.fmt(C.total(t.usage))))}
      ${cell('✅', 'Hạng mục', `${done}/${subs.length}${redo ? ` <small>· ${redo} phải sửa</small>` : ''}`, done < subs.length ? 'warn' : '')}
      ${window.UX?.hasDiff(t) ? cell('🧬', 'Thay đổi', `<span data-dstat="${esc(t.id)}"></span>`) : ''}
      ${ck ? cell('🧪', 'Kiểm tra trước → sau', esc(ck), okN(pc.latest) < (pc.latest || []).length ? 'warn' : '') : ''}
      ${cell(rv[0], 'Review', esc(rv[1]), rv[0] === '⚠' ? 'warn' : '')}
      ${ac ? cell(ac.accepted ? '✅' : '✋', 'CTO nghiệm thu', ac.accepted ? `đạt ${acN}/${ac.criteria.length}` : ac.parsed ? `chưa · ${acN}/${ac.criteria.length} đạt` : 'chưa có kết luận', ac.accepted ? '' : 'warn') : ''}
      ${t.branch ? cell('🌿', last ? (last.action === 'ff' ? `Đã đẩy vào ${last.ref}` : 'Đã đẩy nhánh') : 'Nhánh', `<code title="${esc(t.branch)}">${esc(last ? last.head.slice(0, 10) : t.branch)}</code>`) : ''}
    </div>`;
  };

  // ── Nghiệm thu của CTO (UX-4c) ─────────────────────────────────────────────
  const AC_RES = { pass: ['✓', 'Đạt', 'ok'], fail: ['✗', 'Không', 'bad'], unknown: ['?', 'Chưa kiểm được', 'warn'] };
  /** Khung kết luận nghiệm thu: tiêu chí Đạt/Không kèm bằng chứng, rủi ro, việc tiếp theo (bấm để soạn sẵn việc tiếp nối). */
  F.acceptHtml = (t) => {
    const a = t?.acceptance;
    if (!a || live(t)) return '';
    const n = a.criteria.length;
    const ok = a.criteria.filter((c) => c.result === 'pass').length;
    const head = a.error
      ? `⚠ CTO chưa nghiệm thu được — ${esc(a.error)}`
      : !a.parsed
        ? '⚠ CTO không ghi kết luận đọc được — xem tin nghiệm thu trong hội thoại'
        : a.accepted
          ? `✅ CTO nghiệm thu · ${ok}/${n} tiêu chí đạt`
          : `✋ CTO chưa nghiệm thu · ${n - ok}/${n} tiêu chí chưa đạt hoặc chưa kiểm được`;
    const rows = a.criteria
      .map((c) => {
        const [ic, l, cls] = AC_RES[c.result] || AC_RES.unknown;
        return `<tr class="${cls}"><td>${esc(c.name)}</td><td class="ac-r"><b>${ic}</b> ${l}</td><td>${C.md ? C.md(c.evidence).replace(/^<p>|<\/p>$/g, '') : esc(c.evidence)}</td></tr>`;
      })
      .join('');
    const fus = (a.followUps || [])
      .map((f, i) => `<li><button type="button" class="btn ghost sm" data-ac-fu="${i}" title="${esc(f.brief.slice(0, 300))}">＋ ${esc(f.title)}</button>${f.department ? ` <small>${esc(C.deptShort(f.department))}</small>` : ''}</li>`)
      .join('');
    return `<details class="ac-box ${a.accepted ? 'ok' : 'warn'}" data-ac="${esc(t.id)}"${a.accepted ? '' : ' open'}>
      <summary><b>${head}</b>${a.summary ? `<small>${esc(a.summary)}</small>` : ''}</summary>
      ${n ? `<table class="ac-tbl"><thead><tr><th>Tiêu chí</th><th>Kết quả</th><th>Bằng chứng</th></tr></thead><tbody>${rows}</tbody></table>` : ''}
      ${a.risks?.length ? `<div class="ac-sec"><b>Rủi ro / việc còn mở</b><ul>${a.risks.map((r) => `<li>${esc(r)}</li>`).join('')}</ul></div>` : ''}
      ${fus ? `<div class="ac-sec"><b>Việc tiếp theo CTO đề xuất</b> <small>bấm để soạn sẵn việc tiếp nối, sửa rồi mới giao</small><ul class="ac-fu">${fus}</ul></div>` : ''}
      ${a.accepted ? '' : '<div class="pb-actions ac-redo"><button type="button" class="btn ghost sm" data-ac-redo title="Chạy lại riêng bước CTO nghiệm thu (báo cáo giữ nguyên) — vd. sau khi tăng ngân sách hoặc khi lần trước không đọc được kết luận">↻ Nghiệm thu lại</button></div>'}
    </details>`;
  };
  /**
   * Việc tiếp theo CTO đề xuất → hộp thoại soạn sẵn (sửa được) rồi giao thành việc TIẾP NỐI đúng nhiệm vụ được nghiệm thu
   * (không phụ thuộc ô soạn đang mở ở đâu — hội thoại, trang nhiệm vụ hay hộp Cần bạn). CTO không tự giao.
   */
  function followUpDialog(t, f) {
    const cont = t.branch && t.projectId;
    window.Director.modal({
      title: `＋ Giao tiếp nối ${esc(C.code(t))}`,
      wide: true,
      body: `<form class="form">
        <p class="muted-p">Việc tiếp theo CTO đề xuất sau khi nghiệm thu <b>${esc(C.code(t))} · ${esc(t.title)}</b>. Sửa nếu cần rồi giao — việc mới kế thừa dự án/chế độ/agent, báo cáo trước được đưa vào làm đầu vào.</p>
        <label>Tiêu đề<input name="title" maxlength="120" value="${esc(f.title)}" /></label>
        <label>Nội dung<textarea name="brief" rows="7">${esc(f.brief)}</textarea></label>
        ${cont ? `<label class="check"><input type="checkbox" name="cont" checked /> 🌿 nối tiếp nhánh <code>${esc(t.branch)}</code></label>` : ''}
        <p class="form-msg" data-msg></p>
        <div class="pb-actions"><button type="submit" class="btn primary sm">Giao tiếp nối ➤</button><button type="button" class="btn ghost sm" data-x>Hủy</button></div></form>`,
      onMount: (el, close) => {
        const form = el.querySelector('form');
        form.querySelector('[data-x]').onclick = close;
        form.onsubmit = async (e) => {
          e.preventDefault();
          const brief = form.brief.value.trim();
          if (!brief) return (form.querySelector('[data-msg]').textContent = 'Nội dung không được để trống');
          try {
            const nt = await C.api('/api/tasks', { method: 'POST', body: JSON.stringify({ title: form.title.value.trim() || undefined, brief, followUp: t.id, ...(cont ? { continueBranch: form.cont.checked } : {}) }) });
            C.S.tasks.set(nt.id, nt);
            close();
            C.toast({ level: 'info', title: `Đã giao tiếp nối ${C.code(nt)}`, msg: nt.title, taskId: nt.id });
            if (C.S.tab === 'assign' && window.Chat) window.Chat.open(nt.id);
          } catch (err) {
            const m = form.querySelector('[data-msg]');
            m.textContent = err.message;
            m.className = 'form-msg err';
          }
        };
      },
    });
  }
  function bindAccept(root) {
    root?.querySelectorAll('.ac-box').forEach((box) => {
      const t = C.S.tasks.get(box.dataset.ac);
      if (!t) return;
      box.querySelectorAll('[data-ac-fu]').forEach(
        (b) =>
          (b.onclick = () => {
            const f = t.acceptance?.followUps?.[Number(b.dataset.acFu)];
            if (f) followUpDialog(t, f);
          }),
      );
      const re = box.querySelector('[data-ac-redo]');
      if (re)
        re.onclick = async () => {
          re.disabled = true;
          try {
            const r = await C.api(`/api/tasks/${encodeURIComponent(t.id)}/resume`, { method: 'POST', body: JSON.stringify({ from: 'accept' }) });
            if (r?.id) C.S.tasks.set(r.id, r);
            C.toast({ level: 'info', title: 'CTO nghiệm thu lại', msg: t.title });
          } catch (e) {
            re.disabled = false;
            C.toast({ level: 'error', title: 'Không nghiệm thu lại được', msg: e.message });
          }
        };
    });
  }

  // ── Sẵn sàng gộp (A4) ────────────────────────────────────────────────────
  F.shipHtml = (t) => {
    if (!t?.branch || live(t) || planPaused(t) || !t.projectId) return '';
    const s = F.ship.get(t.id);
    if (!s?.open) return `<div class="sh-box" data-sh="${esc(t.id)}"><button type="button" class="btn ghost sm" data-sh-open title="Kiểm điều kiện gộp, đẩy nhánh lên remote, fast-forward vào nhánh xuất phát, mở PR">🚀 Sẵn sàng gộp…</button></div>`;
    const d = s.data;
    const row = (ok, text, cls) => `<li class="${cls || (ok === true ? 'ok' : ok === false ? 'bad' : 'warn')}"><b>${ok === true ? '✓' : ok === false ? '✗' : '!'}</b> ${text}</li>`;
    let body = '';
    if (s.err) body = `<p class="bad">${esc(s.err)}</p>`;
    else if (!d) body = '<p class="muted-p">Đang kiểm (hỏi remote)…</p>';
    else {
      const base = d.baseRef ? `<code>${esc(d.baseRef)}</code>` : 'nhánh xuất phát';
      const items = [
        row(d.review === 'approved' ? true : d.review === 'none' ? undefined : false, d.review === 'approved' ? 'Review đã duyệt' : d.review === 'none' ? 'Không có review' : 'Review chưa duyệt / "cần xem"'),
        row(!d.regressions.length && !d.failing.length, d.regressions.length ? `Lệnh kiểm tra hồi quy: ${d.regressions.map(esc).join(' · ')}` : d.failing.length ? `Lệnh kiểm tra hỏng: ${d.failing.map(esc).join(' · ')}` : 'Lệnh kiểm tra đạt'),
        row(!d.uncommitted, d.uncommitted ? `${d.uncommitted} tệp chưa commit trong worktree` : 'Không còn thay đổi chưa commit'),
        row(!d.secrets.length, d.secrets.length ? `Dòng trông như khóa/mật khẩu ở: ${d.secrets.slice(0, 12).map((x) => `<code>${esc(x)}</code>`).join(', ')}${d.secrets.length > 12 ? ` và ${d.secrets.length - 12} chỗ khác` : ''} — đẩy phải xác nhận là dữ liệu thử` : 'Không thấy khóa/mật khẩu trong phần sẽ đẩy'),
        d.baseBranch ? row(d.ff === true ? true : d.ahead ? false : undefined, d.ff ? `Fast-forward được vào ${base} (${d.ahead} commit)` : d.ahead ? `${base} có ${d.behind} commit mới chưa có trong nhánh${d.conflicts?.length ? ` · xung đột ${d.conflicts.length} tệp: ${d.conflicts.slice(0, 6).map((x) => `<code>${esc(x)}</code>`).join(', ')}` : d.conflicts ? ' · gộp không xung đột' : ''}` : `Nhánh không có commit mới so với ${base}`) : row(undefined, 'Dự án không đặt nhánh xuất phát dạng <code>origin/&lt;nhánh&gt;</code> — chỉ đẩy nhánh / mở PR'),
        row(d.pushed ? true : undefined, d.pushed ? `Nhánh đã có trên ${esc(d.remote || 'remote')}` : `Nhánh chưa đẩy lên ${esc(d.remote || 'remote')}`, d.pushed ? 'ok' : 'muted'),
        d.inherited ? row(d.inherited.reviewOk ? undefined : false, `Gồm ${d.inherited.commits} commit của nhiệm vụ trước <a data-task-link="${esc(d.inherited.taskId)}">${esc(d.inherited.taskId)}</a>${d.inherited.reviewOk ? '' : ' — review của nhiệm vụ đó chưa duyệt'}`) : '',
        d.fetched === false ? row(undefined, 'Không hỏi được remote (mạng/đăng nhập) — trạng thái theo ref cục bộ, có thể cũ') : '',
      ].join('');
      const blocked = d.blockers.length > 0 || !!s.busy;
      body = `<ul class="sh-list">${items}</ul>
        ${d.blockers.length ? `<p class="bad">⛔ ${d.blockers.map(esc).join(' · ')}</p>` : ''}
        <div class="pb-actions">
          <button type="button" class="btn ghost sm" data-sh-act="push"${blocked || d.pushed ? ' disabled' : ''} title="git push ${esc(d.remote || '')} ${esc(d.branch)} (không --force)">⬆ Đẩy nhánh</button>
          ${d.baseBranch ? `<button type="button" class="btn ${d.ff && !d.warnings.length && !d.secrets.length ? 'primary' : 'ghost'} sm" data-sh-act="ff"${blocked || !d.ff || d.fetched !== true || d.baseExists !== true ? ' disabled' : ''} title="Đẩy commit ${esc((d.head || '').slice(0, 10))} vào ${esc(d.baseRef)} — chỉ khi fast-forward, không --force">⏩ Đẩy vào ${esc(d.baseBranch)}</button>` : ''}
          ${d.compareUrl ? `<a class="btn ghost sm" href="${esc(d.compareUrl)}" target="_blank" rel="noopener noreferrer"${d.pushed ? '' : ' aria-disabled="true" title="Đẩy nhánh trước rồi mở PR"'}>↗ Mở PR trên GitHub</a>` : ''}
          <span class="grow"></span><button type="button" class="btn ghost sm" data-sh-refresh title="Kiểm lại (hỏi remote)"${s.busy ? ' disabled' : ''}>↻</button><button type="button" class="btn ghost sm" data-sh-close>Đóng</button>
        </div>
        <p class="pl-hint">Nhánh <code>${esc(d.branch)}</code> @ <code>${esc((d.head || '').slice(0, 10))}</code>${d.remoteUrl ? ` · ${esc(d.remoteUrl)}` : ''}. CCoding không bao giờ đẩy --force; việc tiếp nối trong cùng dự án tự làm tiếp trên nhánh này.</p>`;
    }
    return `<div class="sh-box open" data-sh="${esc(t.id)}"><div class="sh-head"><b>🚀 Sẵn sàng gộp</b>${s.busy ? '<span class="cv-spin"></span>' : ''}</div>${body}</div>`;
  };
  async function loadShip(id, rerender, fetch = true) {
    const s = F.ship.get(id) || {};
    F.ship.set(id, { ...s, open: true, busy: true, err: '' });
    rerender();
    try {
      const data = fetch ? await C.api(`/api/tasks/${encodeURIComponent(id)}/ship`, { method: 'POST', body: JSON.stringify({ action: 'check' }) }) : await C.api(`/api/tasks/${encodeURIComponent(id)}/ship`);
      F.ship.set(id, { open: true, busy: false, data, at: Date.now() });
    } catch (e) {
      F.ship.set(id, { open: true, busy: false, err: e.message });
    }
    rerender();
  }
  async function act(id, action, rerender, again) {
    const t = C.S.tasks.get(id);
    const s0 = F.ship.get(id);
    const d = s0?.data;
    if (!t || !d || s0.busy) return;
    let override = !!again?.override;
    let allowSecrets = !!again?.allowSecrets;
    if (!again) {
      const what = action === 'ff' ? `Đẩy ${d.ahead} commit vào ${d.baseRef} (fast-forward, không --force)?${d.inherited ? `\n(gồm ${d.inherited.commits} commit của nhiệm vụ trước ${d.inherited.taskId})` : ''}` : `Đẩy nhánh ${d.branch} lên ${d.remote}?`;
      if (!confirm(what)) return;
      if (d.secrets.length) {
        if (!confirm(`Có dòng trông như khóa/mật khẩu:\n${d.secrets.slice(0, 15).join('\n')}\n\nChỉ đẩy nếu đó là dữ liệu thử (vd. test của bộ che bí mật), không phải khóa thật. Vẫn đẩy?`)) return;
        allowSecrets = true;
      }
      if (action === 'ff' && d.warnings.length) {
        if (!confirm(`Còn cảnh báo:\n- ${d.warnings.join('\n- ')}\n\nVẫn đẩy vào ${d.baseRef}?`)) return;
        override = true;
      }
    }
    F.ship.set(id, { ...s0, busy: true });
    rerender();
    try {
      const r = await C.api(`/api/tasks/${encodeURIComponent(id)}/ship`, { method: 'POST', body: JSON.stringify({ action, override, allowSecrets }) });
      if (r?.task) C.S.tasks.set(r.task.id, r.task);
      F.ship.set(id, { open: true, busy: false, data: r.status, at: Date.now() });
      C.toast({ level: 'info', title: action === 'ff' ? `Đã đẩy vào ${d.baseBranch}` : 'Đã đẩy nhánh', msg: t.title });
    } catch (e) {
      F.ship.set(id, { ...F.ship.get(id), busy: false });
      // trạng thái đổi giữa lúc xem và lúc bấm (cảnh báo / dòng giống khóa mới) → hỏi lại một lần
      if (!override && /vẫn đẩy/.test(e.message) && confirm(`${e.message}\n\nVẫn đẩy?`)) return act(id, action, rerender, { override: true, allowSecrets });
      if (!allowSecrets && /dữ liệu thử/.test(e.message) && confirm(`${e.message}\n\nVẫn đẩy?`)) return act(id, action, rerender, { override, allowSecrets: true });
      C.toast({ level: 'error', title: 'Không đẩy được', msg: e.message });
    }
    rerender();
  }
  function bindShip(root, rerender) {
    $$('[data-sh]', root).forEach((box) => {
      const id = box.dataset.sh;
      const re = () => {
        const t = C.S.tasks.get(id);
        const cur = document.querySelector(`[data-sh="${CSS.escape(id)}"]`);
        if (!t || !cur) return rerender?.();
        cur.outerHTML = F.shipHtml(t);
        bindShip(document.querySelector(`[data-sh="${CSS.escape(id)}"]`)?.parentElement || document, rerender);
      };
      box.querySelector('[data-sh-open]')?.addEventListener('click', () => loadShip(id, re));
      box.querySelector('[data-sh-refresh]')?.addEventListener('click', () => loadShip(id, re));
      box.querySelector('[data-sh-close]')?.addEventListener('click', () => {
        F.ship.set(id, { ...F.ship.get(id), open: false });
        re();
      });
      box.querySelectorAll('[data-sh-act]').forEach((b) => b.addEventListener('click', () => act(id, b.dataset.shAct, re)));
      box.querySelector('[data-task-link]')?.addEventListener('click', (e) => C.openTask(e.currentTarget.dataset.taskLink));
      box.querySelector('a[aria-disabled]')?.addEventListener('click', (e) => {
        e.preventDefault();
        C.toast({ level: 'info', title: 'Đẩy nhánh trước', msg: 'GitHub chỉ mở được PR khi nhánh đã có trên remote.' });
      });
    });
  }

  /** Duyệt kế hoạch đang chờ (kèm bản nháp sửa + chỉ dẫn nếu có) — dùng cho hộp "Cần bạn" (phím 1). */
  F.approvePlan = async (id) => {
    const t = C.S.tasks.get(id);
    if (!planPaused(t)) throw new Error('Nhiệm vụ không còn chờ duyệt kế hoạch');
    const run = pendingRun(t);
    const d = draftOf(id);
    const body = { department: run?.department, subtasks: collect(t), approve: true };
    if (d.note.trim()) {
      if (window.Director?.hasSecret?.(d.note)) throw new Error('Chỉ dẫn có vẻ chứa khóa/mật khẩu');
      body.note = d.note.trim();
    }
    const r = await C.api(`/api/tasks/${encodeURIComponent(id)}/plan`, { method: 'POST', body: JSON.stringify(body) });
    if (r?.id) C.S.tasks.set(r.id, r);
    F.draft.delete(id);
    return r;
  };

  /** Gắn sự kiện cho các khối của UX-2 trong root (sau mỗi lần vẽ). */
  F.bind = (root, after) => {
    bindPlan(root, after);
    bindShip(root, after);
    bindAccept(root);
  };
  /** Đang sửa kế hoạch / thao tác bảng gộp → nơi gọi nên hoãn vẽ lại. */
  F.busy = (root) => !!document.activeElement?.closest?.('.pl-box, .sh-box') && (!root || root.contains(document.activeElement));
  F.init = () => {
    C = window.CC;
  };
  window.Flow = F;
})();
