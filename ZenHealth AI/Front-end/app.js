const DB = {
  get: (k) => { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } },
  set: (k, v) => { localStorage.setItem(k, JSON.stringify(v)); },
  del: (k) => { localStorage.removeItem(k); }
};

const Settings = {
  get: () => DB.get('ha_settings') || { theme: 'dark', themeHue: 174 },
  set: (partial) => {
    const current = Settings.get();
    DB.set('ha_settings', { ...current, ...partial });
  }
};

const UserPrefs = {
  key: (uid) => `ha_user_prefs_${uid}`,
  get: (uid) => DB.get(UserPrefs.key(uid)) || { nickname: '', hideEmail: false },
  set: (uid, partial) => {
    const cur = UserPrefs.get(uid);
    DB.set(UserPrefs.key(uid), { ...cur, ...partial });
  }
};

function applyTheme() {
  const s = Settings.get();
  const theme = s.theme === 'light' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', theme);

  const hue = Number.isFinite(Number(s.themeHue)) ? Number(s.themeHue) : 174;
  document.documentElement.style.setProperty('--accent', `hsl(${hue},70%,55%)`);
  document.documentElement.style.setProperty('--accent-dim', `hsla(${hue},70%,55%,0.12)`);
  document.documentElement.style.setProperty('--accent-glow', `hsla(${hue},70%,55%,0.2)`);
}

function toggleTheme() {
  const s = Settings.get();
  Settings.set({ theme: s.theme === 'light' ? 'dark' : 'light' });
  applyTheme();
  const btn = document.getElementById('theme-toggle');
  if (btn) btn.textContent = Settings.get().theme === 'light' ? '🌙 Dark mode' : '☀️ Light mode';
}

function initThemeToggle() {
  applyTheme();
  const btn = document.getElementById('theme-toggle');
  if (!btn) return;
  btn.textContent = Settings.get().theme === 'light' ? '🌙 Dark mode' : '☀️ Light mode';
  btn.addEventListener('click', toggleTheme);
}

function base32Encode(bytes) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = 0;
  let value = 0;
  let output = '';
  for (const b of bytes) {
    value = (value << 8) | b;
    bits += 8;
    while (bits >= 5) {
      output += alphabet[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) output += alphabet[(value << (5 - bits)) & 31];
  return output;
}

function base32Decode(str) {
  const clean = String(str || '').toUpperCase().replace(/=+$/,'').replace(/[^A-Z2-7]/g,'');
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = 0;
  let value = 0;
  const out = [];
  for (const ch of clean) {
    const idx = alphabet.indexOf(ch);
    if (idx === -1) continue;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return new Uint8Array(out);
}

function isWebCryptoAvailable() {
  return typeof crypto !== 'undefined' && !!crypto.subtle;
}

async function hmacSha1(keyBytes, msgBytes) {
  if (!isWebCryptoAvailable()) {
    throw new Error('2FA demo requires a secure context (http://localhost). Open the site via a local server, not file://');
  }
  const key = await crypto.subtle.importKey(
    'raw',
    keyBytes,
    { name: 'HMAC', hash: 'SHA-1' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, msgBytes);
  return new Uint8Array(sig);
}

function intToBytes(counter) {
  const buf = new Uint8Array(8);
  let x = BigInt(counter);
  for (let i = 7; i >= 0; i--) {
    buf[i] = Number(x & 0xffn);
    x >>= 8n;
  }
  return buf;
}

async function totp(secretBase32, stepSeconds = 30, digits = 6, timestampMs = Date.now()) {
  if (!isWebCryptoAvailable()) {
    throw new Error('2FA demo requires a secure context (http://localhost). Open the site via a local server, not file://');
  }
  const keyBytes = base32Decode(secretBase32);
  const counter = Math.floor(timestampMs / 1000 / stepSeconds);
  const msg = intToBytes(counter);
  const hash = await hmacSha1(keyBytes, msg);
  const offset = hash[hash.length - 1] & 0x0f;
  const bin = ((hash[offset] & 0x7f) << 24) |
              ((hash[offset + 1] & 0xff) << 16) |
              ((hash[offset + 2] & 0xff) << 8) |
              (hash[offset + 3] & 0xff);
  const otp = (bin % (10 ** digits)).toString().padStart(digits, '0');
  return otp;
}

async function verifyTotp(secretBase32, code, windowSteps = 1) {
  if (!isWebCryptoAvailable()) {
    throw new Error('2FA demo requires a secure context (http://localhost). Open the site via a local server, not file://');
  }
  const c = String(code || '').replace(/\s/g,'');
  if (!/^\d{6}$/.test(c)) return false;
  const now = Date.now();
  for (let w = -windowSteps; w <= windowSteps; w++) {
    const ts = now + w * 30000;
    const expected = await totp(secretBase32, 30, 6, ts);
    if (expected === c) return true;
  }
  return false;
}

function generate2FASecret() {
  const bytes = new Uint8Array(20);
  crypto.getRandomValues(bytes);
  return base32Encode(bytes);
}

const AuthDB = {
  getUsers: () => {
    return JSON.parse(localStorage.getItem('ha_users') || '[]');
  },
  saveUsers: (users) => {
    localStorage.setItem('ha_users', JSON.stringify(users));
  },
  getUserByEmail: (email) => {
    const users = AuthDB.getUsers();
    return users.find(u => u.email === email);
  },
  signup: async (email, password, name) => {
    return new Promise((resolve, reject) => {
      setTimeout(() => {
        const users = AuthDB.getUsers();
        if (users.some(u => u.email === email)) {
          reject(new Error('Email already registered'));
          return;
        }
        const uid = 'uid_' + Date.now();
        const twofaSecret = generate2FASecret();
        const user = { uid, email, password, name, createdAt: new Date().toISOString(), twofaEnabled: true, twofaSecret };
        users.push(user);
        AuthDB.saveUsers(users);
        AuthDB.setCurrentUser(user);
        resolve(user);
      }, 250);
    });
  },
  signin: async (email, password) => {
    return new Promise((resolve, reject) => {
      setTimeout(() => {
        const user = AuthDB.getUserByEmail(email);
        if (!user || user.password !== password) {
          reject(new Error('Invalid email or password'));
          return;
        }
        AuthDB.setCurrentUser(user);
        resolve(user);
      }, 250);
    });
  },

  updateUser: (uid, partial) => {
    const users = AuthDB.getUsers();
    const idx = users.findIndex(u => u.uid === uid);
    if (idx === -1) return null;
    users[idx] = { ...users[idx], ...partial };
    AuthDB.saveUsers(users);
    const cur = AuthDB.getCurrentUser();
    if (cur?.uid === uid) AuthDB.setCurrentUser(users[idx]);
    return users[idx];
  },
  getCurrentUser: () => {
    const user = localStorage.getItem('ha_current_user');
    return user ? JSON.parse(user) : null;
  },
  setCurrentUser: (user) => {
    localStorage.setItem('ha_current_user', JSON.stringify(user));
  },
  logout: () => {
    localStorage.removeItem('ha_current_user');
  },
  saveHealthProfile: async (uid, profileData) => {
    return new Promise((resolve) => {
      setTimeout(() => {
        const profiles = JSON.parse(localStorage.getItem('ha_profiles') || '{}');
        profiles[uid] = {
          ...profileData,
          updatedAt: new Date().toISOString()
        };
        localStorage.setItem('ha_profiles', JSON.stringify(profiles));
        resolve(true);
      }, 150);
    });
  },
  getHealthProfile: async (uid) => {
    return new Promise((resolve) => {
      const profiles = JSON.parse(localStorage.getItem('ha_profiles') || '{}');
      resolve(profiles[uid] || null);
    });
  }
};

const Auth = {
  getUser: () => AuthDB.getCurrentUser(),
  isLoggedIn: () => !!AuthDB.getCurrentUser(),
  logout: () => {
    AuthDB.logout();
    window.location.href = 'index.html';
  }
};

const EmergencyContacts = {
  key: (uid) => `ha_emergency_contacts_${uid}`,
  list: (uid) => DB.get(EmergencyContacts.key(uid)) || [],
  save: (uid, list) => DB.set(EmergencyContacts.key(uid), list),
  add: (uid, contact) => {
    const list = EmergencyContacts.list(uid);
    list.push({
      id: 'ec_' + Date.now(),
      name: contact.name || '',
      relationship: contact.relationship || '',
      phone: contact.phone || '',
      email: contact.email || '',
      priority: contact.priority || 'Primary',
      createdAt: new Date().toISOString()
    });
    EmergencyContacts.save(uid, list);
    return list;
  },
  remove: (uid, id) => {
    const list = EmergencyContacts.list(uid).filter(c => c.id !== id);
    EmergencyContacts.save(uid, list);
    return list;
  }
};

function requireAuth() {
  if (!Auth.isLoggedIn()) window.location.href = 'index.html';
}

function showToast(msg, type = 'success', duration = 3000) {
  let toast = document.getElementById('toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'toast';
    toast.className = 'toast';
    document.body.appendChild(toast);
  }
  const icon = type === 'success' ? '✓' : type === 'error' ? '✕' : 'ℹ';
  toast.innerHTML = `<span>${icon}</span><span>${String(msg)}</span>`;
  toast.className = `toast ${type}`;
  requestAnimationFrame(() => { toast.classList.add('show'); });
  setTimeout(() => { toast.classList.remove('show'); }, duration);
}

function escHtml(s) {
  return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\n/g,'<br>');
}

function escAttr(s) {
  return String(s || '').replace(/"/g,'&quot;').replace(/\n/g,' ');
}

function setActiveNav() {
  const page = window.location.pathname.split('/').pop();
  document.querySelectorAll('.nav-link').forEach(link => {
    const href = link.getAttribute('href');
    link.classList.toggle('active', href === page || (page === '' && href === 'dashboard.html'));
  });
}

function loadSidebarUser() {
  const user = Auth.getUser();
  if (!user) return;
  const prefs = user.uid ? UserPrefs.get(user.uid) : { nickname: '', hideEmail: false };
  const nameEl = document.getElementById('sidebar-user-name');
  const subEl  = document.getElementById('sidebar-user-sub');
  const avEl   = document.getElementById('sidebar-avatar');

  const displayName = (prefs.nickname || user.name || 'User').trim();
  if (nameEl) nameEl.textContent = displayName;
  if (subEl)  subEl.textContent  = prefs.hideEmail ? '' : (user.email || '');
  if (avEl)   avEl.textContent   = (displayName || 'U')[0].toUpperCase();
}

async function getCurrentProfile() {
  const user = Auth.getUser();
  if (!user?.uid) return null;
  return await AuthDB.getHealthProfile(user.uid);
}

function profileComplete(profile) {
  const age = parseInt(profile?.age, 10);
  return Number.isFinite(age) && age > 0;
}

async function ensureProfileComplete() {
  const profile = await getCurrentProfile();
  if (!profileComplete(profile)) {
    window.location.href = 'onboarding.html';
    return false;
  }
  return true;
}

async function callTriage(userText) {
  const profile = await getCurrentProfile();
  const age = parseInt(profile?.age, 10);
  if (!Number.isFinite(age) || age <= 0) {
    throw new Error('Please complete your profile (age) first.');
  }
  const existingConditions = (profile?.conditions || '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);

  const payload = {
    user_input: userText,
    age,
    existing_conditions: existingConditions
  };

  const apiBase = (
    localStorage.getItem('ha_api_base') ||
    ((window.location.protocol === 'http:' || window.location.protocol === 'https:')
      ? 'http://localhost:8000'
      : 'http://localhost:8000')
  ).replace(/\/$/, '');

  const url = `${apiBase}/api/triage/analyze`;

  let res;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
  } catch (e) {
    const proto = window.location.protocol;
    const hint = proto === 'https:'
      ? 'Your page is https:// but the API is http:// (mixed content blocked). Serve the API over https, or open the front-end via http://localhost.'
      : 'Make sure the FastAPI server is running on http://localhost:8000 and that you opened the front-end from a local server (recommended), not a restricted environment.';
    throw new Error(`Could not reach API at ${url}. ${hint}`);
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || 'Server error');
  }

  return await res.json();
}

async function callChat(message) {
  const apiBase = (
    localStorage.getItem('ha_api_base') ||
    ((window.location.protocol === 'http:' || window.location.protocol === 'https:')
      ? 'http://localhost:8000'
      : 'http://localhost:8000')
  ).replace(/\/$/, '');

  const url = `${apiBase}/api/chat/`;

  let res;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message })
    });
  } catch (e) {
    const proto = window.location.protocol;
    const hint = proto === 'https:'
      ? 'Your page is https:// but the API is http:// (mixed content blocked). Serve the API over https, or open the front-end via http://localhost.'
      : 'Make sure the FastAPI server is running on http://localhost:8000 and that you opened the front-end from a local server (recommended), not a restricted environment.';
    throw new Error(`Could not reach API at ${url}. ${hint}`);
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || 'Server error');
  }

  return await res.json();
}

document.addEventListener('DOMContentLoaded', () => {
  initThemeToggle();
  loadSidebarUser();
  setActiveNav();
  const logoutBtn = document.getElementById('logout-btn');
  if (logoutBtn) logoutBtn.addEventListener('click', Auth.logout);
});
