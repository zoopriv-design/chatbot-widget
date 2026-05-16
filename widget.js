// public/widget.js
// Self-Service Chatbot Widget - Egysoros beágyazás
// Használat: <script src="https://.../widget.js" data-id="ugyfel-id"></script>

(function() {
  // 1. Konfiguráció beolvasása a script tag attribútumaiból
  const currentScript = document.currentScript;
  const WORKER_URL = currentScript.src.replace('/widget.js', ''); // Automatikusan kiszámolja a Worker URL-t
  const CLIENT_ID = currentScript.getAttribute('data-id');

  if (!CLIENT_ID) {
    console.error('🤖 Chatbot Widget: Hiányzó data-id attribútum a script tag-en!');
    return;
  }

  // 2. UI Elemek létrehozása (Shadow DOM helyett sima DOM, a könnyebb stílusozás érdekében MVP-ben)
  function createWidgetUI(config) {
    // CSS Stílusok injektálása
    const style = document.createElement('style');
    style.textContent = `
      #chatbot-widget-container {
        position: fixed; bottom: 20px; right: 20px; z-index: 9999;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      }
      #chatbot-toggle-btn {
        width: 60px; height: 60px; border-radius: 50%;
        background: linear-gradient(135deg, #38bdf8, #818cf8);
        border: none; color: white; font-size: 28px;
        cursor: pointer; box-shadow: 0 4px 12px rgba(0,0,0,0.3);
        transition: transform 0.2s, box-shadow 0.2s;
        display: flex; align-items: center; justify-content: center;
      }
      #chatbot-toggle-btn:hover { transform: scale(1.05); box-shadow: 0 6px 20px rgba(0,0,0,0.4); }
      #chatbot-window {
        position: absolute; bottom: 80px; right: 0;
        width: 350px; max-height: 500px;
        background: #1e293b; border: 1px solid #334155;
        border-radius: 16px; display: flex; flex-direction: column;
        box-shadow: 0 20px 25px -5px rgba(0,0,0,0.5);
        overflow: hidden; transform-origin: bottom right;
        transition: opacity 0.2s, transform 0.2s;
        opacity: 0; transform: scale(0.95); pointer-events: none;
      }
      #chatbot-window.open { opacity: 1; transform: scale(1); pointer-events: all; }
      .chat-header {
        padding: 1rem; background: #0f172a; border-bottom: 1px solid #334155;
        display: flex; align-items: center; justify-content: space-between;
      }
      .chat-header h3 { color: #f1f5f9; font-size: 1rem; margin: 0; display: flex; align-items: center; gap: 8px; }
      .chat-header .status-dot { width: 8px; height: 8px; background: #4ade80; border-radius: 50%; display: inline-block; }
      .chat-header .close-btn { background: none; border: none; color: #94a3b8; font-size: 1.5rem; cursor: pointer; }
      .chat-messages {
        flex: 1; padding: 1rem; overflow-y: auto;
        display: flex; flex-direction: column; gap: 0.75rem;
        background: #1e293b;
      }
      .message {
        max-width: 85%; padding: 0.75rem 1rem; border-radius: 12px;
        font-size: 0.9rem; line-height: 1.4; animation: fadeIn 0.2s ease;
      }
      @keyframes fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
      .message.bot {
        align-self: flex-start; background: #334155; color: #f1f5f9;
        border-bottom-left-radius: 2px;
      }
      .message.user {
        align-self: flex-end; background: #38bdf8; color: #0f172a;
        border-bottom-right-radius: 2px; font-weight: 500;
      }
      .chat-input-area {
        padding: 0.75rem; background: #0f172a; border-top: 1px solid #334155;
        display: flex; gap: 0.5rem;
      }
      .chat-input-area input {
        flex: 1; padding: 0.75rem; border-radius: 24px; border: 1px solid #334155;
        background: #1e293b; color: #f1f5f9; outline: none; font-size: 0.9rem;
      }
      .chat-input-area input:focus { border-color: #38bdf8; }
      .chat-input-area button {
        width: 40px; height: 40px; border-radius: 50%; border: none;
        background: #38bdf8; color: #0f172a; cursor: pointer; font-weight: bold;
        transition: background 0.2s;
      }
      .chat-input-area button:hover { background: #0ea5e9; }
      .chat-input-area button:disabled { background: #475569; cursor: not-allowed; }
      .typing-indicator { font-style: italic; color: #94a3b8; font-size: 0.8rem; margin-left: 1rem; }
    `;
    document.head.appendChild(style);

    // HTML Struktúra
    const container = document.createElement('div');
    container.id = 'chatbot-widget-container';
    container.innerHTML = `
      <button id="chatbot-toggle-btn" aria-label="Chat megnyitása">💬</button>
      <div id="chatbot-window">
        <div class="chat-header">
          <h3><span class="status-dot"></span> <span id="chatbot-name">${config.botName || 'Asszisztens'}</span></h3>
          <button class="close-btn" id="chatbot-close">&times;</button>
        </div>
        <div class="chat-messages" id="chatbot-messages">
          <div class="message bot">${config.welcomeMessage || 'Szia! Miben segíthetek?'}</div>
        </div>
        <div class="chat-input-area">
          <input type="text" id="chatbot-input" placeholder="Írj üzenetet..." autocomplete="off">
          <button id="chatbot-send">➤</button>
        </div>
      </div>
    `;
    document.body.appendChild(container);

    // Logika
    const toggleBtn = document.getElementById('chatbot-toggle-btn');
    const closeBtn = document.getElementById('chatbot-close');
    const windowEl = document.getElementById('chatbot-window');
    const messagesEl = document.getElementById('chatbot-messages');
    const inputEl = document.getElementById('chatbot-input');
    const sendBtn = document.getElementById('chatbot-send');

    toggleBtn.addEventListener('click', () => {
      windowEl.classList.toggle('open');
      if (windowEl.classList.contains('open')) inputEl.focus();
    });
    closeBtn.addEventListener('click', () => windowEl.classList.remove('open'));

    async function sendMessage() {
      const text = inputEl.value.trim();
      if (!text) return;

      // User üzenet megjelenítése
      appendMessage(text, 'user');
      inputEl.value = '';
      inputEl.disabled = true;
      sendBtn.disabled = true;

      // Töltés jelzés
      const typing = document.createElement('div');
      typing.className = 'typing-indicator';
      typing.id = 'chatbot-typing';
      typing.textContent = 'Gépelek...';
      messagesEl.appendChild(typing);
      messagesEl.scrollTop = messagesEl.scrollHeight;

      try {
        // API Hívás a Worker proxy-n keresztül
        const response = await fetch(`${WORKER_URL}/api/chat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: text, clientId: CLIENT_ID })
        });

        const data = await response.json();

        // Töltés eltávolítása
        document.getElementById('chatbot-typing')?.remove();

        if (response.ok) {
          appendMessage(data.reply, 'bot');
        } else {
          appendMessage(`⚠️ Hiba: ${data.error || 'Ismeretlen hiba'}`, 'bot');
        }
      } catch (error) {
        document.getElementById('chatbot-typing')?.remove();
        appendMessage('⚠️ Hálózati hiba. Ellenőrizd az internetkapcsolatot.', 'bot');
        console.error('Widget error:', error);
      } finally {
        inputEl.disabled = false;
        sendBtn.disabled = false;
        inputEl.focus();
      }
    }

    function appendMessage(text, sender) {
      const div = document.createElement('div');
      div.className = `message ${sender}`;
      div.textContent = text;
      messagesEl.appendChild(div);
      messagesEl.scrollTop = messagesEl.scrollHeight;
    }

    sendBtn.addEventListener('click', sendMessage);
    inputEl.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') sendMessage();
    });
  }

  // 3. Inicializálás: Config lekérése -> UI építés
  async function init() {
    try {
      // Lekérjük a bot beállításait a Workertől (API kulcs NÉLKÜL)
      const response = await fetch(`${WORKER_URL}/api/get-config?id=${CLIENT_ID}`);
      
      if (!response.ok) {
        console.error('🤖 Widget: Nem sikerült betölteni a konfigurációt.', await response.text());
        return;
      }
      
      const config = await response.json();
      
      // Alapértelmezett üdvözlő szöveg, ha nincs a configban
      if (!config.welcomeMessage) {
        config.welcomeMessage = `Szia! ${config.botName || 'Itt vagyok'} segít neked.`;
      }

      // UI létrehozása a kapott config alapján
      createWidgetUI(config);
      
    } catch (error) {
      console.error('🤖 Widget init error:', error);
    }
  }

  // Indítás, ha a DOM betöltött
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();