// UX-3: dòng thời gian (Gantt) của một nhiệm vụ — mỗi hạng mục một làn, mỗi lượt gọi agent một thanh theo thời lượng thật,
// pha của phòng, lệnh chuẩn bị/kiểm tra, khoảng tạm dừng, mốc gộp worktree con, đường găng. Dữ liệu: GET /api/tasks/<id>/timeline.
(function () {
  let C = null;
  const esc = (s) => C.esc(s);
  const TL = { zoom: 1, cache: new Map(), inflight: new Set(), box: null };
  // khoảng chờ giữa hai lần chạy: tạm dừng (lý do theo C.PAUSE_VI) hoặc sau khi xong/lỗi/hủy rồi được chạy tiếp
  const GAP_VI = { done: 'đã xong, chờ chạy tiếp', failed: 'lỗi, chờ chạy lại', cancelled: 'đã hủy, chờ chạy tiếp' };
  const PH = {
    route: 'Định tuyến',
    plan: 'Lập kế hoạch',
    discuss: 'Họp',
    finalize: 'Chốt kế hoạch',
    execute: 'Thực thi',
    review: 'Review',
    revise: 'Sửa theo review',
    synthesize: 'Tổng hợp',
    accept: 'Nghiệm thu (CTO)',
    checks: 'Lệnh kiểm tra',
    setup: 'Lệnh chuẩn bị',
  };
  const dur = (ms) => {
    if (!(ms > 0)) return '0 giây';
    const s = Math.round(ms / 1000);
    if (s < 60) return `${s} giây`;
    const m = Math.round(s / 60);
    return m < 60 ? `${m} phút` : `${Math.floor(m / 60)} giờ ${m % 60} phút`;
  };
  const clock = (ms, sec) => new Date(ms).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', ...(sec ? { second: '2-digit' } : {}) });
  const STEPS = [10e3, 30e3, 60e3, 2 * 60e3, 5 * 60e3, 10 * 60e3, 15 * 60e3, 30 * 60e3, 3600e3, 2 * 3600e3, 6 * 3600e3, 24 * 3600e3];

  function render(box, d) {
    const T0 = d.start;
    const span = Math.max(1000, d.end - d.start);
    const x = (ms) => `${(((ms - T0) / span) * 100).toFixed(3)}%`;
    const w = (a, b) => `max(2px, ${(((b - a) / span) * 100).toFixed(3)}%)`;
    const step = STEPS.find((s) => span / s <= 10 * TL.zoom) || STEPS.at(-1);
    const ticks = [];
    for (let k = Math.ceil(T0 / step) * step; k <= d.end; k += step) ticks.push(k);
    const pz = d.pauses.map((p) => `<i class="tl-pz" style="left:${x(p.start)};width:${w(p.start, p.end)}" title="Tạm dừng${p.reason ? ` (${esc(C.PAUSE_VI?.[p.reason] || GAP_VI[p.reason] || p.reason)})` : ''}: ${dur(p.end - p.start)}"></i>`).join('');
    const nowLine = d.live ? `<i class="tl-now" style="left:${x(d.now)}" title="Bây giờ"></i>` : '';
    const crit = d.critical.lanes.map((k) => k.split('|')[1]).filter((s) => s && s !== '_');
    const st = d.stats;
    const head = `<div class="tl-stats">
      <span title="Từ lúc bắt đầu tới lúc xong (hoặc bây giờ)">⏱ <b>${dur(st.wallMs)}</b></span>
      ${st.pausedMs ? `<span title="Tổng thời gian tạm dừng">⏸ ${dur(st.pausedMs)}</span>` : ''}
      <span title="Thời gian có ít nhất một hạng mục đang thực thi / sửa">⚙ thực thi ${dur(st.executeMs)}${st.wallMs ? ` (${Math.round((st.executeMs / Math.max(1, st.wallMs - st.pausedMs)) * 100)}%)` : ''}</span>
      <span title="Số hạng mục thực thi cùng lúc nhiều nhất">⇉ song song tối đa <b>${st.maxParallel}</b></span>
      ${crit.length ? `<span class="tl-cr" title="Chuỗi phụ thuộc quyết định thời gian xong">🔴 đường găng ${crit.map(esc).join(' → ')} · ${dur(d.critical.ms)}</span>` : ''}
      <span>${st.calls} lượt gọi</span><span class="grow"></span>
      <span class="tl-zoom" role="group" aria-label="Thu phóng">${[1, 2, 4].map((z) => `<button type="button" data-z="${z}" class="${TL.zoom === z ? 'on' : ''}">${z}×</button>`).join('')}</span>
      ${d.live ? '<span class="tl-livebadge">● trực tiếp</span>' : ''}</div>`;
    const legend = `<div class="tl-legend">${['plan', 'discuss', 'execute', 'review', 'revise', 'synthesize', 'accept', 'checks', 'setup'].map((p) => `<span><i class="tl-b ph-${p}"></i>${PH[p]}</span>`).join('')}<span><i class="tl-b open"></i>đang chạy</span><span><i class="tl-b err"></i>lỗi / bị ngắt</span><span><i class="tl-wait"></i>chờ (đã sẵn sàng)</span><span><i class="tl-pz-k"></i>tạm dừng</span><span>◆ gộp worktree con</span></div>`;
    const deptName = (dep) => (dep === '_' ? 'Điều phối' : C.deptName(dep));
    const multi = new Set(d.lanes.map((l) => l.department)).size > 1;
    let lastDept = '';
    const rows = d.lanes
      .map((l) => {
        let sep = '';
        if (multi && l.department !== lastDept) {
          lastDept = l.department;
          const ph = d.phases.filter((p) => p.department === l.department);
          sep = `<div class="tl-row tl-dept"><div class="tl-lab"><b>${esc(deptName(l.department))}</b></div><div class="tl-track">${ph.map((p) => `<i class="tl-ph ph-${esc(p.phase)}" style="left:${x(p.start)};width:${w(p.start, p.end)}" title="${esc(PH[p.phase] || p.phase)}: ${dur(p.end - p.start)}"></i>`).join('')}</div></div>`;
        }
        const first = l.bars.find((b) => b.phase === 'execute' || b.phase === 'revise');
        const wait = l.readyAt && first && first.start - l.readyAt > 15000 ? `<i class="tl-wait" style="left:${x(l.readyAt)};width:${w(l.readyAt, first.start)}" title="Đã sẵn sàng (phụ thuộc xong) nhưng chờ ${dur(first.start - l.readyAt)} mới bắt đầu"></i>` : '';
        const bars = l.bars
          .map((b) => {
            const who = b.agentId ? C.agentName(b.agentId) : '';
            const tip = `${PH[b.phase] || b.phase}${b.label ? ` · ${b.label}` : ''}${who ? ` · ${who}` : ''} · ${dur(b.end - b.start)} · ${clock(b.start)}–${b.open ? 'đang chạy' : clock(b.end)}${b.error ? (b.open ? '' : ' · lỗi/bị ngắt') : ''}`;
            return `<i class="tl-b ph-${esc(b.phase)}${b.open ? ' open' : ''}${b.error ? ' err' : ''}" style="left:${x(b.start)};width:${w(b.start, b.end)}" title="${esc(tip)}"></i>`;
          })
          .join('');
        const merges = l.merges.map((m) => `<i class="tl-mg" style="left:${x(m)}" title="Gộp worktree con vào nhánh nhiệm vụ lúc ${clock(m)}">◆</i>`).join('');
        const lab = l.subtask
          ? `<code>${esc(l.subtask)}</code><span class="tl-t" title="${esc(l.title)}">${esc(l.title)}</span><small>${l.assignee ? esc(C.agentName(l.assignee)) : ''}${l.dependsOn.length ? ` · sau ${esc(l.dependsOn.join(', '))}` : ''}${l.critical ? ' · <b class="tl-crt">găng</b>' : ''}</small>`
          : `<span class="tl-t">${esc(l.title)}</span><small>${esc(deptName(l.department))}</small>`;
        return `${sep}<div class="tl-row${l.critical ? ' crit' : ''}${l.subtask ? '' : ' coord'}"><div class="tl-lab">${lab}</div><div class="tl-track">${pz}${wait}${bars}${merges}${nowLine}</div></div>`;
      })
      .join('');
    const axis = `<div class="tl-row tl-axis"><div class="tl-lab"><small>${new Date(T0).toLocaleDateString('vi-VN')}</small></div><div class="tl-track">${ticks.map((k) => `<span class="tl-tick" style="left:${x(k)}">${clock(k, step < 60e3)}</span>`).join('')}</div></div>`;
    const empty = !d.lanes.some((l) => l.bars.length);
    box.innerHTML = `<div class="tl">${head}${legend}${
      empty ? '<div class="empty">Chưa có lượt gọi nào được ghi lại cho nhiệm vụ này.</div>' : `<div class="tl-scroll"><div class="tl-grid" style="--z:${TL.zoom}">${axis}${rows}</div></div>`
    }<p class="tl-note">Mỗi thanh là một lượt gọi agent (độ dài = thời gian thật); làn có nhãn <b class="tl-crt">găng</b> nằm trên đường găng. Dữ liệu từ <code>calls.jsonl</code> và nhật ký nhiệm vụ.</p></div>`;
    box.querySelectorAll('[data-z]').forEach(
      (b) =>
        (b.onclick = () => {
          TL.zoom = Number(b.dataset.z);
          render(box, d);
        }),
    );
  }

  /**
   * Tab "⏱ Dòng thời gian" của trang nhiệm vụ. Trang nhiệm vụ vẽ lại theo mỗi sự kiện → vẽ từ bộ nhớ đệm, chỉ gọi API khi dữ
   * liệu đã cũ hơn ≈5 giây / trạng thái nhiệm vụ đổi và không có lượt gọi nào đang chờ; nhiệm vụ đang chạy tự làm mới mỗi 5 giây
   * khi tab nhiệm vụ + tab dòng thời gian còn mở.
   */
  TL.view = async (box, t) => {
    TL.box = box;
    const c = TL.cache.get(t.id);
    if (c) render(box, c.d);
    else box.innerHTML = '<div class="empty">Đang dựng dòng thời gian…</div>';
    const showing = () => TL.box && TL.box.isConnected && C.S.tab === 'tasks' && C.S.taskView === 'timeline' && C.S.selectedTask === t.id;
    if (!(c && Date.now() - c.at < 4500 && c.status === t.status) && !TL.inflight.has(t.id)) {
      TL.inflight.add(t.id);
      try {
        const d = await C.api(`/api/tasks/${encodeURIComponent(t.id)}/timeline`);
        TL.cache.set(t.id, { d, at: Date.now(), status: t.status });
        if (showing()) render(TL.box, d);
      } catch (e) {
        if (!c && showing()) TL.box.innerHTML = `<div class="empty">${esc(e.message)}</div>`;
      } finally {
        TL.inflight.delete(t.id);
      }
    }
    if (TL.cache.get(t.id)?.d.live) {
      clearTimeout(TL.timer);
      TL.timer = setTimeout(() => {
        if (showing() && document.visibilityState === 'visible') TL.view(TL.box, C.S.tasks.get(t.id) || t);
      }, 5000);
    }
  };
  TL.init = () => {
    C = window.CC;
  };
  window.TL = TL;
})();
