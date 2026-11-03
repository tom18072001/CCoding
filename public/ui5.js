// UI-5: tiện ích của giao diện mới — chuyển sáng/tối (nhớ theo trình duyệt), bỏ emoji đầu tiêu đề cho gọn kiểu Paperclip.
(function () {
  const root = document.documentElement;
  const get = () => root.dataset.theme || 'light';
  const set = (t) => {
    root.dataset.theme = t;
    try {
      localStorage.setItem('ccoding.theme', JSON.stringify(t));
    } catch {}
  };
  const btn = document.getElementById('btn-theme');
  if (btn) btn.onclick = () => set(get() === 'dark' ? 'light' : 'dark');

  // Tiêu đề trang/mục/đường dẫn: bỏ emoji đứng đầu (nội dung, thông điệp và nhật ký giữ nguyên)
  const EMOJI = /^[\s\p{Extended_Pictographic}\u{FE0F}\u{200D}\u{20E3}]+(?=\S)/u;
  const SEL = '.crumbs > :first-child, .dv-head h1, .sec-head h2, .card > h2, .card-head h2, .dept-head h2, .subtabs button, .pg h1, .pg h2';
  function clean(scope) {
    for (const el of scope.querySelectorAll(SEL)) {
      const n = [...el.childNodes].find((x) => x.nodeType === 3 && x.textContent.trim());
      if (n && EMOJI.test(n.textContent)) n.textContent = n.textContent.replace(EMOJI, '');
    }
  }
  const main = document.getElementById('main');
  if (main) {
    let queued = false;
    new MutationObserver(() => {
      if (queued) return;
      queued = true;
      requestAnimationFrame(() => {
        queued = false;
        clean(main);
      });
    }).observe(main, { childList: true, subtree: true });
    clean(main);
  }
})();
