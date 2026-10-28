// Phòng giám đốc & các tiện ích thân thiện: nhân vật người dùng tương tác (E), giao việc riêng cho agent, góp ý,
// tăng ngân sách, trò vui (không ảnh hưởng công việc), bảng điều khiển, hạn mức token, thư viện & khung soạn prompt,
// trợ giúp, hướng dẫn lần đầu, phím tắt. Dùng cầu nối window.CC do app.js cung cấp.
(function () {
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  let C = null; // window.CC
  const D = {};
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
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  const esc = (s) => (C ? C.esc(s) : String(s ?? ''));
  const office = () => C && C.office();

  // ── Nội dung cho vui (tự viết) ───────────────────────────────────────────
  const JOKES = [
    'Sếp biết vì sao lập trình viên thích phòng tối không? Vì ánh sáng thu hút… bug 🐛',
    'Hôm qua em sửa một lỗi, hôm nay nó đẻ ra hai lỗi con. Em gọi đó là "tính năng di truyền".',
    'Code của em chạy được trên máy em. Giờ chỉ cần gửi máy em cho khách là xong 😄',
    'Có 10 loại người: người hiểu nhị phân và người không.',
    'Em không lười đâu sếp, em đang ở chế độ tiết kiệm năng lượng.',
    'Commit cuối ngày của em: "sửa nốt" — commit sáng hôm sau: "sửa nốt cái sửa nốt".',
    'Đừng lo sếp, lỗi này chỉ xuất hiện vào thứ Sáu lúc 17h59 thôi.',
    'Em đặt tên biến là x vì em tin vào sức tưởng tượng của người đọc.',
    'Review code giống đi khám răng: ai cũng biết cần, không ai muốn đi.',
    'Cà phê vào, code ra. Hết cà phê thì ra… comment.',
  ];
  const HIGHFIVE = ['Đập tay nào sếp! 🙌', 'Yeah! Năng lượng lên 100%!', 'Cảm ơn sếp, có động lực hẳn!', 'Bùm! Hết mệt luôn!'];
  const PRAISE = ['Dạ em cảm ơn sếp! 😊', 'Được sếp khen là em làm thêm 2 ticket nữa!', 'Hehe, nhờ cả đội đấy sếp.', 'Em sẽ giữ phong độ ạ! ⭐'];
  const CHEER = ['Cố lên cả phòng! 💪', 'Sắp xong rồi!', 'Team mình đỉnh nhất!', 'Ship thôi anh em!'];
  const FACTS = [
    'Tin vui: hôm nay chưa ai làm vỡ build 🎉',
    'Mẹo: tách việc lớn thành nhiều hạng mục nhỏ giúp agent ghi tệp sớm hơn và tốn ít token hơn.',
    'Mẹo: góp ý 👍/👎 cho agent sẽ được nhắc lại ở các lượt làm việc sau.',
    'Mẹo: nhấp đúp lên sàn để đi tới chỗ đó, khỏi giữ phím.',
    'Mẹo: phím ? mở trợ giúp, N mở form giao việc.',
  ];

  // ── Modal ────────────────────────────────────────────────────────────────
  let openModals = 0;
  function lock(on) {
    const o = office();
    if (o) {
      o.inputLocked = on;
      if (on) o.keys.clear();
    }
  }
  function modal({ title, body, wide, onMount, onClose }) {
    const wrap = document.createElement('div');
    wrap.className = 'modal-wrap';
    wrap.innerHTML = `<div class="modal${wide ? ' wide' : ''}" role="dialog" aria-modal="true" aria-label="${esc(title)}">
      <div class="modal-head"><h2>${title}</h2><button class="btn ghost sm" data-close aria-label="Đóng">✕</button></div>
      <div class="modal-body">${body}</div></div>`;
    document.body.appendChild(wrap);
    openModals++;
    lock(true);
    const prevFocus = document.activeElement;
    const close = () => {
      if (!wrap.isConnected) return;
      wrap.remove();
      openModals = Math.max(0, openModals - 1);
      if (!openModals) lock(false);
      document.removeEventListener('keydown', onKey, true);
      onClose?.();
      if (prevFocus && prevFocus.focus) prevFocus.focus();
    };
    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        close();
      }
    };
    document.addEventListener('keydown', onKey, true);
    wrap.addEventListener('mousedown', (e) => {
      if (e.target === wrap) close();
    });
    $$('[data-close]', wrap).forEach((b) => (b.onclick = close));
    const el = $('.modal', wrap);
    onMount?.(el, close);
    setTimeout(() => ($('textarea', el) || $('input:not([type=checkbox]):not([type=radio])', el) || $('select', el) || $('button:not([data-close])', el))?.focus(), 30);
    return { el, close };
  }
  D.modal = modal;

  // ── Menu tương tác (E) ───────────────────────────────────────────────────
  let menuState = null;
  function closeMenu() {
    const m = $('#imenu');
    if (m) m.hidden = true;
    if (menuState) document.removeEventListener('keydown', menuState.onKey, true);
    menuState = null;
    if (!openModals) lock(false);
  }
  function showMenu(title, items, pos) {
    closeMenu();
    const m = $('#imenu');
    if (!m) return;
    const list = items.filter(Boolean);
    m.innerHTML = `<div class="im-title">${title}</div>${list
      .map(
        (it, i) =>
          `<button class="im-item${it.fun ? ' fun' : ''}" data-i="${i}" ${it.disabled ? 'disabled' : ''} title="${esc(it.hint || '')}"><kbd>${i + 1}</kbd><span>${it.icon || ''} ${esc(it.label)}</span>${it.fun ? '<em>vui</em>' : ''}</button>`,
      )
      .join('')}<div class="im-foot"><kbd>1</kbd>–<kbd>${list.length}</kbd> chọn · <kbd>Esc</kbd> đóng</div>`;
    m.hidden = false;
    const stage = $('#stage').getBoundingClientRect();
    const w = 270;
    const left = Math.max(8, Math.min(stage.width - w - 8, (pos?.left ?? stage.width / 2) - w / 2));
    const top = Math.max(8, Math.min(stage.height - m.offsetHeight - 8, (pos?.top ?? stage.height / 2) - m.offsetHeight - 26));
    m.style.left = `${left}px`;
    m.style.top = `${top}px`;
    lock(true);
    let sel = 0;
    const btns = $$('.im-item', m);
    const focus = () => btns[sel]?.focus();
    const run = (i) => {
      const it = list[i];
      if (!it || it.disabled) return;
      closeMenu();
      it.run();
    };
    btns.forEach((b) => (b.onclick = () => run(Number(b.dataset.i))));
    const onKey = (e) => {
      if (e.key === 'Escape' || e.key.toLowerCase() === 'e') {
        e.preventDefault();
        e.stopPropagation();
        return closeMenu();
      }
      if (/^[1-9]$/.test(e.key)) {
        e.preventDefault();
        e.stopPropagation();
        return run(Number(e.key) - 1);
      }
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 's' || e.key === 'w') {
        e.preventDefault();
        e.stopPropagation();
        sel = (sel + (e.key === 'ArrowDown' || e.key === 's' ? 1 : -1) + btns.length) % btns.length;
        focus();
      }
    };
    menuState = { onKey };
    document.addEventListener('keydown', onKey, true);
    setTimeout(() => {
      focus();
      const off = (e) => {
        if (!m.contains(e.target)) {
          closeMenu();
          document.removeEventListener('mousedown', off, true);
        }
      };
      document.addEventListener('mousedown', off, true);
    }, 0);
  }

  D.near = () => {};

  D.interact = (target, pos) => {
    if (!C) return;
    if (target.type === 'agent') return agentMenu(target.id, pos);
    return spotMenu(target, pos);
  };

  function agentMenu(id, pos) {
    const a = C.S.agents.get(id);
    if (!a) return;
    const st = a.state || { status: 'idle' };
    const worker = C.S.departments.some((d) => d.id === a.department);
    const task = st.taskId ? C.S.tasks.get(st.taskId) : null;
    const o = office();
    showMenu(
      `<b>${esc(a.name)}</b> <small>${esc(C.STATUS_VI[st.status] || st.status)}${st.activity ? ` · ${esc(st.activity.slice(0, 40))}` : ''}</small>`,
      [
        worker
          ? { icon: '📝', label: 'Giao việc riêng', hint: 'Một nhiệm vụ chỉ agent này làm (bỏ qua lập kế hoạch/họp)', run: () => D.assignAgent(id) }
          : { icon: '🧭', label: 'Giao việc tự động (điều phối)', run: () => C.prefillAssign({ mode: 'auto' }) },
        worker && { icon: '💬', label: 'Góp ý / đánh giá', hint: 'Được nhắc lại trong hồ sơ agent ở các lượt sau', run: () => D.feedback(id) },
        task && ['running', 'queued', 'paused'].includes(task.status) && { icon: '💰', label: 'Tăng ngân sách việc đang làm', hint: task.title, run: () => D.raiseBudget(id) },
        { icon: '👀', label: 'Xem hồ sơ & việc đang làm', run: () => C.openAgent(id) },
        { icon: '☕', label: 'Mời cà phê', fun: true, run: () => o.funWith(id, 'coffee') },
        { icon: '🙌', label: 'Đập tay', fun: true, run: () => o.funWith(id, 'highfive', pick(HIGHFIVE)) },
        { icon: '😂', label: 'Nhờ kể chuyện cười', fun: true, run: () => o.funWith(id, 'joke', pick(JOKES)) },
        { icon: '🌟', label: 'Khen một câu', fun: true, run: () => o.funWith(id, 'praise', pick(PRAISE)) },
      ],
      pos,
    );
  }

  function spotMenu(t, pos) {
    const o = office();
    const S = C.S;
    const running = [...S.tasks.values()].filter((x) => x.status === 'running' || x.status === 'queued');
    const meeting = running.find((x) => x.phase === 'discuss' || x.phase === 'finalize');
    const items = {
      'room:dev': () => deptItems('dev'),
      'room:research': () => deptItems('research'),
      'room:meeting': () => meetingItems(),
      'room:meeting-table': () => meetingItems(),
      'room:office': () => [
        { icon: '🧭', label: 'Giao việc tự động (điều phối viên chọn phòng)', run: () => C.prefillAssign({ mode: 'auto' }) },
        { icon: '📋', label: `Nhiệm vụ đang chạy (${running.length})`, run: () => C.setTab('tasks') },
      ],
      'room:pantry': () => [
        { icon: '☕', label: 'Pha một ly cho mình', fun: true, run: () => (o.playerSay('Một ly cà phê đen không đường ☕'), o.effect('coffee', o.player.x, o.player.y)) },
        { icon: '🎉', label: 'Mời cả văn phòng cà phê', fun: true, hint: 'Chỉ agent đang rảnh mới đi', run: () => { const n = o.coffeeParty(); o.playerSay(n ? `Mời ${n} người cà phê!` : 'Mọi người đang bận cả rồi 😅'); } },
      ],
      'room:pantry-sofa': () => [
        { icon: '😴', label: 'Ngả lưng 5 giây', fun: true, run: () => o.playerSay('Zzz… 💤', 5000) },
        { icon: '📰', label: 'Đọc bảng tin', fun: true, run: () => o.playerSay(pick(FACTS), 7000) },
      ],
      'boss:desk': () => [
        { icon: '📊', label: 'Bảng điều khiển', run: () => D.dashboard() },
        { icon: '📝', label: 'Giao việc mới', run: () => C.prefillAssign({}) },
        { icon: '📚', label: 'Thư viện prompt', run: () => D.promptLibrary() },
        { icon: '🔢', label: 'Hạn mức token còn lại', run: () => C.setTab('quota') },
        { icon: '❓', label: 'Trợ giúp & phím tắt', run: () => D.help() },
      ],
      'boss:screen': () => [
        { icon: '📊', label: 'Bảng điều khiển', run: () => D.dashboard() },
        { icon: '🔢', label: 'Hạn mức token còn lại', run: () => C.setTab('quota') },
      ],
      'boss:arcade': () => [{ icon: '🕹', label: 'Chơi "Bắt bug" 15 giây', fun: true, run: () => D.bugGame() }],
      'boss:piano': () => [{ icon: '🎹', label: 'Chơi một đoạn nhạc', fun: true, run: () => playTune() }],
      'boss:sofa': () => [
        { icon: '🍵', label: 'Pha trà tiếp khách', fun: true, run: () => (o.playerSay('Mời cả nhà dùng trà 🍵'), o.effect('hearts', o.player.x, o.player.y)) },
        { icon: '📰', label: 'Đọc bảng tin', fun: true, run: () => o.playerSay(pick(FACTS), 7000) },
      ],
    };
    function deptItems(id) {
      const d = S.departments.find((x) => x.id === id);
      const members = [...S.agents.values()].filter((a) => a.department === id);
      const busy = members.filter((a) => a.state && a.state.status !== 'idle').length;
      return [
        { icon: '📝', label: `Giao việc cho ${d ? d.short : id}`, run: () => C.prefillAssign({ mode: 'department', department: id }) },
        { icon: '👥', label: `Nhân sự phòng (${busy}/${members.length} đang bận)`, run: () => C.setTab('people') },
        { icon: '🎉', label: 'Cổ vũ cả phòng', fun: true, run: () => members.forEach((a, i) => setTimeout(() => o.funWith(a.id, 'cheer', i % 3 === 0 ? pick(CHEER) : undefined), i * 120)) },
      ];
    }
    function meetingItems() {
      return [
        meeting
          ? { icon: '🗣', label: `Xem cuộc họp: ${meeting.title.slice(0, 40)}`, run: () => C.openTask(meeting.id) }
          : { icon: '🗣', label: 'Phòng họp đang trống', disabled: true, run: () => {} },
        { icon: '📋', label: 'Danh sách nhiệm vụ', run: () => C.setTab('tasks') },
      ];
    }
    const list = (items[t.id] || (() => []))();
    if (!list.length) return;
    showMenu(`<b>${t.icon || ''} ${esc(t.label)}</b>`, list, pos);
  }

  // ── Âm nhạc (cho vui) ────────────────────────────────────────────────────
  function playTune() {
    const o = office();
    o.musicAround(o.player.x, o.player.y);
    o.playerSay('🎵 tình tang tính…', 3000);
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const notes = [523.25, 659.25, 783.99, 1046.5, 783.99, 880, 783.99, 659.25];
      notes.forEach((f, i) => {
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.type = 'square';
        osc.frequency.value = f;
        g.gain.setValueAtTime(0.035, ctx.currentTime + i * 0.16);
        g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + i * 0.16 + 0.15);
        osc.connect(g).connect(ctx.destination);
        osc.start(ctx.currentTime + i * 0.16);
        osc.stop(ctx.currentTime + i * 0.16 + 0.16);
      });
      setTimeout(() => ctx.close(), 2000);
    } catch {}
  }

  // ── Trò "Bắt bug" (cho vui) ──────────────────────────────────────────────
  D.bugGame = () => {
    let score = 0;
    let left = 15;
    let timer;
    let mover;
    const best = store.get('bugBest', 0);
    modal({
      title: '🕹 Bắt bug',
      body: `<p class="muted-p">Bấm vào con bug càng nhanh càng tốt trong 15 giây. Chỉ để giải trí — không ảnh hưởng công việc.</p>
        <div class="bug-hud"><span>Điểm: <b id="bg-score">0</b></span><span>Còn: <b id="bg-left">15</b> giây</span><span>Kỷ lục: <b>${best}</b></span></div>
        <div class="bug-arena" id="bg-arena"><button class="bug" id="bg-bug" aria-label="bug">🐞</button></div>`,
      onMount: (el, close) => {
        const arena = $('#bg-arena', el);
        const bug = $('#bg-bug', el);
        const move = () => {
          bug.style.left = `${Math.random() * (arena.clientWidth - 40)}px`;
          bug.style.top = `${Math.random() * (arena.clientHeight - 40)}px`;
          bug.textContent = pick(['🐞', '🐛', '🪲', '🐜']);
        };
        move();
        bug.onclick = () => {
          score++;
          $('#bg-score', el).textContent = score;
          move();
        };
        mover = setInterval(move, 900);
        timer = setInterval(() => {
          left--;
          $('#bg-left', el).textContent = left;
          if (left <= 0) {
            clearInterval(timer);
            clearInterval(mover);
            bug.disabled = true;
            const rec = score > best;
            if (rec) store.set('bugBest', score);
            arena.insertAdjacentHTML('beforeend', `<div class="bug-end">${rec ? '🏆 Kỷ lục mới!' : 'Hết giờ!'} Bắt được ${score} bug.</div>`);
            const o = office();
            o.playerSay(rec ? `Kỷ lục mới: ${score} bug! 🏆` : `Bắt được ${score} bug 🐞`);
            o.effect(rec ? 'confetti' : 'stars', o.player.x, o.player.y);
          }
        }, 1000);
      },
      onClose: () => {
        clearInterval(timer);
        clearInterval(mover);
      },
    });
  };

  // ── Giao việc riêng cho một agent ────────────────────────────────────────
  D.assignAgent = (id) => {
    const a = C.S.agents.get(id);
    if (!a) return;
    const S = C.S;
    const projOpts = `<option value="">— không (thư mục riêng của nhiệm vụ) —</option>${S.projects.map((p) => `<option value="${esc(p.id)}">${esc(p.name)} (${esc(C.CLS_VI[p.classification] || p.classification)})</option>`).join('')}`;
    modal({
      title: `📝 Giao việc riêng cho ${esc(a.name)}`,
      wide: true,
      body: `<div class="ag-head"><img src="${C.avatarUrl(id)}" width="40" height="40" alt=""><div><b>${esc(a.title)}</b><small>@${esc(a.id)} · ${esc(C.deptName(a.department))} · kỹ năng: ${esc((a.skills || []).slice(0, 6).join(', '))}</small></div></div>
        <form class="form" id="ag-form">
          <div class="grid2">
            <label>Trong dự án <small>(tùy chọn)</small><select name="projectId">${projOpts}</select></label>
            <label>Ngân sách token<input name="budgetTokens" type="number" min="1000" step="1000" placeholder="${esc(S.defaults.budgetTokens ?? '')}" /></label>
          </div>
          <label>Tiêu đề <small>(tùy chọn)</small><input name="title" maxlength="90" /></label>
          <div class="prompt-tools" data-mini></div>
          <label>Yêu cầu<textarea name="brief" rows="7" required placeholder="Việc cụ thể cho ${esc(a.name)}: làm gì, ở đâu (tệp/thư mục), xong khi nào (tiêu chí kiểm chứng)…"></textarea></label>
          <div class="prompt-check" data-check></div>
          <label class="check"><input type="checkbox" name="review" ${S.defaults.review !== false ? 'checked' : ''} /> Reviewer của phòng duyệt & cho phép sửa</label>
          <div class="data-route" data-route></div>
          <div class="actions"><button class="btn primary" type="submit">Giao việc</button><button class="btn ghost sm" type="button" data-full>Mở trong form đầy đủ</button><span class="form-msg" data-msg></span></div>
        </form>`,
      onMount: (el, close) => {
        const f = $('#ag-form', el);
        attachPromptTools($('[data-mini]', el), f.brief, true);
        attachChecker(f.brief, $('[data-check]', el), () => (f.projectId.value ? 'project' : 'scratch'));
        const route = () => renderRoute($('[data-route]', el), classificationFor(f.projectId.value), '');
        f.projectId.onchange = route;
        route();
        $('[data-full]', el).onclick = () => {
          close();
          C.prefillAssign({ mode: 'agent', agentId: id, projectId: f.projectId.value, title: f.title.value, brief: f.brief.value });
        };
        f.onsubmit = async (e) => {
          e.preventDefault();
          const msg = $('[data-msg]', el);
          const body = { mode: 'agent', agentId: id, brief: f.brief.value, title: f.title.value || undefined, projectId: f.projectId.value || undefined, options: { review: f.review.checked } };
          if (f.budgetTokens.value) body.options.budgetTokens = Number(f.budgetTokens.value);
          try {
            const t = await C.api('/api/tasks', { method: 'POST', body: JSON.stringify(body) });
            C.S.tasks.set(t.id, t);
            close();
            C.toast({ level: 'info', title: `Đã giao ${t.id} cho ${a.name}`, msg: t.title, taskId: t.id });
            const o = office();
            o.say(id, 'Dạ, em nhận việc! 💪', 4000);
            o.effect('stars', o.agents.get(id)?.x ?? 0, o.agents.get(id)?.y ?? 0);
          } catch (err) {
            msg.className = 'form-msg err';
            msg.textContent = err.message;
          }
        };
      },
    });
  };

  // ── Góp ý ────────────────────────────────────────────────────────────────
  D.feedback = async (id) => {
    const a = C.S.agents.get(id);
    if (!a) return;
    let list = [];
    try {
      list = await C.api(`/api/agents/${id}/feedback`);
    } catch {}
    const recent = [...C.S.tasks.values()].filter((t) => (t.runs || []).some((r) => r.subtasks.some((s) => s.assignee === id))).slice(0, 8);
    const row = (f) => `<li data-f="${esc(f.id)}"><label class="check" title="Bật: đưa vào hồ sơ agent ở các lượt sau"><input type="checkbox" ${f.active ? 'checked' : ''} /></label><span>${f.rating === 'up' ? '👍 ' : f.rating === 'down' ? '👎 ' : ''}${esc(f.text)}<small>${esc(new Date(f.at).toLocaleString('vi-VN'))}${f.taskId ? ` · ${esc(f.taskId)}` : ''}</small></span><button class="btn ghost sm danger" data-del title="Xóa">✕</button></li>`;
    modal({
      title: `💬 Góp ý cho ${esc(a.name)}`,
      body: `<p class="muted-p">Góp ý <b>đang bật</b> (tối đa 5 góp ý mới nhất) được đưa vào hồ sơ của ${esc(a.name)} ở các lượt làm việc sau — hãy viết cụ thể, ví dụ "luôn chạy test trước khi báo xong".</p>
        <form class="form" id="fb-form">
          <div class="rate"><label><input type="radio" name="rating" value="up" /> 👍 Làm tốt</label><label><input type="radio" name="rating" value="down" /> 👎 Chưa đạt</label><label><input type="radio" name="rating" value="" checked /> Không đánh giá</label></div>
          <label>Góp ý<textarea name="text" rows="3" maxlength="1000" placeholder="Điều muốn ${esc(a.name)} giữ hoặc thay đổi ở các lần sau…"></textarea></label>
          ${recent.length ? `<label>Gắn với nhiệm vụ <small>(tùy chọn)</small><select name="taskId"><option value="">—</option>${recent.map((t) => `<option value="${esc(t.id)}">${esc(t.id)} · ${esc(t.title.slice(0, 50))}</option>`).join('')}</select></label>` : ''}
          <div class="actions"><button class="btn primary sm" type="submit">Gửi góp ý</button><span class="form-msg" data-msg></span></div>
        </form>
        <h3 class="mh3">Đã góp ý (${list.length})</h3>
        <ul class="fb-list" id="fb-list">${list.map(row).join('') || '<li class="empty">Chưa có góp ý.</li>'}</ul>`,
      onMount: (el, close) => {
        const f = $('#fb-form', el);
        const bindList = () =>
          $$('#fb-list [data-f]', el).forEach((li) => {
            const fid = li.dataset.f;
            $('input', li).onchange = (e) => C.api(`/api/agents/${id}/feedback/${fid}`, { method: 'POST', body: JSON.stringify({ active: e.target.checked }) }).catch((err) => C.toast({ level: 'error', title: 'Không cập nhật được', msg: err.message }));
            $('[data-del]', li).onclick = () => C.api(`/api/agents/${id}/feedback/${fid}`, { method: 'DELETE' }).then(() => li.remove());
          });
        bindList();
        f.onsubmit = async (e) => {
          e.preventDefault();
          const rating = f.rating.value || undefined;
          try {
            const item = await C.api(`/api/agents/${id}/feedback`, { method: 'POST', body: JSON.stringify({ text: f.text.value, rating, taskId: f.taskId?.value || undefined }) });
            const ul = $('#fb-list', el);
            if ($('.empty', ul)) ul.innerHTML = '';
            ul.insertAdjacentHTML('afterbegin', row(item));
            bindList();
            f.text.value = '';
            const o = office();
            o.say(id, rating === 'down' ? 'Dạ em ghi nhận, lần sau em làm kỹ hơn ạ.' : 'Dạ em cảm ơn sếp, em ghi nhớ ạ!', 5000);
            o.effect(rating === 'down' ? 'coffee' : 'hearts', o.agents.get(id)?.x ?? 0, o.agents.get(id)?.y ?? 0);
            $('[data-msg]', el).className = 'form-msg ok';
            $('[data-msg]', el).textContent = 'Đã lưu — áp dụng từ lượt làm việc sau';
          } catch (err) {
            $('[data-msg]', el).className = 'form-msg err';
            $('[data-msg]', el).textContent = err.message;
          }
        };
      },
    });
  };

  // ── Tăng ngân sách việc agent đang làm ───────────────────────────────────
  D.raiseBudget = (id) => {
    const a = C.S.agents.get(id);
    const tid = a?.state?.taskId;
    const t = tid ? C.S.tasks.get(tid) : null;
    if (!t) return C.toast({ level: 'info', title: `${a ? a.name : id} không làm nhiệm vụ nào`, msg: 'Chỉ tăng được ngân sách của việc đang chạy/tạm dừng' });
    const budget = t.options?.budgetTokens || 0;
    const used = C.total(t.usage);
    modal({
      title: '💰 Tăng ngân sách',
      body: `<p><b>${esc(t.title)}</b> <small>${esc(t.id)}</small></p>
        <div class="budget"><div class="bm-bar"><i style="width:${Math.min(100, budget ? Math.round((used / budget) * 100) : 0)}%"></i></div><span>${C.fmt(used)} / ${C.fmt(budget)} token · ${t.options?.budgetMode === 'pause' ? 'dừng khi chạm trần' : 'chạy tới khi hoàn thành'}</span></div>
        <div class="pb-actions" style="margin-top:10px">
          <button class="btn primary sm" data-add="${Math.max(100000, Math.round(budget * 0.5))}">+50% (${C.fmt(Math.max(100000, Math.round(budget * 0.5)))})</button>
          <button class="btn ghost sm" data-add="1000000">+1M</button>
          <button class="btn ghost sm" data-mode="complete">Chạy tới khi xong (không dừng)</button>
          ${t.status === 'paused' ? '<button class="btn ghost sm" data-resume>▶ Tăng 50% & tiếp tục</button>' : ''}
        </div><span class="form-msg" data-msg></span>`,
      onMount: (el, close) => {
        const go = async (path, body, okMsg) => {
          try {
            const r = await C.api(path, { method: 'POST', body: JSON.stringify(body) });
            if (r && r.id) C.S.tasks.set(r.id, r);
            close();
            C.toast({ level: 'info', title: okMsg, msg: t.title, taskId: t.id });
            office().say(id, 'Cảm ơn sếp! Có thêm "nhiên liệu" rồi ⛽', 4000);
          } catch (err) {
            $('[data-msg]', el).className = 'form-msg err';
            $('[data-msg]', el).textContent = err.message;
          }
        };
        $$('[data-add]', el).forEach((b) => (b.onclick = () => go(`/api/tasks/${t.id}/budget`, { addBudget: Number(b.dataset.add) }, `Đã tăng ngân sách +${C.fmt(Number(b.dataset.add))}`)));
        $$('[data-mode]', el).forEach((b) => (b.onclick = () => go(`/api/tasks/${t.id}/budget`, { budgetMode: 'complete' }, 'Đã chuyển sang chạy tới khi xong')));
        $$('[data-resume]', el).forEach((b) => (b.onclick = () => go(`/api/tasks/${t.id}/resume`, { addBudget: Math.max(100000, Math.round(budget * 0.5)) }, 'Đã tăng ngân sách & tiếp tục')));
      },
    });
  };

  // ── Hạn mức token còn lại ────────────────────────────────────────────────
  let quotaTimer = null;
  function parseLimits(h) {
    const groups = {};
    for (const [k, v] of Object.entries(h || {})) {
      const m = /^x-ratelimit-(limit|remaining|reset)-(tokens|requests)(?:-(minute|day|hour|second))?$/.exec(k) || /^(?:x-)?ratelimit-(limit|remaining|reset)()()$/.exec(k);
      if (!m) continue;
      const key = `${m[2] || 'chung'}|${m[3] || 'cửa sổ'}`;
      (groups[key] ??= {})[m[1]] = v;
    }
    const kindVi = { tokens: 'Token', requests: 'Yêu cầu', chung: 'Giới hạn' };
    const winVi = { minute: '/phút', day: '/ngày', hour: '/giờ', second: '/giây', 'cửa sổ': '' };
    return Object.entries(groups).map(([key, g]) => {
      const [kind, win] = key.split('|');
      const lim = Number(g.limit);
      const rem = Number(g.remaining);
      const pct = lim > 0 && Number.isFinite(rem) ? Math.round((rem / lim) * 100) : null;
      return { label: `${kindVi[kind] || kind}${winVi[win] ?? ''}`, limit: g.limit, remaining: g.remaining, reset: g.reset, pct };
    });
  }
  function meter(pct, text) {
    const cls = pct === null ? '' : pct <= 10 ? 'over' : pct <= 30 ? 'warn' : '';
    return `<div class="budget ${cls}"><div class="bm-bar"><i style="width:${pct === null ? 0 : Math.max(2, 100 - pct)}%"></i></div><span>${text}</span></div>`;
  }
  D.renderQuota = async () => {
    const box = $('#quota');
    if (!box) return;
    if (!box.innerHTML) box.innerHTML = '<div class="empty">Đang đọc hạn mức…</div>';
    let q;
    try {
      q = await C.api('/api/quota');
    } catch (e) {
      box.innerHTML = `<div class="empty">Không tải được: ${esc(e.message)}</div>`;
      return;
    }
    const rows = q.runtimes
      .filter((r) => r.id !== 'mock' && (r.inOrder || r.usedToday || r.keySet || r.models.some((m) => m.usedToday || m.rateLimit)))
      .sort((a, b) => (b.inOrder - a.inOrder) || (q.order.indexOf(a.id) - q.order.indexOf(b.id)));
    const hidden = q.runtimes.filter((r) => r.id !== 'mock' && !rows.includes(r));
    const card = (r) => {
      const blocked = r.health?.until && new Date(r.health.until) > new Date() ? `<span class="status failed" title="${esc(r.health.reason || '')}">tạm ngừng tới ${esc(new Date(r.health.until).toLocaleTimeString('vi-VN'))}</span>` : '';
      const head = `<div class="q-head"><b>${esc(r.label || r.id)}</b><code>${esc(r.id)}</code>${r.disabled ? '<span class="status cancelled">đã tắt</span>' : r.inOrder ? `<span class="status done">thứ tự #${q.order.indexOf(r.id) + 1}</span>` : '<span class="status pending">không trong thứ tự</span>'}<span class="cls ${r.local ? 'public' : ''}">${r.local ? 'cục bộ' : 'gửi ra ngoài'}</span>${r.keyEnv ? `<span class="q-key" title="Biến môi trường chứa khóa — CCoding không hiển thị giá trị">${r.keySet ? '🔑' : '⚠️'} ${esc(r.keyEnv)} ${r.keySet ? 'đã đặt' : 'CHƯA đặt'}</span>` : ''}${blocked}</div>`;
      const day = r.dailyTokenLimit ? meter(Math.round((r.remaining / r.dailyTokenLimit) * 100), `Hôm nay ${C.fmt(r.usedToday)} / ${C.fmt(r.dailyTokenLimit)} token · còn <b>${C.fmt(r.remaining)}</b>`) : `<p class="q-note">Hôm nay đã dùng <b>${C.fmt(r.usedToday)}</b> token (CCoding đếm)${r.local ? ' — chạy cục bộ, không giới hạn theo nhà cung cấp' : ' · chưa khai báo hạn mức/ngày (dailyTokenLimit)'}</p>`;
      const models = r.models
        .filter((m) => m.usedToday || m.dailyTokenLimit || m.rateLimit || m.health)
        .map((m) => {
          const lim = m.rateLimit ? parseLimits(m.rateLimit.headers) : [];
          const mb = m.health?.until && new Date(m.health.until) > new Date() ? ` <span class="status failed">tạm ngừng tới ${esc(new Date(m.health.until).toLocaleTimeString('vi-VN'))}</span>` : '';
          return `<div class="q-model"><div><code>${esc(m.model)}</code>${m.alias ? ` <small>(${esc(m.alias)})</small>` : ''}${mb}<small> · hôm nay ${C.fmt(m.usedToday)} token</small></div>
            ${m.dailyTokenLimit ? meter(Math.round((m.remaining / m.dailyTokenLimit) * 100), `${C.fmt(m.usedToday)} / ${C.fmt(m.dailyTokenLimit)} · còn ${C.fmt(m.remaining)}`) : ''}
            ${lim.map((l) => meter(l.pct, `${esc(l.label)}: còn <b>${esc(l.remaining ?? '?')}</b>${l.limit ? ` / ${esc(l.limit)}` : ''}${l.reset ? ` · đặt lại ${esc(l.reset)}` : ''}`)).join('')}
            ${m.rateLimit ? `<small class="q-note">theo nhà cung cấp lúc ${esc(new Date(m.rateLimit.at).toLocaleTimeString('vi-VN'))} (HTTP ${m.rateLimit.status})</small>` : ''}</div>`;
        })
        .join('');
      const none = r.tracksLimits ? 'Chưa có lượt gọi nào hôm nay — số còn lại theo nhà cung cấp hiện sau lượt gọi đầu tiên.' : r.local ? 'Chạy trên máy — không có hạn mức của nhà cung cấp.' : 'Runtime dạng CLI — nhà cung cấp không trả số còn lại qua CCoding; xem trong ứng dụng/tài khoản của họ.';
      return `<div class="card q-card">${head}${day}${models || `<p class="q-note">${none}</p>`}</div>`;
    };
    box.innerHTML = `<div class="card-head"><h2>🔢 Hạn mức & token còn lại</h2><button class="btn ghost sm" id="q-refresh">Làm mới</button></div>
      <p class="muted-p">Hôm nay toàn văn phòng: <b>${C.fmt(C.total(q.today))}</b> token · ${q.today.calls || 0} lượt. Số "còn lại" lấy từ <code>dailyTokenLimit</code> trong cấu hình và header giới hạn nhà cung cấp trả về ở lượt gọi gần nhất. Khóa API không bao giờ hiển thị.</p>
      ${rows.map(card).join('') || '<div class="empty">Chưa có runtime nào đang dùng.</div>'}
      ${hidden.length ? `<details><summary class="muted-p">Runtime khác (${hidden.length})</summary>${hidden.map(card).join('')}</details>` : ''}`;
    $('#q-refresh').onclick = () => D.renderQuota();
    clearTimeout(quotaTimer);
    quotaTimer = setTimeout(() => C.S.tab === 'quota' && D.renderQuota(), 15000);
  };

  // ── Bảng điều khiển (bàn giám đốc) ───────────────────────────────────────
  D.dashboard = async () => {
    let q = null;
    try {
      q = await C.api('/api/quota');
    } catch {}
    const S = C.S;
    const tasks = [...S.tasks.values()];
    const running = tasks.filter((t) => t.status === 'running' || t.status === 'queued');
    const attention = tasks.filter((t) => t.attention || t.status === 'paused' || t.status === 'failed').slice(0, 8);
    const busy = [...S.agents.values()].filter((a) => a.state && a.state.status !== 'idle');
    const tRow = (t) => {
      const b = t.options?.budgetTokens || 0;
      const u = C.total(t.usage);
      return `<li><a data-task="${esc(t.id)}">${esc(t.title.slice(0, 60))}</a><span class="status ${t.status}">${esc(C.TASK_VI[t.status] || t.status)}</span>${t.attention ? '<span class="status attention">⚠ cần xem</span>' : ''}<small>${esc(t.phase || '')} · ${C.fmt(u)}${b ? ` / ${C.fmt(b)}` : ''} token</small></li>`;
    };
    const order = q ? q.runtimes.filter((r) => r.inOrder && !r.disabled) : [];
    modal({
      title: '📊 Bảng điều khiển của giám đốc',
      wide: true,
      body: `<div class="stats" style="grid-template-columns:repeat(4,1fr)">
          <div class="stat"><span>Token hôm nay</span><b>${q ? C.fmt(C.total(q.today)) : '—'}</b></div>
          <div class="stat"><span>Đang chạy</span><b>${running.length}</b></div>
          <div class="stat"><span>Agent đang bận</span><b>${busy.length}/${S.agents.size}</b></div>
          <div class="stat"><span>Cần xem</span><b>${attention.length}</b></div></div>
        <h3 class="mh3">Đang chạy</h3><ul class="dash-list">${running.map(tRow).join('') || '<li class="empty">Không có việc đang chạy.</li>'}</ul>
        <h3 class="mh3">Cần bạn quyết định</h3><ul class="dash-list">${attention.map(tRow).join('') || '<li class="empty">Không có gì cần xem 🎉</li>'}</ul>
        <h3 class="mh3">Tài nguyên theo thứ tự chạy</h3><ul class="dash-list">${order.map((r) => `<li><b>${esc(r.label || r.id)}</b><small>hôm nay ${C.fmt(r.usedToday)} token${r.dailyTokenLimit ? ` · còn ${C.fmt(r.remaining)}` : ''}${r.keyEnv && !r.keySet ? ' · ⚠️ chưa đặt khóa' : ''}${r.health?.until && new Date(r.health.until) > new Date() ? ` · tạm ngừng tới ${esc(new Date(r.health.until).toLocaleTimeString('vi-VN'))}` : ''}</small></li>`).join('') || '<li class="empty">—</li>'}</ul>
        <div class="pb-actions"><button class="btn primary sm" data-go="assign">📝 Giao việc mới</button><button class="btn ghost sm" data-go="quota">🔢 Hạn mức chi tiết</button><button class="btn ghost sm" data-go="kpi">📈 KPI</button><button class="btn ghost sm" data-go="prompts">📚 Thư viện prompt</button></div>`,
      onMount: (el, close) => {
        $$('[data-task]', el).forEach((a) => (a.onclick = () => (close(), C.openTask(a.dataset.task))));
        $$('[data-go]', el).forEach(
          (b) =>
            (b.onclick = () => {
              close();
              if (b.dataset.go === 'prompts') D.promptLibrary();
              else if (b.dataset.go === 'assign') C.prefillAssign({});
              else C.setTab(b.dataset.go);
            }),
        );
      },
    });
  };

  async function refreshScreen() {
    const o = office();
    if (!o || !C) return;
    const tasks = [...C.S.tasks.values()];
    const running = tasks.filter((t) => t.status === 'running' || t.status === 'queued').length;
    const att = tasks.filter((t) => t.attention || t.status === 'paused').length;
    let today = null;
    try {
      today = (await C.api('/api/quota')).today;
    } catch {}
    o.setDashboard(today ? `Hôm nay ${C.fmt(C.total(today))} token` : 'Bảng điều khiển', `${running} chạy · ${att} cần xem`);
  }

  // ── Prompt: thư viện, khung soạn, kiểm tra, luồng dữ liệu ───────────────
  const BUILTIN = [
    {
      id: 'b-feature', title: 'Tính năng mới trong repo', tags: ['dev'], builtin: true,
      body: `## Mục tiêu\n<tính năng cần thêm, cho ai dùng>\n\n## Bối cảnh\n- Repo/thư mục: <đường dẫn>\n- Phần liên quan: <route/màn hình/bảng>\n\n## Phạm vi\n- Làm: <…>\n- KHÔNG làm: <…>\n\n## Tiêu chí hoàn thành\n- [ ] <hành vi kiểm chứng được>\n- [ ] Test/typecheck đạt (<lệnh>)\n\n## Ràng buộc\n- Giữ nguyên stack & quy ước repo; không đưa dữ liệu thật vào seed/test\n\n## Đầu ra mong muốn\nCode + test + ghi chú bàn giao (tệp đã sửa, lệnh đã chạy)`,
    },
    {
      id: 'b-bug', title: 'Sửa lỗi', tags: ['dev'], builtin: true,
      body: `## Lỗi\n<mô tả ngắn>\n\n## Cách tái hiện\n1. <bước>\n2. <bước>\n- Kỳ vọng: <…> · Thực tế: <…>\n\n## Phạm vi\n- Chỉ sửa nguyên nhân gốc, thêm test hồi quy\n\n## Tiêu chí hoàn thành\n- [ ] Tái hiện không còn lỗi\n- [ ] Test mới đỏ trước khi sửa, xanh sau khi sửa\n- [ ] Không phát sinh test đỏ mới`,
    },
    {
      id: 'b-review', title: 'Review code / thiết kế', tags: ['dev'], builtin: true,
      body: `## Cần review\n<nhánh/tệp/PR hoặc tài liệu>\n\n## Trọng tâm\n- Đúng/sai nghiệp vụ, bảo mật, hiệu năng, dữ liệu\n\n## Đầu ra mong muốn\nDanh sách vấn đề theo mức (blocker/major/minor), mỗi mục có vị trí + đề xuất sửa`,
    },
    {
      id: 'b-research', title: 'Tổng quan tài liệu / nghiên cứu', tags: ['research'], builtin: true,
      body: `## Câu hỏi nghiên cứu\n<RQ1, RQ2>\n\n## Phạm vi nguồn\n- Năm: <từ…> · loại: bài báo/tiêu chuẩn/văn bản luật\n\n## Tiêu chí hoàn thành\n- [ ] Mỗi khẳng định có nguồn kiểm chứng (DOI/URL)\n- [ ] Bảng so sánh + khoảng trống nghiên cứu\n\n## Đầu ra mong muốn\nBáo cáo Markdown + danh mục tài liệu (.bib)`,
    },
    {
      id: 'b-doc', title: 'Tài liệu kỹ thuật / runbook', tags: ['dev', 'doc'], builtin: true,
      body: `## Tài liệu cần viết\n<README/runbook/ADR/hướng dẫn>\n\n## Người đọc\n<ai đọc, trình độ>\n\n## Nội dung bắt buộc\n- <mục 1>\n- <mục 2>\n\n## Tiêu chí hoàn thành\n- [ ] Làm theo được từng bước, có lệnh cụ thể\n- [ ] Không chứa mật khẩu/khóa/dữ liệu thật`,
    },
  ];

  function classificationFor(projectId) {
    const p = projectId ? C.S.projects.find((x) => x.id === projectId) : null;
    return p ? p.classification : C.S.defaultClassification || 'internal';
  }
  function renderRoute(el, cls, runtime) {
    if (!el) return;
    // runtime chỉ định trong form → chỉ runtime đó; không thì các runtime trong thứ tự chạy (runtime.order)
    const sel = runtime ?? $('#task-form [name=runtime]')?.value;
    const rts = (C.S.runtimes || []).filter((r) => r.id !== 'mock' && r.allowed && r.allowed[cls] && (sel ? r.id === sel : r.inOrder !== false));
    const ok = rts.filter((r) => r.ok);
    el.innerHTML = `🔐 Dữ liệu <span class="cls ${esc(cls)}">${esc(C.CLS_VI[cls] || cls)}</span> ${
      ok.length
        ? `có thể được xử lý bởi: ${ok.map((r) => `<span class="rt ${r.local ? 'local' : 'out'}" title="${r.local ? 'Chạy trên máy — dữ liệu không rời máy' : 'Gửi tới nhà cung cấp bên ngoài (đã che bí mật/PII)'}">${esc(r.label || r.id)}${r.local ? ' · cục bộ' : ' · ra ngoài'}</span>`).join(' ')}`
        : '<b style="color:var(--warn)">— không có runtime nào được phép & sẵn sàng cho nhãn này; nhiệm vụ sẽ chờ tài nguyên</b>'
    }`;
  }
  D.formChanged = () => {
    const f = $('#task-form');
    if (!f || !C) return;
    const mode = f.mode.value;
    const pid = mode === 'project' ? f.projectId.value : mode === 'agent' ? f.agentProject.value : '';
    renderRoute($('#data-route'), classificationFor(pid));
  };

  const CHECKS = [
    { key: 'goal', label: 'Mục tiêu', re: /(mục tiêu|cần|muốn|xây|thêm|sửa|viết|thiết kế|phân tích|tạo|triển khai|đánh giá|tổng hợp|goal)/i },
    { key: 'scope', label: 'Phạm vi', re: /(phạm vi|chỉ |không làm|ngoài phạm vi|trong (thư mục|tệp|repo)|scope|tệp |file |route|màn hình|module)/i },
    { key: 'done', label: 'Tiêu chí xong', re: /(tiêu chí|hoàn thành khi|xong khi|kiểm chứng|chấp nhận|\[ \]|acceptance|test (đạt|xanh)|đạt yêu cầu)/i },
    { key: 'output', label: 'Đầu ra', re: /(đầu ra|bàn giao|sản phẩm|báo cáo|tài liệu|định dạng|markdown|\.md\b|bảng|output|deliverable)/i },
    { key: 'limits', label: 'Ràng buộc', re: /(ràng buộc|không được|giữ nguyên|stack|công nghệ|hạn chót|deadline|ngân sách|dữ liệu thật|bảo mật|tuân thủ)/i },
  ];
  const SECRET = /(sk-[a-z0-9_-]{12,}|gsk_[a-z0-9]{12,}|csk-[a-z0-9]{12,}|nvapi-[a-z0-9_-]{12,}|AKIA[0-9A-Z]{16}|-----BEGIN [A-Z ]*PRIVATE KEY|password\s*[:=]\s*\S{4,}|mật khẩu\s*[:=]\s*\S{4,})/i;
  function attachChecker(textarea, out, ctxFn) {
    if (!textarea || !out) return;
    const run = () => {
      const v = textarea.value.trim();
      if (!v) {
        out.innerHTML = '<small>💡 Gợi ý: nêu mục tiêu, phạm vi, tiêu chí hoàn thành và đầu ra mong muốn — hoặc bấm 🧱 Soạn theo khung.</small>';
        return;
      }
      const res = CHECKS.map((c) => ({ ...c, ok: c.re.test(v) }));
      const score = res.filter((r) => r.ok).length;
      const warn = [];
      if (v.length < 60) warn.push('yêu cầu khá ngắn — agent dễ đoán sai ý');
      if (SECRET.test(v)) warn.push('⛔ có vẻ chứa khóa/mật khẩu — xóa trước khi giao (đừng dán bí mật vào yêu cầu)');
      if (ctxFn && ctxFn() === 'project' && !/(\/|\\|\.(ts|js|py|cs|java|go|sql|md|json)\b|route|màn hình|bảng)/i.test(v)) warn.push('việc trong dự án: nên ghi tệp/route/màn hình liên quan');
      out.innerHTML = `<span class="pc-score ${score >= 4 ? 'ok' : score >= 2 ? 'mid' : 'low'}">Độ rõ ${score}/${CHECKS.length}</span>${res.map((r) => `<span class="pc ${r.ok ? 'ok' : ''}">${r.ok ? '✓' : '○'} ${r.label}</span>`).join('')}${warn.map((w) => `<div class="pc-warn">⚠ ${esc(w)}</div>`).join('')}`;
    };
    let t;
    textarea.addEventListener('input', () => {
      clearTimeout(t);
      t = setTimeout(run, 250);
    });
    run();
  }

  function insertText(textarea, text, mode = 'replace') {
    if (mode === 'append' && textarea.value.trim()) textarea.value = `${textarea.value.trimEnd()}\n\n${text}`;
    else textarea.value = text;
    textarea.dispatchEvent(new Event('input'));
    textarea.focus();
  }

  function attachPromptTools(box, textarea, mini) {
    if (!box || !textarea) return;
    box.innerHTML = `<button type="button" class="btn ghost sm" data-pt="lib" title="Chèn prompt đã lưu hoặc mẫu có sẵn">📚 Thư viện prompt</button><button type="button" class="btn ghost sm" data-pt="build" title="Soạn yêu cầu theo các mục: mục tiêu, phạm vi, tiêu chí…">🧱 Soạn theo khung</button>${mini ? '' : '<button type="button" class="btn ghost sm" data-pt="save" title="Lưu nội dung đang soạn vào thư viện">💾 Lưu làm prompt</button>'}`;
    $('[data-pt=lib]', box).onclick = () => D.promptLibrary({ textarea });
    $('[data-pt=build]', box).onclick = () => D.promptBuilder(textarea);
    const save = $('[data-pt=save]', box);
    if (save) save.onclick = () => D.editPrompt({ body: textarea.value, title: $('#task-form').title.value || '' });
  }

  D.promptBuilder = (textarea) => {
    modal({
      title: '🧱 Soạn yêu cầu theo khung',
      wide: true,
      body: `<p class="muted-p">Điền những mục bạn biết — mục để trống sẽ bỏ qua. Kết quả là Markdown chèn vào ô Yêu cầu.</p>
        <form class="form" id="pb-form">
          <label>Mục tiêu <small>(làm gì, cho ai, vì sao)</small><textarea name="goal" rows="2"></textarea></label>
          <label>Bối cảnh <small>(repo/thư mục, hệ thống, dữ liệu liên quan)</small><textarea name="ctx" rows="2"></textarea></label>
          <div class="grid2"><label>Phạm vi — làm<textarea name="inScope" rows="2"></textarea></label><label>Phạm vi — KHÔNG làm<textarea name="outScope" rows="2"></textarea></label></div>
          <label>Tiêu chí hoàn thành <small>(mỗi dòng một tiêu chí kiểm chứng được)</small><textarea name="done" rows="3" placeholder="Test xxx đạt&#10;API trả 403 khi…"></textarea></label>
          <label>Ràng buộc <small>(công nghệ, dữ liệu, thời hạn)</small><textarea name="limits" rows="2"></textarea></label>
          <label>Đầu ra mong muốn<input name="output" placeholder="vd. code + test + ghi chú bàn giao; báo cáo .md" /></label>
          <div class="actions"><button class="btn primary sm" type="submit">Chèn vào yêu cầu</button><label class="check"><input type="checkbox" name="append" /> thêm vào cuối (giữ nội dung đang có)</label></div>
        </form>`,
      onMount: (el, close) => {
        const f = $('#pb-form', el);
        f.onsubmit = (e) => {
          e.preventDefault();
          const v = (k) => f[k].value.trim();
          const lines = (k) => v(k).split('\n').map((x) => x.trim()).filter(Boolean);
          const parts = [];
          if (v('goal')) parts.push(`## Mục tiêu\n${v('goal')}`);
          if (v('ctx')) parts.push(`## Bối cảnh\n${v('ctx')}`);
          if (v('inScope') || v('outScope')) parts.push(`## Phạm vi\n${v('inScope') ? `- Làm: ${v('inScope')}\n` : ''}${v('outScope') ? `- KHÔNG làm: ${v('outScope')}` : ''}`.trim());
          if (lines('done').length) parts.push(`## Tiêu chí hoàn thành\n${lines('done').map((x) => `- [ ] ${x.replace(/^[-*]\s*(\[ \]\s*)?/, '')}`).join('\n')}`);
          if (v('limits')) parts.push(`## Ràng buộc\n${v('limits')}`);
          if (v('output')) parts.push(`## Đầu ra mong muốn\n${v('output')}`);
          if (!parts.length) return close();
          insertText(textarea, parts.join('\n\n'), f.append.checked ? 'append' : 'replace');
          close();
        };
      },
    });
  };

  D.editPrompt = (p = {}, after) => {
    const S = C.S;
    const workers = [...S.agents.values()].filter((a) => S.departments.some((d) => d.id === a.department));
    modal({
      title: p.id && !p.builtin ? '✏️ Sửa prompt' : '💾 Lưu prompt vào thư viện',
      wide: true,
      body: `<form class="form" id="pe-form">
          <div class="grid2"><label>Tiêu đề<input name="title" required maxlength="120" value="${esc(p.title || '')}" /></label><label>Nhãn <small>(cách nhau bằng dấu phẩy)</small><input name="tags" value="${esc((p.tags || []).join(', '))}" placeholder="dev, nd57" /></label></div>
          <div class="grid2"><label>Khi chèn, chọn chế độ<select name="mode"><option value="">— giữ nguyên —</option>${Object.entries(C.MODE_VI).map(([k, v]) => `<option value="${k}" ${p.mode === k ? 'selected' : ''}>${esc(v)}</option>`).join('')}</select></label>
          <label>Agent <small>(chế độ Giao riêng)</small><select name="agentId"><option value="">—</option>${workers.map((a) => `<option value="${esc(a.id)}" ${p.agentId === a.id ? 'selected' : ''}>${esc(a.name)}</option>`).join('')}</select></label></div>
          <label>Nội dung<textarea name="body" rows="10" required>${esc(p.body || '')}</textarea></label>
          <div class="prompt-check" data-check></div>
          <div class="actions"><button class="btn primary sm" type="submit">Lưu</button><span class="form-msg" data-msg></span></div></form>`,
      onMount: (el, close) => {
        const f = $('#pe-form', el);
        attachChecker(f.body, $('[data-check]', el));
        f.onsubmit = async (e) => {
          e.preventDefault();
          const body = { id: p.builtin ? undefined : p.id, title: f.title.value, body: f.body.value, tags: f.tags.value.split(',').map((x) => x.trim()).filter(Boolean), mode: f.mode.value || undefined, agentId: f.agentId.value || undefined };
          try {
            await C.api('/api/prompts', { method: 'POST', body: JSON.stringify(body) });
            close();
            C.toast({ level: 'info', title: 'Đã lưu prompt', msg: body.title });
            after?.();
          } catch (err) {
            $('[data-msg]', el).className = 'form-msg err';
            $('[data-msg]', el).textContent = err.message;
          }
        };
      },
    });
  };

  D.promptLibrary = async (opts = {}) => {
    const textarea = opts.textarea || $('#task-form [name=brief]');
    let saved = [];
    try {
      saved = await C.api('/api/prompts');
    } catch {}
    const all = () => [...saved, ...BUILTIN];
    const item = (p) => `<li data-p="${esc(p.id)}"><div class="pl-top"><b>${esc(p.title)}</b>${p.builtin ? '<span class="cls">mẫu có sẵn</span>' : `<small>dùng ${p.uses || 0} lần</small>`}${(p.tags || []).map((t) => `<span class="tag">${esc(t)}</span>`).join('')}${p.mode ? `<span class="tag">${esc(C.MODE_VI[p.mode] || p.mode)}${p.agentId ? ` · ${esc(C.agentName(p.agentId))}` : ''}</span>` : ''}</div>
        <pre class="pl-body">${esc(p.body.slice(0, 260))}${p.body.length > 260 ? '…' : ''}</pre>
        <div class="pb-actions"><button class="btn primary sm" data-a="use">Chèn</button><button class="btn ghost sm" data-a="append">Thêm vào cuối</button><button class="btn ghost sm" data-a="edit">${p.builtin ? 'Nhân bản & sửa' : 'Sửa'}</button>${p.builtin ? '' : '<button class="btn ghost sm" data-a="copy">Nhân bản</button><button class="btn ghost sm danger" data-a="del">Xóa</button>'}</div></li>`;
    modal({
      title: '📚 Thư viện prompt',
      wide: true,
      body: `<div class="pl-bar"><input type="search" id="pl-q" placeholder="Tìm theo tiêu đề, nhãn, nội dung…" /><button class="btn primary sm" id="pl-new">＋ Prompt mới</button></div>
        <ul class="pl-list" id="pl-list"></ul>`,
      onMount: (el, close) => {
        const render = () => {
          const q = $('#pl-q', el).value.trim().toLowerCase();
          const list = all().filter((p) => !q || `${p.title} ${(p.tags || []).join(' ')} ${p.body}`.toLowerCase().includes(q));
          $('#pl-list', el).innerHTML = list.map(item).join('') || '<li class="empty">Không có prompt khớp.</li>';
          $$('#pl-list [data-p]', el).forEach((li) => {
            const p = all().find((x) => x.id === li.dataset.p);
            $$('[data-a]', li).forEach(
              (b) =>
                (b.onclick = async () => {
                  const a = b.dataset.a;
                  if (a === 'use' || a === 'append') {
                    insertText(textarea, p.body, a);
                    if (!p.builtin) C.api(`/api/prompts/${p.id}/use`, { method: 'POST', body: '{}' }).catch(() => {});
                    if (p.mode && textarea.closest('#task-form')) C.prefillAssign({ mode: p.mode, agentId: p.agentId, department: p.department, projectId: p.projectId });
                    close();
                  }
                  if (a === 'edit') D.editPrompt(p.builtin ? { ...p, id: undefined, builtin: false, title: `${p.title} (bản của tôi)` } : p, reload);
                  if (a === 'copy') D.editPrompt({ ...p, id: undefined, title: `${p.title} (bản sao)` }, reload);
                  if (a === 'del' && confirm(`Xóa prompt "${p.title}"?`)) {
                    await C.api(`/api/prompts/${p.id}`, { method: 'DELETE' }).catch(() => {});
                    reload();
                  }
                }),
            );
          });
        };
        const reload = async () => {
          try {
            saved = await C.api('/api/prompts');
          } catch {}
          if (el.isConnected) render();
        };
        $('#pl-q', el).oninput = render;
        $('#pl-new', el).onclick = () => D.editPrompt({ body: '' }, reload);
        render();
      },
    });
  };

  // ── Trợ giúp, hướng dẫn lần đầu, phím tắt ────────────────────────────────
  D.help = () => {
    modal({
      title: '❓ Trợ giúp — CCoding Office',
      wide: true,
      body: `<div class="help">
        <section><h3>CCoding là gì?</h3><p>Một văn phòng AI chạy trên máy bạn: bạn giao việc, <b>Điều phối viên</b> chọn phòng, <b>trưởng phòng</b> chia hạng mục cho các agent, họ làm thật trong thư mục/repo (có worktree riêng), <b>reviewer</b> duyệt, rồi trưởng phòng viết báo cáo. Mọi lượt gọi model đều được đếm token và ghi log (đã che bí mật/PII).</p></section>
        <section><h3>Bắt đầu trong 3 bước</h3><ol><li>Tab <b>Giao việc</b>: viết yêu cầu (dùng 📚 Thư viện hoặc 🧱 Soạn theo khung), chọn chế độ.</li><li>Bấm <b>Giao việc</b> → theo dõi ở tab <b>Nhiệm vụ</b> (hội thoại, sản phẩm, token).</li><li>Xong thì đọc <b>🏁 Báo cáo</b>; cần sửa thì "Làm lại từ review" hoặc "↻ Giao lại tương tự".</li></ol></section>
        <section><h3>Các chế độ giao việc</h3><ul><li><b>Tự động</b> — điều phối viên chọn phòng.</li><li><b>Theo phòng</b> — chỉ định Phát triển hoặc Nghiên cứu.</li><li><b>Theo dự án</b> — làm trong repo/thư mục của dự án, theo cấu hình dự án (lệnh kiểm tra, quyền công cụ).</li><li><b>Liên phòng</b> — Nghiên cứu làm trước, Phát triển dựng tiếp.</li><li><b>Giao riêng</b> — một agent làm luôn (bỏ lập kế hoạch/họp, vẫn có review) — nhanh và rẻ cho việc nhỏ.</li></ul></section>
        <section><h3>Phòng giám đốc (bạn)</h3><p>Nhân vật cà vạt đỏ là bạn. <kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> để đi (phím mũi tên khi trỏ chuột trên văn phòng), nhấp đúp lên sàn để đi tới, <kbd>E</kbd> cạnh một người/phòng để tương tác: giao việc riêng, góp ý, tăng ngân sách, xem hồ sơ… Các mục có nhãn <em class="fun-tag">vui</em> chỉ để giải trí — không ảnh hưởng công việc đang chạy.</p></section>
        <section><h3>Nhãn dữ liệu & nơi xử lý</h3><p><b>Công khai/Nội bộ</b> có thể gửi tới runtime bên ngoài được phép (đã che bí mật/PII); <b>Bảo mật/Hạn chế</b> chỉ chạy runtime cục bộ (Ollama). Dòng 🔐 dưới form cho biết dữ liệu sẽ đi tới đâu trước khi bạn giao.</p></section>
        <section><h3>Phím tắt</h3><table class="tbl keys"><tbody>
          <tr><td><kbd>?</kbd> hoặc <kbd>H</kbd></td><td>Mở trợ giúp</td></tr>
          <tr><td><kbd>N</kbd></td><td>Giao việc mới (đưa con trỏ vào ô Yêu cầu)</td></tr>
          <tr><td><kbd>1</kbd>–<kbd>7</kbd></td><td>Chuyển tab: Giao việc · Nhiệm vụ · Nhân sự · Token · Hạn mức · KPI · Nhật ký</td></tr>
          <tr><td><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> / <kbd>E</kbd></td><td>Đi / tương tác trong văn phòng</td></tr>
          <tr><td><kbd>Esc</kbd></td><td>Đóng hộp thoại, menu</td></tr></tbody></table></section>
        <section><h3>Thuật ngữ</h3><ul><li><b>Runtime</b> — nơi chạy model (Cerebras, NVIDIA, Ollama…). Tab <b>Hạn mức</b> cho biết token còn lại.</li><li><b>Ngân sách token</b> — trần token của một nhiệm vụ; "chạy tới khi hoàn thành" chỉ cảnh báo, "tạm dừng" dừng để bạn quyết.</li><li><b>Worktree</b> — bản sao làm việc riêng của repo trên nhánh riêng, không đụng nhánh chính.</li><li><b>Review</b> — reviewer của phòng kiểm tra bằng chứng (test chạy thật) và yêu cầu sửa.</li></ul></section>
        <div class="pb-actions"><button class="btn ghost sm" id="help-tour">▶ Xem lại hướng dẫn nhanh</button></div></div>`,
      onMount: (el, close) => {
        $('#help-tour', el).onclick = () => {
          close();
          D.tour(true);
        };
      },
    });
  };

  const TOUR = [
    { sel: '#stage', title: 'Văn phòng của bạn', text: 'Các agent làm việc ở đây theo trạng thái thật. Bạn là nhân vật cà vạt đỏ ở phòng Giám đốc bên phải: WASD để đi, E để tương tác.' },
    { sel: '#task-form', title: 'Giao việc', text: 'Viết yêu cầu, chọn chế độ (Giao riêng = một agent làm luôn). 📚 Thư viện và 🧱 Soạn theo khung giúp viết yêu cầu rõ ràng.' },
    { sel: '.tabs', title: 'Theo dõi', text: 'Nhiệm vụ: tiến độ, hội thoại, sản phẩm. Nhân sự: từng agent. Token & Hạn mức: đã dùng và còn lại. KPI: chấm điểm từng agent.' },
    { sel: '#bell', title: 'Cảnh báo', text: 'Hết token, chạm ngân sách, review chưa duyệt… đều hiện ở đây và thành thông báo góc màn hình.' },
    { sel: '#btn-help', title: 'Cần trợ giúp?', text: 'Bấm ❓ hoặc phím ? bất cứ lúc nào để xem hướng dẫn, chế độ giao việc và phím tắt.' },
  ];
  D.tour = (force) => {
    if (!force && store.get('tourDone', false)) return;
    let i = 0;
    const layer = document.createElement('div');
    layer.className = 'tour';
    document.body.appendChild(layer);
    lock(true);
    const end = () => {
      layer.remove();
      store.set('tourDone', true);
      if (!openModals) lock(false);
      document.removeEventListener('keydown', key, true);
    };
    const key = (e) => {
      if (e.key === 'Escape') end();
      if (e.key === 'Enter' || e.key === 'ArrowRight') next();
    };
    const next = () => {
      i++;
      if (i >= TOUR.length) end();
      else show();
    };
    const show = () => {
      const s = TOUR[i];
      const t = $(s.sel);
      const r = t ? t.getBoundingClientRect() : { left: innerWidth / 2 - 100, top: innerHeight / 2 - 50, width: 200, height: 100 };
      const bw = 320;
      const below = r.top + r.height + 170 < innerHeight;
      const left = Math.max(12, Math.min(innerWidth - bw - 12, r.left + r.width / 2 - bw / 2));
      const top = below ? Math.min(innerHeight - 170, r.top + r.height + 12) : Math.max(12, r.top - 170);
      layer.innerHTML = `<div class="tour-hole" style="left:${r.left - 6}px;top:${r.top - 6}px;width:${r.width + 12}px;height:${r.height + 12}px"></div>
        <div class="tour-box" style="left:${left}px;top:${top}px;width:${bw}px"><small>${i + 1}/${TOUR.length}</small><h3>${esc(s.title)}</h3><p>${esc(s.text)}</p>
        <div class="pb-actions"><button class="btn primary sm" data-n>${i + 1 < TOUR.length ? 'Tiếp →' : 'Bắt đầu dùng'}</button><button class="btn ghost sm" data-x>Bỏ qua</button></div></div>`;
      $('[data-n]', layer).onclick = next;
      $('[data-x]', layer).onclick = end;
      $('[data-n]', layer).focus();
    };
    document.addEventListener('keydown', key, true);
    show();
  };

  function shortcuts(e) {
    if (openModals || menuState || $('.tour')) return;
    const el = e.target;
    if (el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName || ''))) return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key === '?' || e.key.toLowerCase() === 'h') {
      e.preventDefault();
      return D.help();
    }
    if (e.key.toLowerCase() === 'n') {
      e.preventDefault();
      return C.prefillAssign({});
    }
    const tabs = ['assign', 'tasks', 'people', 'tokens', 'quota', 'kpi', 'logs'];
    if (/^[1-7]$/.test(e.key)) {
      e.preventDefault();
      C.setTab(tabs[Number(e.key) - 1]);
    }
  }

  // ── Khởi động ────────────────────────────────────────────────────────────
  D.init = () => {
    C = window.CC;
    if (!C) return;
    attachPromptTools($('#prompt-tools'), $('#task-form [name=brief]'));
    attachChecker($('#task-form [name=brief]'), $('#prompt-check'), () => {
      const f = $('#task-form');
      return f.mode.value === 'project' || (f.mode.value === 'agent' && f.agentProject.value) ? 'project' : 'scratch';
    });
    $('#task-form').addEventListener('change', (e) => {
      if (['projectId', 'agentProject', 'mode', 'runtime'].includes(e.target.name)) D.formChanged();
    });
    D.formChanged();
    $('#btn-help').onclick = () => D.help();
    document.addEventListener('keydown', shortcuts);
    refreshScreen();
    setInterval(refreshScreen, 30000);
    // runtime nạp xong sau → cập nhật dòng luồng dữ liệu
    setTimeout(D.formChanged, 2500);
    setTimeout(() => D.tour(false), 1200);
  };

  window.Director = D;
})();
