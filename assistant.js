(() => {
  'use strict';
  if (window.__fitMealAssistantMounted) return;
  window.__fitMealAssistantMounted = true;

  const esc = (v) => String(v ?? '').replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#039;','"':'&quot;'}[c]));
  const STORAGE_KEY = 'fitmeal_assistant_messages';
  const QUICK = ['Gợi ý món cho tôi', 'Đặt hàng như thế nào?', 'Thanh toán VNPAY ra sao?', 'Kiểm tra đơn hàng'];
  const fallback = (text) => {
    const q = text.toLowerCase();
    if (q.includes('đơn') || q.includes('giao')) return 'Bạn có thể vào mục “Đơn hàng” để xem trạng thái. Nếu đã đăng nhập, mình có thể giúp bạn tìm nhanh đơn gần nhất.';
    if (q.includes('thực đơn') || q.includes('món') || q.includes('ăn')) return 'FitMeal hiện có 42 món. Bạn có thể lọc theo khu vực, mục tiêu và mở “Xem chi tiết” để xem mô tả, cách chế biến, dinh dưỡng và đánh giá.';
    if (q.includes('thanh toán') || q.includes('vnpay') || q.includes('cod')) return 'FitMeal hỗ trợ COD và VNPAY. Khi thanh toán online, hệ thống tạo đơn trước rồi chuyển bạn sang cổng thanh toán để xác nhận giao dịch.';
    if (q.includes('khảo sát') || q.includes('bmr') || q.includes('tdee')) return '“Khảo sát” là bước hỏi thông tin để ước tính BMR/TDEE/BMI và sở thích. “Lộ trình” dùng kết quả đó để xây gói suất ăn, tùy chỉnh món và đi tiếp đến giỏ hàng.';
    if (q.includes('giới thiệu') || q.includes('fitmeal là')) return 'FitMeal là cửa hàng suất ăn hướng đến trải nghiệm đặt món rõ ràng: xem món, hiểu cách chế biến, cá nhân hóa theo mục tiêu và theo dõi đơn hàng trong cùng một luồng.';
    return 'Mình là trợ lý FitMeal. Mình có thể giúp bạn tìm món, giải thích lộ trình/khảo sát, hướng dẫn đặt hàng, thanh toán và theo dõi đơn.';
  };

  function loadMessages() {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); } catch { return []; }
  }
  function saveMessages(messages) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(messages.slice(-20)));
  }
  function addMessage(role, text) {
    const list = loadMessages();
    list.push({ role, text, at: new Date().toISOString() });
    saveMessages(list);
    renderMessages();
  }
  function renderMessages() {
    const body = document.querySelector('#fitmealAssistantMessages');
    if (!body) return;
    const messages = loadMessages();
    if (!messages.length) {
      body.innerHTML = `<div class="ai-bubble ai-bubble-bot"><strong>Xin chào 👋</strong><span>Mình có thể tư vấn món, giải thích lộ trình, hướng dẫn đặt hàng và hỗ trợ thanh toán.</span></div>` +
        QUICK.map(q => `<button class="ai-quick" type="button" data-ai-quick="${esc(q)}">${esc(q)}</button>`).join('');
      return;
    }
    body.innerHTML = messages.map(m => `<div class="ai-bubble ${m.role === 'user' ? 'ai-bubble-user' : 'ai-bubble-bot'}">${esc(m.text)}</div>`).join('');
    body.scrollTop = body.scrollHeight;
  }
  async function ask(text) {
    const clean = text.trim();
    if (!clean) return;
    addMessage('user', clean);
    const typing = document.createElement('div');
    typing.className = 'ai-bubble ai-bubble-bot ai-typing';
    typing.textContent = 'Đang trả lời…';
    document.querySelector('#fitmealAssistantMessages')?.appendChild(typing);
    try {
      const r = await fetch('/api/assistant/chat', {
        method: 'POST', headers: {'Content-Type':'application/json'}, credentials:'same-origin',
        body: JSON.stringify({ message: clean })
      });
      const data = await r.json();
      typing.remove();
      if (!r.ok) throw new Error(data?.error || 'Không thể kết nối trợ lý.');
      addMessage('assistant', data.reply || fallback(clean));
    } catch {
      typing.remove();
      addMessage('assistant', fallback(clean));
    }
  }

  const root = document.createElement('div');
  root.id = 'fitmealAssistant';
  root.innerHTML = `
    <button class="ai-fab" type="button" id="fitmealAssistantFab" aria-label="Mở trợ lý FitMeal"><span class="ai-fab-dot"></span><span>AI</span></button>
    <section class="ai-panel" id="fitmealAssistantPanel" aria-label="Trợ lý FitMeal" hidden>
      <header class="ai-head"><div><span class="ai-kicker">FITMEAL AI</span><strong>Trợ lý đặt món</strong><small>Phản hồi nhanh · tự động</small></div><button type="button" class="ai-close" id="fitmealAssistantClose" aria-label="Đóng">×</button></header>
      <div class="ai-messages" id="fitmealAssistantMessages"></div>
      <form class="ai-form" id="fitmealAssistantForm"><input id="fitmealAssistantInput" maxlength="800" autocomplete="off" placeholder="Hỏi FitMeal điều gì đó…"><button type="submit" aria-label="Gửi">↗</button></form>
      <div class="ai-foot">AI chỉ cung cấp thông tin tham khảo; đơn hàng và thanh toán vẫn do hệ thống chính xác nhận.</div>
    </section>`;
  document.body.appendChild(root);
  const panel = root.querySelector('#fitmealAssistantPanel');
  root.querySelector('#fitmealAssistantFab').addEventListener('click', () => { panel.hidden = !panel.hidden; if (!panel.hidden) { renderMessages(); root.querySelector('#fitmealAssistantInput')?.focus(); }});
  root.querySelector('#fitmealAssistantClose').addEventListener('click', () => { panel.hidden = true; });
  root.querySelector('#fitmealAssistantForm').addEventListener('submit', e => { e.preventDefault(); const input = root.querySelector('#fitmealAssistantInput'); const value=input.value; input.value=''; ask(value); });
  root.addEventListener('click', e => { const b=e.target.closest('[data-ai-quick]'); if (b) ask(b.dataset.aiQuick); });
  renderMessages();
})();
