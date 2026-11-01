// UX-1: diff thay đổi của nhiệm vụ, kết quả lệnh kiểm tra trước/sau, luồng hoạt động trực tiếp theo hạng mục.
// Dùng chung cho trang nhiệm vụ (app.js) và màn Prompt (chat.js). Trạng thái hiển thị (tệp đang mở, luồng đang mở,
// diff đã tải) giữ ở đây để không mất khi trang được vẽ lại sau mỗi sự kiện thời gian thực.
(function () {
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  let C = null;
  const esc = (s) => C.esc(s);
  const U = {
    feed: new Map(), // `${taskId}|${agentId}` → dòng hoạt động trực tiếp (sự kiện output)
    feedOpen: new Set(), // `${taskId}|${agentId}|${subtaskId}`
    hist: new Map(), // `${taskId}|${subtaskId}` → { at, rows }
    histOpen: new Set(),
    sum: new Map(), // `${taskId}|${commit}` → { at, data }
    files: new Map(), // `${taskId}|${commit}|${path}` → file diff
    fileOpen: new Set(),
    commit: new Map(), // taskId → commit đang chọn trong tab Thay đổi
  };
  const FEED_MAX = 160;
  const live = (t) => !!t && ['running', 'queued', 'paused'].includes(t.status);
  const short = (sha) => String(sha || '').slice(0, 10);

  // ── Luồng hoạt động trực tiếp (B1) ───────────────────────────────────────
  const lastAct = (lines) => {
    for (let i = lines.length - 1; i >= 0; i--) if (lines[i].startsWith('⚙ ')) return lines[i].slice(2);
    return '';
  };
  /** Khối "đang làm" dưới một hạng mục đang chạy: việc gần nhất + luồng đầy đủ (bấm để mở). */
  U.liveHtml = (t, s) => {
    if (!t || !s || s.status !== 'running') return '';
    const k = `${t.id}|${s.assignee}`;
    const st = C.S.agents.get(s.assignee)?.state;
    const lines = U.feed.get(k) || [];
    const act = (st?.taskId === t.id && st.activity) || lastAct(lines) || 'đang chờ model trả lời…';
    const open = U.feedOpen.has(`${k}|${s.id}`);
    return `<div class="lv" data-lv-k="${esc(k)}" data-lv-s="${esc(s.id)}" data-lv-t="${esc(t.id)}"><span class="lv-dot" aria-hidden="true"></span><span class="lv-act" title="Việc agent đang làm — cập nhật trực tiếp">${esc(act)}</span><span class="lv-n">${lines.length ? `${lines.length} dòng` : ''}</span><button type="button" class="lv-btn" data-lv-toggle aria-expanded="${open}">${open ? 'Ẩn luồng' : 'Xem luồng'}</button><pre class="lv-pre"${open ? '' : ' hidden'}>${esc(lines.join('\n'))}</pre></div>`;
  };
  U.onOutput = (o) => {
    if (!o?.taskId || !o.agentId || !o.chunk) return;
    const k = `${o.taskId}|${o.agentId}`;
    const lines = U.feed.get(k) || [];
    for (const l of String(o.chunk).split('\n')) {
      const x = l.trimEnd();
      if (x) lines.push(x.length > 400 ? x.slice(0, 400) + '…' : x);
    }
    if (lines.length > FEED_MAX) lines.splice(0, lines.length - FEED_MAX);
    U.feed.set(k, lines);
    for (const el of $$(`.lv[data-lv-k="${CSS.escape(k)}"]`)) {
      const a = lastAct(lines);
      if (a) el.querySelector('.lv-act').textContent = a;
      el.querySelector('.lv-n').textContent = `${lines.length} dòng`;
      const pre = el.querySelector('.lv-pre');
      if (!pre.hidden) {
        const atEnd = pre.scrollHeight - pre.scrollTop - pre.clientHeight < 40;
        pre.textContent = lines.join('\n');
        if (atEnd) pre.scrollTop = pre.scrollHeight;
      }
    }
  };
  U.onAgent = (st) => {
    if (!st?.taskId || !st.activity) return;
    for (const el of $$(`.lv[data-lv-k="${CSS.escape(`${st.taskId}|${st.id}`)}"]`)) el.querySelector('.lv-act').textContent = st.activity;
  };
  async function toggleFeed(el) {
    const key = `${el.dataset.lvK}|${el.dataset.lvS}`;
    const pre = el.querySelector('.lv-pre');
    const btn = el.querySelector('[data-lv-toggle]');
    const open = pre.hidden;
    pre.hidden = !open;
    btn.textContent = open ? 'Ẩn luồng' : 'Xem luồng';
    btn.setAttribute('aria-expanded', String(open));
    if (open) U.feedOpen.add(key);
    else U.feedOpen.delete(key);
    if (!open) return;
    // tải lại trang giữa chừng → luồng trống: lấy các lệnh/công cụ đã dùng của hạng mục từ nhật ký
    if (!(U.feed.get(el.dataset.lvK) || []).length) {
      const rows = await histRows(el.dataset.lvT, el.dataset.lvS, true);
      if (rows.length && !(U.feed.get(el.dataset.lvK) || []).length) {
        U.feed.set(el.dataset.lvK, ['(các lượt đã xong trước khi mở trang)', ...rows.map((r) => `🛠 ${r.msg}`)]);
        pre.textContent = U.feed.get(el.dataset.lvK).join('\n');
      } else if (!rows.length) pre.textContent = 'Chưa có hoạt động nào — agent đang chờ model trả lời.';
    }
    pre.scrollTop = pre.scrollHeight;
  }

  // ── Lịch sử công cụ của một hạng mục (trang nhiệm vụ) ─────────────────────
  async function histRows(taskId, sub, force) {
    const k = `${taskId}|${sub}`;
    const c = U.hist.get(k);
    const t = C.S.tasks.get(taskId);
    if (c && !force && (!live(t) || Date.now() - c.at < 15000)) return c.rows;
    try {
      const rows = await C.api(`/api/tasks/${encodeURIComponent(taskId)}/events?kind=tool.call&subtask=${encodeURIComponent(sub)}&limit=300`);
      U.hist.set(k, { at: Date.now(), rows });
      return rows;
    } catch {
      return c?.rows || [];
    }
  }
  const histList = (rows) =>
    rows.length
      ? `<ol class="hist-l">${rows
          .slice()
          .reverse()
          .map((r) => `<li class="${r.level === 'warn' ? 'bad' : ''}"><time>${esc(C.time(r.ts))}</time><span>${esc(r.msg)}</span></li>`)
          .join('')}</ol>`
      : '<p class="hist-e">Chưa ghi công cụ nào cho hạng mục này (runtime không dùng công cụ, hoặc lượt đang chạy chưa xong).</p>';
  U.histLink = (t, s) => `<a data-hist="${esc(s.id)}" data-hist-t="${esc(t.id)}" title="Lệnh, tệp đã đọc/ghi của hạng mục (từ nhật ký)">📜 hoạt động</a>`;
  U.histHtml = (t, s) => {
    const k = `${t.id}|${s.id}`;
    if (!U.histOpen.has(k)) return `<div class="hist" data-hist-box="${esc(k)}" hidden></div>`;
    const c = U.hist.get(k);
    return `<div class="hist" data-hist-box="${esc(k)}">${c ? histList(c.rows) : '<p class="hist-e">Đang tải…</p>'}</div>`;
  };
  async function toggleHist(a) {
    const k = `${a.dataset.histT}|${a.dataset.hist}`;
    const box = document.querySelector(`[data-hist-box="${CSS.escape(k)}"]`);
    if (!box) return;
    if (!box.hidden) {
      box.hidden = true;
      U.histOpen.delete(k);
      return;
    }
    U.histOpen.add(k);
    box.hidden = false;
    box.innerHTML = '<p class="hist-e">Đang tải…</p>';
    const rows = await histRows(a.dataset.histT, a.dataset.hist, true);
    const again = document.querySelector(`[data-hist-box="${CSS.escape(k)}"]`);
    if (again && U.histOpen.has(k)) again.innerHTML = histList(rows);
  }

  // ── Kết quả lệnh kiểm tra trước / sau (A2) ────────────────────────────────
  function cell(c) {
    if (!c) return '<td class="ck-na">—</td>';
    const mark = c.denied ? '⛔' : c.timedOut ? '⏱' : c.ok ? '✓' : '✗';
    const cls = c.denied || c.timedOut || !c.ok ? 'bad' : 'ok';
    const sec = c.ms >= 1000 ? ` · ${c.ms >= 60000 ? `${Math.round(c.ms / 60000)} phút` : `${Math.round(c.ms / 1000)} s`}` : '';
    const why = c.denied ? `bị chặn: ${c.denied}` : c.summary || (c.timedOut ? 'quá thời gian' : c.ok ? 'đạt' : `mã thoát ${c.code ?? '?'}`);
    return `<td class="${cls}"><b>${mark}</b> <span>${esc(String(why).slice(0, 140))}</span><small>${sec}</small></td>`;
  }
  function checkRows(pc) {
    const base = pc.baseline || [];
    const last = pc.latest || [];
    const cmds = [...new Set([...base, ...last].map((c) => c.command))];
    return cmds.map((cmd) => {
      const b = base.find((c) => c.command === cmd);
      const l = last.find((c) => c.command === cmd);
      const reg = !!(b?.ok && l && !l.ok);
      const fixed = !!(b && !b.ok && l?.ok);
      return { cmd, b, l, reg, fixed };
    });
  }
  /** Bảng lệnh kiểm tra của dự án: baseline (trước khi sửa) → lần gần nhất (sau thực thi/sửa). */
  U.checksHtml = (t) => {
    const pc = t?.projectChecks;
    if (!pc || (!(pc.baseline || []).length && !(pc.latest || []).length)) return '';
    const rows = checkRows(pc);
    const regs = rows.filter((r) => r.reg).length;
    const fails = rows.filter((r) => (r.l || r.b) && !(r.l || r.b).ok).length;
    const after = pc.latestAfter === 'revise' ? 'Sau vòng sửa' : 'Sau thực thi';
    const head = `🧪 Lệnh kiểm tra · ${rows.length - fails}/${rows.length} đạt${regs ? ` · <b class="bad">${regs} hồi quy</b>` : ''}`;
    return `<details class="ck"${regs || fails ? ' open' : ''}><summary>${head}<small>CCoding tự chạy, không qua agent</small></summary>
      <table class="ck-t"><thead><tr><th>Lệnh</th><th>Trước khi sửa${pc.baselineAt ? ` <small>${esc(C.time(pc.baselineAt))}</small>` : ''}</th><th>${esc(after)}${pc.latestAt ? ` <small>${esc(C.time(pc.latestAt))}</small>` : ''}</th></tr></thead><tbody>
      ${rows
        .map(
          (r) => `<tr class="${r.reg ? 'reg' : r.fixed ? 'fixed' : ''}"><td><code>${esc(r.cmd.slice(0, 120))}</code>${r.reg ? ' <em class="bad">hồi quy</em>' : r.fixed ? ' <em class="ok">đã sửa</em>' : ''}</td>${cell(r.b)}${cell(r.l)}</tr>${
            (r.l || r.b)?.tail && !(r.l || r.b).ok ? `<tr class="ck-tail"><td colspan="3"><details><summary>Đuôi đầu ra</summary><pre>${esc((r.l || r.b).tail)}</pre></details></td></tr>` : ''
          }`,
        )
        .join('')}</tbody></table></details>`;
  };
  /** Một dòng gọn cho hội thoại. */
  U.checksChip = (t) => {
    const pc = t?.projectChecks;
    if (!pc || (!(pc.baseline || []).length && !(pc.latest || []).length)) return '';
    const rows = checkRows(pc);
    const regs = rows.filter((r) => r.reg).length;
    const fails = rows.filter((r) => (r.l || r.b) && !(r.l || r.b).ok).length;
    return `<button class="cv-chip ck-chip ${regs || fails ? 'bad' : 'ok'}" data-act="checks" data-tid="${esc(t.id)}" title="${esc(rows.map((r) => `${(r.l || r.b)?.ok ? '✓' : '✗'} ${r.cmd}`).join('\n'))}">🧪 ${rows.length - fails}/${rows.length} lệnh kiểm tra đạt${regs ? ` · ${regs} hồi quy` : ''}</button>`;
  };

  // ── Diff thay đổi (A1) ────────────────────────────────────────────────────
  const ST = { A: 'thêm', M: 'sửa', D: 'xóa', R: 'đổi tên', C: 'chép', T: 'đổi kiểu', '?': 'mới · chưa commit' };
  U.hasDiff = (t) => !!(t?.branch && t?.baseRef);
  /** Bản đã tải còn dùng được: việc đang chạy → tối đa 20 giây; việc đã dừng → chỉ khi tải SAU lần cập nhật cuối của nhiệm vụ. */
  const fresh = (t, c) => !!c && (live(t) ? Date.now() - c.at < 20000 : c.at >= Date.parse(t.finishedAt || t.updatedAt || 0));
  U.fresh = fresh;
  async function summary(t, commit, force) {
    const k = `${t.id}|${commit || ''}`;
    const c = U.sum.get(k);
    if (c && !force && fresh(t, c)) return c.data;
    const data = await C.api(`/api/tasks/${encodeURIComponent(t.id)}/diff${commit ? `?commit=${encodeURIComponent(commit)}` : ''}`);
    // nội dung tệp có thể đã đổi → bỏ bản diff từng tệp đã tải trước đó
    if (c) for (const key of [...U.files.keys()]) if (key.startsWith(`${t.id}|${commit || ''}|`)) U.files.delete(key);
    U.sum.set(k, { at: Date.now(), data });
    return data;
  }
  /** Điền "+a −d · n tệp" vào các phần tử [data-dstat] (hội thoại). */
  const statHtml = (d) => (d.totals.files ? ` <span class="add">+${C.fmt(d.totals.add)}</span> <span class="del">−${C.fmt(d.totals.del)}</span> · ${d.totals.files} tệp` : ' · chưa có thay đổi');
  const pending = new Set();
  U.fillStats = (root) => {
    for (const el of $$('[data-dstat]', root)) {
      const t = C.S.tasks.get(el.dataset.dstat);
      if (!t) continue;
      const c = U.sum.get(`${t.id}|`);
      if (c) el.innerHTML = statHtml(c.data);
      if (fresh(t, c) || pending.has(t.id)) continue;
      pending.add(t.id);
      summary(t, '', !!c)
        .then((d) => $$(`[data-dstat="${CSS.escape(t.id)}"]`).forEach((x) => (x.innerHTML = statHtml(d))))
        .catch(() => {})
        .finally(() => pending.delete(t.id));
    }
  };
  // ── Bình luận theo dòng trên diff (A3): lưu nháp trong trình duyệt theo nhiệm vụ, gửi một lần thành yêu cầu sửa ──
  const cmKey = (tid) => `ccoding.dfc.${tid}`;
  const cmGet = (tid) => {
    try {
      return JSON.parse(localStorage.getItem(cmKey(tid)) || '[]');
    } catch {
      return [];
    }
  };
  const cmSet = (tid, list) => {
    try {
      if (list.length) localStorage.setItem(cmKey(tid), JSON.stringify(list));
      else localStorage.removeItem(cmKey(tid));
    } catch {}
  };
  U.comments = cmGet;
  const cmHtml = (c) => `<div class="dc" data-dc="${esc(c.id)}"><span class="dc-who">💬</span><div class="dc-t">${C.md(c.text)}</div><button type="button" class="dc-x" data-dc-del="${esc(c.id)}" title="Xóa bình luận" aria-label="Xóa bình luận">✕</button></div>`;
  function lineHtml(text, cms = []) {
    const out = [];
    let o = 0;
    let n = 0;
    const at = (side, num) => cms.filter((c) => c.side === side && c.line === num).map(cmHtml).join('');
    const lines = text.split('\n');
    const MAX = 4000;
    for (let i = 0; i < lines.length && out.length < MAX; i++) {
      const l = lines[i];
      if (/^(diff --git|index |--- |\+\+\+ |new file|deleted file|old mode|new mode|similarity index|dissimilarity index)/.test(l)) continue;
      if (/^(rename|copy) (from|to) /.test(l)) {
        out.push(`<div class="dl meta"><i></i><i></i><code>${esc(l)}</code></div>`);
        continue;
      }
      const h = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@(.*)$/.exec(l);
      if (h) {
        o = Number(h[1]);
        n = Number(h[2]);
        out.push(`<div class="dl hunk"><i></i><i></i><code>${esc(l)}</code></div>`);
        continue;
      }
      if (l.startsWith('+')) {
        out.push(`<div class="dl add" data-side="n" data-line="${n}"><i></i><i class="dl-c" title="Bình luận dòng này">${n}</i><code>${esc(l)}</code></div>${at('n', n)}`);
        n++;
      } else if (l.startsWith('-')) {
        out.push(`<div class="dl del" data-side="o" data-line="${o}"><i class="dl-c" title="Bình luận dòng này">${o}</i><i></i><code>${esc(l)}</code></div>${at('o', o)}`);
        o++;
      } else if (l.startsWith('\\')) out.push(`<div class="dl meta"><i></i><i></i><code>${esc(l)}</code></div>`);
      else if (l || i < lines.length - 1) {
        out.push(`<div class="dl" data-side="n" data-line="${n}"><i>${o}</i><i class="dl-c" title="Bình luận dòng này">${n}</i><code>${esc(l)}</code></div>${at('n', n)}`);
        o++;
        n++;
      }
    }
    const more = lines.length > MAX ? `<p class="df-note">… còn ${C.fmt(lines.length - MAX)} dòng — xem đầy đủ bằng git trong worktree.</p>` : '';
    return out.join('') + more;
  }
  function fileBody(f, d, cms = []) {
    if (d.hidden || f.hidden) return '<p class="df-note">🔒 Tệp nhạy cảm (.env, khóa, chứng chỉ) — chỉ hiện tên, không hiện nội dung.</p>';
    if (d.binary || f.binary) return '<p class="df-note">Tệp nhị phân — không hiện nội dung.</p>';
    if (!d.text) return '<p class="df-note">Không có thay đổi nội dung (chỉ đổi tên/quyền) hoặc tệp quá lớn.</p>';
    return `<div class="df-lines">${lineHtml(d.text, cms)}</div>${d.truncated ? '<p class="df-note">Diff quá dài — đã cắt bớt.</p>' : ''}`;
  }
  async function openFile(box, t, commit, path) {
    const key = `${t.id}|${commit || ''}|${path}`;
    const body = box.querySelector('.df-body');
    const f = U.sum.get(`${t.id}|${commit || ''}`)?.data?.files.find((x) => x.path === path) || { path };
    let d = U.files.get(key);
    if (!d) {
      body.innerHTML = '<p class="df-note">Đang tải…</p>';
      try {
        d = await C.api(`/api/tasks/${encodeURIComponent(t.id)}/diff?file=${encodeURIComponent(path)}${commit ? `&commit=${encodeURIComponent(commit)}` : ''}`);
        U.files.set(key, d);
      } catch (e) {
        body.innerHTML = `<p class="df-note bad">${esc(e.message)}</p>`;
        return;
      }
    }
    if (box.open) body.innerHTML = fileBody(f, d, cmGet(t.id).filter((c) => c.path === path && (c.commit || '') === (commit || '')));
  }
  const canSend = (t) => !!t && !['running', 'queued'].includes(t.status) && !(t.status === 'paused' && t.pause?.reason === 'plan') && (t.runs || []).some((r) => r.subtasks.some((s) => s.status === 'done' && s.output));
  function barHtml(t) {
    const n = cmGet(t.id).length;
    if (!n) return '<span class="dc-tip">💬 Bấm số dòng bên trái để bình luận — gom lại gửi một lần thành yêu cầu sửa.</span>';
    return `<b>💬 ${n} bình luận chưa gửi</b><span class="grow"></span>${canSend(t) ? '<button type="button" class="btn primary sm" data-dc-send>Gửi thành yêu cầu sửa…</button>' : '<small>Gửi được khi nhiệm vụ không chạy</small>'}<button type="button" class="btn ghost sm" data-dc-clear>Xóa hết</button>`;
  }
  /** Bảng gửi: mỗi bình luận chọn hạng mục nhận sửa (gợi ý theo commit/nhật ký ghi tệp), ghi chú chung, gửi /review. */
  async function sendPanel(box, t) {
    const panel = box.querySelector('[data-dc-panel]');
    const list = cmGet(t.id);
    panel.hidden = false;
    panel.innerHTML = '<p class="df-note">Đang tìm hạng mục đã sửa từng tệp…</p>';
    let owners = {};
    try {
      owners = (await C.api(`/api/tasks/${encodeURIComponent(t.id)}/diff?owners=1`)).owners || {};
    } catch {}
    const multi = (t.runs || []).length > 1;
    const subs = t.runs.flatMap((r) => r.subtasks.filter((s) => s.status === 'done' && s.output && !s.splitTo).map((s) => ({ r, s, v: `${r.department}|${s.id}` })));
    const opt = (c) => {
      const own = owners[c.path] || [];
      // "phòng|S2" từ nhật ký khớp đúng phòng; "S2" từ commit → ưu tiên phòng chạy SAU (liên phòng: Phát triển sửa repo)
      const hit = (x) => own.includes(x.v) || own.includes(x.s.id);
      const pick = subs.find((x) => own.includes(x.v))?.v || [...subs].reverse().find((x) => own.includes(x.s.id))?.v || (subs.length === 1 ? subs[0].v : '');
      return `<select data-dc-sub="${esc(c.id)}" aria-label="Hạng mục nhận sửa"><option value="">— chọn hạng mục —</option>${subs
        .map((x) => `<option value="${esc(x.v)}"${x.v === pick ? ' selected' : ''}>${multi ? `${esc(C.deptName(x.r.department))} · ` : ''}${esc(x.s.id)} · ${esc(C.agentName(x.s.assignee))}${hit(x) ? ' ✓ đã sửa tệp này' : ''}</option>`)
        .join('')}</select>`;
    };
    panel.innerHTML = `<div class="dc-sendbox"><b>Gửi ${list.length} bình luận thành yêu cầu sửa</b>
      <ol class="dc-list">${list.map((c) => `<li><code>${esc(c.path)}:${c.line}${c.side === 'o' ? ' (dòng cũ)' : ''}</code> ${opt(c)}<div class="dc-t">${C.md(c.text)}</div></li>`).join('')}</ol>
      <textarea data-dc-note rows="2" placeholder="Ghi chú chung (tùy chọn) — vd. sửa xong chạy lại npm test" aria-label="Ghi chú chung"></textarea>
      <div class="pb-actions"><button type="button" class="btn primary sm" data-dc-go>✋ Gửi yêu cầu sửa</button><button type="button" class="btn ghost sm" data-dc-back>Thôi</button><small>Mỗi bình luận thành một lỗi cho hạng mục đã chọn → một vòng sửa → reviewer duyệt lại → viết lại báo cáo.</small></div></div>`;
    panel.querySelector('[data-dc-back]').onclick = () => (panel.hidden = true);
    panel.querySelector('[data-dc-go]').onclick = async () => {
      const note = panel.querySelector('[data-dc-note]').value.trim();
      const issues = [];
      for (const c of list) {
        const v = panel.querySelector(`[data-dc-sub="${CSS.escape(c.id)}"]`)?.value;
        if (!v) return C.toast({ level: 'info', title: 'Chọn hạng mục cho mọi bình luận', msg: `${c.path}:${c.line}` });
        const [department, subtask] = v.split('|');
        const ref = `\`${c.path}:${c.line}\`${c.side === 'o' ? ' (dòng đã xóa)' : ''}${c.commit ? ` trong commit ${c.commit.slice(0, 10)}` : ''}`;
        issues.push({ subtask, department: multi ? department : undefined, comment: `${ref} — ${c.text}${c.code ? `\n> ${c.code.slice(0, 300)}` : ''}` });
      }
      if ([note, ...list.map((c) => c.text)].some((x) => window.Director?.hasSecret?.(x))) return C.toast({ level: 'error', title: 'Có vẻ chứa khóa/mật khẩu', msg: 'Xóa bí mật khỏi bình luận trước khi gửi.' });
      try {
        const r = await C.api(`/api/tasks/${encodeURIComponent(t.id)}/review`, { method: 'POST', body: JSON.stringify({ decision: 'reject', note: note || undefined, issues }) });
        if (r?.id) C.S.tasks.set(r.id, r);
        cmSet(t.id, []);
        C.toast({ level: 'info', title: `Đã gửi ${issues.length} bình luận — văn phòng làm một vòng sửa`, msg: t.title });
        panel.hidden = true;
        box.querySelector('[data-dc-bar]').innerHTML = barHtml(C.S.tasks.get(t.id) || t);
        box.querySelectorAll('.dc').forEach((x) => x.remove());
      } catch (e) {
        C.toast({ level: 'error', title: 'Không gửi được', msg: e.message });
      }
    };
  }
  function bindComments(box) {
    // nhiệm vụ / phạm vi commit đọc lúc bấm (ô diff được vẽ lại khi đổi commit, đổi nhiệm vụ)
    let t;
    let commit;
    const refresh = (path) => {
      const det = [...box.querySelectorAll('.df-f')].find((x) => x.dataset.p === path);
      if (det?.open) openFile(det, t, commit, path);
      box.querySelector('[data-dc-bar]').innerHTML = barHtml(C.S.tasks.get(t.id) || t);
    };
    box.addEventListener('click', (e) => {
      t = C.S.tasks.get(box.dataset.dcTask);
      commit = box.dataset.dcCommit || '';
      if (!t || !e.target.closest('.df')) return;
      const g = e.target.closest('.dl-c');
      if (g) {
        const row = g.closest('.dl');
        if (row.nextElementSibling?.classList.contains('dc-new')) return row.nextElementSibling.querySelector('textarea').focus();
        const path = row.closest('.df-f').dataset.p;
        row.insertAdjacentHTML('afterend', `<div class="dc-new"><textarea rows="2" placeholder="Cần sửa gì ở dòng ${row.dataset.line}? (Ctrl+Enter lưu)" aria-label="Bình luận dòng ${row.dataset.line}"></textarea><div class="pb-actions"><button type="button" class="btn primary sm" data-dc-save>Lưu bình luận</button><button type="button" class="btn ghost sm" data-dc-cancel>Hủy</button></div></div>`);
        const ed = row.nextElementSibling;
        const ta = ed.querySelector('textarea');
        ta.focus();
        const save = () => {
          const text = ta.value.trim();
          if (!text) return ta.focus();
          const code = row.querySelector('code')?.textContent.replace(/^[+\- ]/, '').trim() || '';
          const list = cmGet(t.id);
          list.push({ id: Math.random().toString(36).slice(2, 10), path, side: row.dataset.side, line: Number(row.dataset.line), code, text: text.slice(0, 2000), commit: commit || '', at: new Date().toISOString() });
          cmSet(t.id, list.slice(-100));
          ed.remove();
          refresh(path);
        };
        ed.querySelector('[data-dc-save]').onclick = save;
        ed.querySelector('[data-dc-cancel]').onclick = () => ed.remove();
        ta.onkeydown = (ev) => ev.key === 'Enter' && (ev.ctrlKey || ev.metaKey) && (ev.preventDefault(), save());
        return;
      }
      const del = e.target.closest('[data-dc-del]');
      if (del) {
        const list = cmGet(t.id);
        const c = list.find((x) => x.id === del.dataset.dcDel);
        cmSet(t.id, list.filter((x) => x.id !== del.dataset.dcDel));
        if (c) refresh(c.path);
        return;
      }
      if (e.target.closest('[data-dc-clear]')) {
        if (!confirm('Xóa hết bình luận chưa gửi?')) return;
        cmSet(t.id, []);
        box.querySelectorAll('.dc').forEach((x) => x.remove());
        box.querySelector('[data-dc-bar]').innerHTML = barHtml(t);
        return;
      }
      if (e.target.closest('[data-dc-send]')) sendPanel(box, C.S.tasks.get(t.id) || t);
    });
  }
  /** Tab "🧬 Thay đổi" của trang nhiệm vụ. */
  U.diffView = async (box, t, opts = {}) => {
    const commit = U.commit.get(t.id) || '';
    if (!U.sum.has(`${t.id}|${commit}`)) box.innerHTML = '<div class="empty">Đang đọc thay đổi trong git…</div>';
    let s;
    try {
      s = await summary(t, commit, !!opts.force);
    } catch (e) {
      box.innerHTML = `<div class="empty">${esc(e.message)}</div>`;
      return;
    }
    if (!box.isConnected) return;
    const sel = `<select data-df-commit aria-label="Chọn phạm vi thay đổi"><option value="">Toàn bộ nhánh${s.source === 'worktree' ? ' + phần chưa commit' : ''} (${s.commits.length} commit)</option>${s.commits
      .map((c) => `<option value="${esc(c.sha)}"${c.sha === s.commit ? ' selected' : ''}>${esc(short(c.sha))} · ${c.merge ? '⑂ ' : ''}${esc(c.subject.slice(0, 90))}</option>`)
      .join('')}</select>`;
    const where = s.source === 'worktree' ? `worktree <code>${esc(t.workspace || '')}</code>` : 'nhánh trong repo (worktree đã gỡ)';
    box.innerHTML = `<div class="df">
      <div class="dc-bar" data-dc-bar>${barHtml(t)}</div><div data-dc-panel hidden></div>
      <div class="df-head"><span>🌿 <code>${esc(s.branch || '')}</code> · từ <code>${esc(short(s.base))}</code>${s.head ? ` → <code>${esc(short(s.head))}</code>` : ''} · ${where}</span>${!s.commit && s.uncommitted ? `<span class="warn">${s.uncommitted} tệp chưa commit</span>` : ''}</div>
      <div class="df-bar">${sel}<span class="df-tot"><b>${s.totals.files} tệp</b> <span class="add">+${C.fmt(s.totals.add)}</span> <span class="del">−${C.fmt(s.totals.del)}</span>${s.truncated ? ' · danh sách đã cắt' : ''}</span><span class="grow"></span><button type="button" class="btn ghost sm" data-df-all>Mở tất cả</button><button type="button" class="btn ghost sm" data-df-refresh title="Đọc lại từ git">↻</button></div>
      ${
        s.files.length
          ? s.files
              .map((f) => {
                const key = `${t.id}|${s.commit || ''}|${f.path}`;
                return `<details class="df-f" data-p="${esc(f.path)}"${U.fileOpen.has(key) ? ' open' : ''}><summary><span class="df-st st-${f.status === '?' ? 'u' : esc(f.status)}" title="${esc(ST[f.status] || f.status)}">${esc(f.status === '?' ? 'mới' : f.status)}</span><span class="df-p">${f.oldPath ? `<small>${esc(f.oldPath)} →</small> ` : ''}${esc(f.path)}</span><span class="df-n">${f.hidden ? '<small title="Chỉ hiện tên">🔒</small>' : ''}${f.binary ? '<small>nhị phân</small>' : `<span class="add">+${f.add}</span><span class="del">−${f.del}</span>`}</span></summary><div class="df-body"></div></details>`;
              })
              .join('')
          : `<div class="empty">${s.commit ? 'Commit này không đổi tệp nào.' : 'Chưa có thay đổi so với commit gốc.'}</div>`
      }</div>`;
    box.dataset.dcTask = t.id;
    box.dataset.dcCommit = s.commit || '';
    if (!box.dataset.dcBound) {
      box.dataset.dcBound = '1';
      bindComments(box);
    }
    box.querySelector('[data-df-commit]').onchange = (e) => {
      U.commit.set(t.id, e.target.value);
      U.diffView(box, t);
    };
    box.querySelector('[data-df-refresh]').onclick = () => U.diffView(box, t, { force: true });
    box.querySelector('[data-df-all]').onclick = () => $$('.df-f', box).forEach((d) => !d.open && (d.open = true));
    for (const d of $$('.df-f', box)) {
      const key = `${t.id}|${s.commit || ''}|${d.dataset.p}`;
      d.addEventListener('toggle', () => {
        if (d.open) {
          U.fileOpen.add(key);
          openFile(d, t, s.commit, d.dataset.p);
        } else U.fileOpen.delete(key);
      });
      if (d.open) openFile(d, t, s.commit, d.dataset.p);
    }
  };

  U.init = () => {
    C = window.CC;
    document.addEventListener('click', (e) => {
      const lv = e.target.closest?.('[data-lv-toggle]');
      if (lv) return void toggleFeed(lv.closest('.lv'));
      const h = e.target.closest?.('[data-hist]');
      if (h) {
        e.preventDefault();
        toggleHist(h);
      }
    });
  };

  window.UX = U;
})();
