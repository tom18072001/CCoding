// B-19: vòng tự cải thiện — danh sách đề xuất, Duyệt/Từ chối, Áp dụng và Rollback (cả hai có xác nhận).
// Khi GET /api/selfimprove/proposals trả 404 (selfImprove.enabled=false) thì ẩn toàn bộ mục.
// Dữ liệu agentProposal/diff đã che PII ở server; client vẫn chỉ dùng textContent (không innerHTML).
(function (root) {
  const STATUS_VI = {
    proposed: 'Chờ duyệt',
    rejected: 'Đã từ chối',
    approved: 'Đã duyệt',
    applied: 'Đã áp dụng',
    'rollback.proposed': 'Đề xuất rollback',
    rolledback: 'Đã rollback',
  };

  // --- hàm thuần (test bằng node --test) ---
  const statusLabel = (s) => STATUS_VI[s] || String(s ?? '—');
  function abSummary(p) {
    const ab = (p && p.ab) || {};
    const parts = [`Sàng lọc: ${ab.screenRuns ?? 0} lượt`, `Xác nhận: ${ab.confirmRuns ?? 0}/${ab.maxConfirmRuns ?? 0} lượt`];
    if (ab.result) parts.push(`A/B: Δ đạt ${ab.result.deltaPass} · ${ab.result.decision}`);
    else parts.push('A/B: chưa có kết quả');
    return parts;
  }
  function screeningSummary(p) {
    const s = (p && p.screening) || {};
    if (s.ok) return 'Sàng lọc an toàn: đạt';
    const v = Array.isArray(s.violations) ? s.violations : [];
    return `Sàng lọc an toàn: không đạt${v.length ? ' — ' + v.join('; ') : ''}`;
  }
  // Mô tả nút khả dụng theo trạng thái.
  function actionsFor(status) {
    if (status === 'proposed') return ['approve', 'reject'];
    if (status === 'approved') return ['apply'];
    if (status === 'rollback.proposed') return ['rollback'];
    return [];
  }
  // Mô hình hiển thị: chỉ chuỗi thuần, chưa chạm DOM.
  function viewModel(p) {
    return {
      id: String(p.id ?? ''),
      title: `${p.id} · ${p.cluster}`,
      cluster: String(p.cluster ?? ''),
      targetFile: String(p.targetFile ?? ''),
      status: statusLabel(p.status),
      screening: screeningSummary(p),
      ab: abSummary(p),
      agentProposal: String(p.agentProposal ?? ''),
      diff: String(p.diff ?? ''),
      actions: actionsFor(p.status),
    };
  }
  // 404 ⇒ ẩn mục (tính năng đang tắt).
  const isHidden = (err) => !!err && err.status === 404;

  // --- DOM (chỉ tạo node + textContent) ---
  function el(doc, tag, text, cls) {
    const n = doc.createElement(tag);
    if (text != null) n.textContent = text;
    if (cls) n.className = cls;
    return n;
  }
  function renderItem(doc, p, on) {
    const m = viewModel(p);
    const box = el(doc, 'div', null, 'si-item');
    box.appendChild(el(doc, 'b', m.title));
    const meta = el(doc, 'div', null, 'si-meta');
    [`Tệp đích: ${m.targetFile}`, `Trạng thái: ${m.status}`, m.screening, ...m.ab].forEach((t) => meta.appendChild(el(doc, 'span', t)));
    box.appendChild(meta);
    if (m.agentProposal) {
      box.appendChild(el(doc, 'small', 'Đề xuất của agent'));
      box.appendChild(el(doc, 'pre', m.agentProposal));
    }
    if (m.diff) {
      box.appendChild(el(doc, 'small', 'Diff'));
      box.appendChild(el(doc, 'pre', m.diff));
    }
    const act = el(doc, 'div', null, 'si-act');
    const LABEL = { approve: ['Duyệt', 'btn primary sm'], apply: ['Áp dụng', 'btn primary sm'], reject: ['Từ chối', 'btn ghost sm danger'], rollback: ['Rollback', 'btn ghost sm danger'] };
    m.actions.forEach((a) => {
      const b = el(doc, 'button', LABEL[a][0], LABEL[a][1]);
      b.type = 'button';
      b.addEventListener('click', () => on(a, p));
      act.appendChild(b);
    });
    box.appendChild(act);
    return box;
  }
  function renderList(doc, host, list, on) {
    host.textContent = '';
    host.appendChild(el(doc, 'h2', 'Đề xuất tự cải thiện'));
    host.appendChild(el(doc, 'p', 'Mọi thay đổi cần giám đốc duyệt; rollback cần xác nhận riêng.', 'bp-note'));
    if (!list.length) return host.appendChild(el(doc, 'div', 'Chưa có đề xuất nào.', 'empty-row'));
    list.forEach((p) => host.appendChild(renderItem(doc, p, on)));
  }

  // Xử lý bấm nút. C.api tự gắn token (cơ chế chung của app.js); lỗi chỉ hiện message server đã che, không in body thô.
  // Hợp đồng route (src/server.ts): proposed→approve|reject; approved→apply; rollback.proposed→rollback-confirm.
  function makeHandler(rt, C, rerender) {
    const BASE = '/api/selfimprove/proposals';
    const post = async (id, verb, body, okMsg) => {
      try {
        await C.api(`${BASE}/${encodeURIComponent(id)}/${verb}`, { method: 'POST', body: JSON.stringify(body || {}) });
        C.toast({ level: 'info', title: okMsg, msg: id });
        await rerender();
      } catch (e) {
        C.toast({ level: 'error', title: 'Thao tác không thành công', msg: String((e && e.message) || 'Lỗi không xác định') });
      }
    };
    return (a, p) => {
      if (a === 'approve') return post(p.id, 'approve', {}, 'Đã duyệt đề xuất');
      if (a === 'reject') {
        const reason = rt.prompt(`Lý do từ chối ${p.id} (có thể bỏ trống):`, '');
        if (reason === null) return;
        return post(p.id, 'reject', reason ? { reason } : {}, 'Đã từ chối đề xuất');
      }
      if (a === 'apply' && rt.confirm(`Áp dụng ${p.id} vào ${p.targetFile}? Hệ thống sẽ sửa tệp này và tạo một commit riêng; có thể rollback sau.`)) return post(p.id, 'apply', {}, 'Đã áp dụng đề xuất');
      if (a === 'rollback' && rt.confirm(`Rollback thay đổi ${p.id} trên ${p.targetFile}? Thao tác này hoàn tác bản đã áp dụng.`)) return post(p.id, 'rollback-confirm', {}, 'Đã xác nhận rollback');
    };
  }

  const pure = { statusLabel, abSummary, screeningSummary, actionsFor, viewModel, isHidden, renderItem, renderList, makeHandler };
  if (typeof module !== 'undefined' && module.exports) module.exports = pure;
  if (!root.document) {
    root.SelfImprove = pure;
    return;
  }

  const BASE = '/api/selfimprove/proposals';
  async function render() {
    const C = root.CC;
    const host = root.document.getElementById('selfimprove-panel');
    if (!C || !host) return;
    let list;
    try {
      list = await C.api(BASE);
    } catch (e) {
      host.hidden = true;
      host.textContent = '';
      if (!isHidden(e)) C.toast({ level: 'error', title: 'Không tải được đề xuất tự cải thiện', msg: e.message });
      return;
    }
    host.hidden = false;
    renderList(root.document, host, Array.isArray(list) ? list : [], makeHandler(root, C, render));
  }
  root.SelfImprove = { render, ...pure };
})(typeof window !== 'undefined' ? window : globalThis);
