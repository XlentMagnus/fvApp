/* ==========================================================================
   FöreningsVerktyg — Client-side SPA
   ========================================================================== */

(function () {
  'use strict';

  // ---------------------------------------------------------------------------
  // State
  // ---------------------------------------------------------------------------
  let currentUser = null;
  let currentPage = 'dashboard';
  let calendarDate = new Date();
  let calendarView = 'month';

  // ---------------------------------------------------------------------------
  // Date helper — always use LOCAL dates, never toISOString() which converts to UTC
  // ---------------------------------------------------------------------------
  function localDate(d) {
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }

  // ---------------------------------------------------------------------------
  // API helper
  // ---------------------------------------------------------------------------
  async function api(url, opts = {}) {
    const res = await fetch(url, {
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      ...opts,
      body: opts.body ? JSON.stringify(opts.body) : undefined,
    });
    if (res.status === 401 && !url.includes('/login')) {
      currentUser = null;
      render();
      return null;
    }
    const data = await res.json().catch(() => null);
    if (!res.ok) throw new Error(data?.error || 'Något gick fel');
    return data;
  }

  // ---------------------------------------------------------------------------
  // Toast
  // ---------------------------------------------------------------------------
  function toast(message, type = 'success') {
    const container = document.getElementById('toast-container');
    const colors = {
      success: 'bg-green-600',
      error: 'bg-red-600',
      info: 'bg-club-yellow',
    };
    const el = document.createElement('div');
    el.className = `${colors[type] || colors.info} ${type === 'info' ? 'text-club-black' : 'text-white'} px-4 py-3 rounded-lg shadow-lg text-sm font-medium transform transition-all duration-300 translate-x-full opacity-0`;
    el.textContent = message;
    container.appendChild(el);
    requestAnimationFrame(() => {
      el.classList.remove('translate-x-full', 'opacity-0');
    });
    setTimeout(() => {
      el.classList.add('translate-x-full', 'opacity-0');
      setTimeout(() => el.remove(), 300);
    }, 3000);
  }

  // ---------------------------------------------------------------------------
  // Modal
  // ---------------------------------------------------------------------------
  function openModal(html, { wide = false } = {}) {
    const content = document.getElementById('modal-content');
    content.classList.toggle('max-w-lg', !wide);
    content.classList.toggle('max-w-3xl', wide);
    content.innerHTML = html;
    document.getElementById('modal-backdrop').classList.remove('hidden');
    document.body.style.overflow = 'hidden';
  }

  function closeModal() {
    document.getElementById('modal-backdrop').classList.add('hidden');
    document.body.style.overflow = '';
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------
  function formatDate(d) {
    if (!d) return '';
    return new Date(d).toLocaleDateString('sv-SE');
  }

  function formatTime(d) {
    if (!d) return '';
    return new Date(d.replace(' ', 'T')).toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' });
  }

  function formatDateTime(d) {
    if (!d) return '';
    return formatDate(d) + ' ' + formatTime(d);
  }

  function statusBadge(status) {
    const map = {
      planned: ['Planerad', 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200'],
      assigned: ['Tilldelad', 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200'],
      done: ['Klar', 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'],
      cancelled: ['Inställd', 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300'],
      accepted: ['Accepterad', 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'],
      declined: ['Nekad', 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'],
    };
    const [label, cls] = map[status] || [status, 'bg-gray-100 text-gray-800'];
    return `<span class="badge ${cls}">${label}</span>`;
  }

  function escHtml(str) {
    return String(str ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  function safeColor(c) {
    return /^#[0-9a-fA-F]{6}$/.test(c || '') ? c : '#6b7280';
  }

  // ---------------------------------------------------------------------------
  // Dark mode
  // ---------------------------------------------------------------------------
  function initDarkMode() {
    const saved = localStorage.getItem('darkMode');
    if (saved === 'true' || (!saved && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
      document.documentElement.classList.add('dark');
    }
  }

  function toggleDarkMode() {
    document.documentElement.classList.toggle('dark');
    localStorage.setItem('darkMode', document.documentElement.classList.contains('dark'));
  }

  // ---------------------------------------------------------------------------
  // Auth
  // ---------------------------------------------------------------------------
  async function checkAuth() {
    try {
      const data = await api('/api/auth/me');
      if (data?.user) {
        currentUser = data.user;
      }
    } catch {
      currentUser = null;
    }
    render();
  }

  async function handleLogin(e) {
    e.preventDefault();
    const email = document.getElementById('login-email').value;
    const password = document.getElementById('login-password').value;
    const errEl = document.getElementById('login-error');
    const spinner = document.getElementById('login-spinner');
    const btnText = document.getElementById('login-btn-text');

    errEl.classList.add('hidden');
    spinner.classList.remove('hidden');
    btnText.textContent = 'Loggar in...';

    try {
      const data = await api('/api/auth/login', { method: 'POST', body: { email, password } });
      if (data?.user) {
        currentUser = data.user;
        toast('Välkommen, ' + currentUser.name + '!');
        render();
      }
    } catch (err) {
      errEl.textContent = err.message;
      errEl.classList.remove('hidden');
    } finally {
      spinner.classList.add('hidden');
      btnText.textContent = 'Logga in';
    }
  }

  async function handleLogout() {
    await api('/api/auth/logout', { method: 'POST' });
    currentUser = null;
    toast('Du har loggats ut', 'info');
    render();
  }

  // ---------------------------------------------------------------------------
  // Navigation & Render
  // ---------------------------------------------------------------------------
  function navigate(page) {
    currentPage = page;
    renderPage();
    closeSidebar();

    document.querySelectorAll('.nav-link').forEach((l) => {
      l.classList.toggle('bg-yellow-50', l.dataset.page === page);
      l.classList.toggle('dark:bg-club-black', l.dataset.page === page);
      l.classList.toggle('text-club-black', l.dataset.page === page);
      l.classList.toggle('dark:text-club-yellow', l.dataset.page === page);
    });
  }

  function render() {
    const loginPage = document.getElementById('login-page');
    const appShell = document.getElementById('app-shell');

    if (!currentUser) {
      loginPage.classList.remove('hidden');
      appShell.classList.add('hidden');
      return;
    }

    loginPage.classList.add('hidden');
    appShell.classList.remove('hidden');

    document.getElementById('user-avatar').textContent = currentUser.name.charAt(0).toUpperCase();
    document.getElementById('user-name').textContent = currentUser.name;
    document.getElementById('user-role-badge').textContent = currentUser.role === 'admin' ? 'Administratör' : 'Användare';

    document.querySelectorAll('.admin-only').forEach((el) => {
      el.classList.toggle('hidden', currentUser.role !== 'admin');
    });

    navigate(currentPage);
  }

  // Sidebar mobile
  function openSidebar() {
    document.getElementById('sidebar').classList.remove('-translate-x-full');
    document.getElementById('sidebar-overlay').classList.remove('hidden');
  }

  function closeSidebar() {
    document.getElementById('sidebar').classList.add('-translate-x-full');
    document.getElementById('sidebar-overlay').classList.add('hidden');
  }

  // ---------------------------------------------------------------------------
  // Page Router
  // ---------------------------------------------------------------------------
  function renderPage() {
    const el = document.getElementById('main-content');
    el.innerHTML = '<div class="flex items-center justify-center h-64"><svg class="animate-spin h-8 w-8 text-club-yellow" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path></svg></div>';

    switch (currentPage) {
      case 'dashboard': renderDashboard(); break;
      case 'calendar': renderCalendar(); break;
      case 'tasks': renderTasks(); break;
      case 'people': renderPeople(); break;
      case 'templates': renderTemplates(); break;
      case 'statistics': renderStatistics(); break;
      case 'my-tasks': renderMyTasks(); break;
      case 'audit': renderAudit(); break;
      default: renderDashboard();
    }
  }

  // ---------------------------------------------------------------------------
  // ADMIN OVERVIEW: staffing for everyone in a period
  // ---------------------------------------------------------------------------
  const OV_RANGES = [
    ['week', 'Denna vecka'],
    ['14d', '2 veckor'],
    ['month', 'Denna månad'],
    ['30d', '30 dagar'],
    ['custom', 'Välj datum'],
  ];
  const ov = { range: '14d', from: null, to: null, onlyOpen: false, cat: '', q: '', data: null };
  try { Object.assign(ov, JSON.parse(localStorage.getItem('fvOverview') || '{}'), { data: null }); } catch { /* ignore */ }

  function ovSave() {
    try { localStorage.setItem('fvOverview', JSON.stringify({ range: ov.range, from: ov.from, to: ov.to, onlyOpen: ov.onlyOpen, cat: ov.cat })); } catch { /* ignore */ }
  }

  function ovPeriod() {
    const today = new Date();
    const start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    let from = new Date(start);
    let to = new Date(start);
    if (ov.range === 'week') {
      from.setDate(start.getDate() - ((start.getDay() + 6) % 7));
      to = new Date(from); to.setDate(from.getDate() + 6);
    } else if (ov.range === 'month') {
      from = new Date(start.getFullYear(), start.getMonth(), 1);
      to = new Date(start.getFullYear(), start.getMonth() + 1, 0);
    } else if (ov.range === '30d') {
      to.setDate(start.getDate() + 29);
    } else if (ov.range === 'custom' && ov.from && ov.to) {
      return { from: ov.from, to: ov.to };
    } else {
      to.setDate(start.getDate() + 13);
    }
    return { from: localDate(from), to: localDate(to) };
  }

  async function renderOverview() {
    const el = document.getElementById('main-content');
    const { from, to } = ovPeriod();
    try {
      ov.data = await api(`/api/overview?from=${from}&to=${to}`);
    } catch (err) {
      el.innerHTML = `<p class="text-red-500">Kunde inte ladda översikten: ${escHtml(err.message)}</p>`;
      return;
    }
    if (!ov.data) return;
    const cats = [...new Map(ov.data.tasks.filter(t => t.category_id).map(t => [t.category_id, t.category_name])).entries()];

    el.innerHTML = `
      <div class="flex flex-col lg:flex-row lg:items-end justify-between gap-4 mb-6">
        <div>
          <h2 class="text-2xl font-bold mb-1">Bemanningsöversikt</h2>
          <p class="text-gray-500 dark:text-gray-400">${formatDate(from)} – ${formatDate(to)} · alla pass och alla personer</p>
        </div>
        <div class="flex flex-wrap items-center gap-2">
          <div class="flex items-center bg-gray-100 dark:bg-gray-700 rounded-lg p-0.5 max-w-full overflow-x-auto">
            ${OV_RANGES.map(([k, l]) => `<button class="px-3 py-1.5 text-sm rounded-md font-medium whitespace-nowrap ${ov.range === k ? 'bg-white dark:bg-gray-600 shadow-sm' : 'text-gray-600 dark:text-gray-300'}" onclick="window.FV.ovSetRange('${k}')">${l}</button>`).join('')}
          </div>
          ${ov.range === 'custom' ? `
            <input type="date" class="input w-auto py-1.5" id="ov-from" value="${from}">
            <span class="text-gray-400">–</span>
            <input type="date" class="input w-auto py-1.5" id="ov-to" value="${to}">
            <button class="btn-secondary btn-sm" onclick="window.FV.ovApplyCustom()">Visa</button>` : ''}
        </div>
      </div>

      <div id="ov-stats" class="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-6"></div>

      <div class="grid xl:grid-cols-3 gap-6">
        <div class="xl:col-span-2 space-y-4">
          <div class="card p-3 flex flex-col sm:flex-row gap-2 sm:items-center">
            <input type="text" id="ov-q" class="input sm:max-w-xs" placeholder="Sök person eller pass…" value="${escHtml(ov.q)}" oninput="window.FV.ovFilter()">
            <select id="ov-cat" class="input sm:max-w-[180px]" onchange="window.FV.ovFilter()">
              <option value="">Alla kategorier</option>
              ${cats.map(([id, name]) => `<option value="${id}" ${String(ov.cat) === String(id) ? 'selected' : ''}>${escHtml(name)}</option>`).join('')}
            </select>
            <label class="flex items-center gap-2 text-sm sm:ml-2 whitespace-nowrap">
              <input type="checkbox" id="ov-open" class="rounded" ${ov.onlyOpen ? 'checked' : ''} onchange="window.FV.ovFilter()"> Bara ofullständiga
            </label>
            <span class="flex-1"></span>
            <button class="btn-secondary btn-sm whitespace-nowrap" onclick="window.FV.ovAutoAssign()">⚡ Fördela perioden</button>
          </div>
          <div id="ov-board" class="space-y-4"></div>
        </div>

        <div class="space-y-6">
          <div class="card p-5" id="ov-attention"></div>
          <div class="card p-5" id="ov-people"></div>
        </div>
      </div>
    `;
    ovFilter();
  }

  function ovTaskState(t) {
    if (t.status === 'cancelled') return 'cancelled';
    if (t.overbooked) return 'over';
    if (t.slots > 0 && t.missing === t.slots) return 'empty';
    if (t.missing > 0 || t.driver_missing) return 'partial';
    if (t.slots === 0 && t.filled === 0) return 'empty';
    return 'full';
  }

  const OV_STYLE = {
    full: ['border-l-green-500', 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200', 'Fullt'],
    partial: ['border-l-amber-500', 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200', 'Saknas'],
    empty: ['border-l-red-500', 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200', 'Tomt'],
    over: ['border-l-purple-500', 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200', 'Överbokat'],
    cancelled: ['border-l-gray-300', 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300', 'Inställt'],
  };

  function ovSpotChip(sp, q) {
    const hit = q && sp.user_name && sp.user_name.toLowerCase().includes(q);
    const base = 'inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs';
    const ring = hit ? ' ring-2 ring-club-yellow' : '';
    const label = sp.skoter ? '🛷 ' : '';
    if (!sp.user_name) {
      return `<span class="${base} border border-dashed ${sp.skoter ? 'border-blue-300 text-blue-600 dark:text-blue-300' : 'border-gray-300 dark:border-gray-600 text-gray-400'}">${label}${sp.skoter ? 'Skoterförare saknas' : 'Ledig'}</span>`;
    }
    const warn = sp.skoter && !sp.has_skoterkort ? ' <span title="Har inte skoterkort">⚠️</span>' : '';
    const st = sp.status === 'accepted' ? ' ✓' : sp.status === 'done' ? ' ✔' : '';
    return `<span class="${base}${ring} ${sp.skoter ? 'bg-blue-50 text-blue-800 dark:bg-blue-900/40 dark:text-blue-200' : 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200'}" title="${sp.skoter ? 'Skoterförare' : 'Plats'}${sp.status ? ' · ' + sp.status : ''}">${label}${escHtml(sp.user_name)}${st}${warn}</span>`;
  }

  function ovFilter() {
    const data = ov.data;
    if (!data) return;
    ov.q = (document.getElementById('ov-q')?.value || '').trim();
    ov.cat = document.getElementById('ov-cat')?.value || '';
    ov.onlyOpen = !!document.getElementById('ov-open')?.checked;
    ovSave();
    const q = ov.q.toLowerCase();

    // Stats always over the whole period (not the filter)
    const live = data.tasks.filter(t => t.status !== 'cancelled');
    const totalSpots = live.reduce((s, t) => s + (t.slots || 0), 0);
    const filledSpots = live.reduce((s, t) => s + Math.min(t.filled, t.slots || t.filled), 0);
    const missingTasks = live.filter(t => !t.past && (t.missing > 0 || t.driver_missing));
    const pct = totalSpots ? Math.round(filledSpots / totalSpots * 100) : 100;
    const stat = (label, value, cls = '', sub = '') => `
      <div class="card p-4">
        <p class="text-xs text-gray-500 dark:text-gray-400">${label}</p>
        <p class="text-2xl font-bold mt-0.5 ${cls}">${value}</p>
        ${sub ? `<p class="text-xs text-gray-400 mt-0.5">${sub}</p>` : ''}
      </div>`;
    document.getElementById('ov-stats').innerHTML = [
      stat('Pass i perioden', live.length),
      stat('Bemannade platser', `${filledSpots}/${totalSpots}`, pct === 100 ? 'text-green-600 dark:text-green-400' : 'text-club-yellow dark:text-yellow-400',
        `<span class="inline-block w-full h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden align-middle"><span class="block h-1.5 ${pct === 100 ? 'bg-green-500' : 'bg-club-yellow'}" style="width:${pct}%"></span></span> ${pct} %`),
      stat('Pass som saknar folk', missingTasks.filter(t => t.missing > 0).length, missingTasks.some(t => t.missing > 0) ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400'),
      stat('Saknar skoterförare', live.filter(t => !t.past && t.driver_missing).length, live.some(t => !t.past && t.driver_missing) ? 'text-blue-600 dark:text-blue-400' : 'text-green-600 dark:text-green-400'),
      stat('Överbokade', live.filter(t => t.overbooked).length, live.some(t => t.overbooked) ? 'text-purple-600 dark:text-purple-400' : ''),
    ].join('');

    // Board, filtered, grouped per day
    let tasks = data.tasks;
    if (ov.cat) tasks = tasks.filter(t => String(t.category_id) === String(ov.cat));
    if (ov.onlyOpen) tasks = tasks.filter(t => ['partial', 'empty', 'over'].includes(ovTaskState(t)));
    if (q) tasks = tasks.filter(t => t.title.toLowerCase().includes(q) || t.spots.some(s => (s.user_name || '').toLowerCase().includes(q)));
    const days = {};
    for (const t of tasks) (days[t.start_datetime.slice(0, 10)] ||= []).push(t);
    const dayName = d => new Date(d + 'T12:00').toLocaleDateString('sv-SE', { weekday: 'long', day: 'numeric', month: 'long' });

    document.getElementById('ov-board').innerHTML = Object.keys(days).length === 0
      ? `<div class="card p-10 text-center text-gray-400">${data.tasks.length ? 'Inga pass matchar filtret' : 'Inga pass i perioden'}</div>`
      : Object.entries(days).map(([day, list]) => {
        const dayMissing = list.reduce((s, t) => s + (t.status === 'cancelled' ? 0 : t.missing), 0);
        const dayOver = list.filter(t => t.status !== 'cancelled' && t.overbooked).length;
        return `
        <div class="card overflow-hidden">
          <div class="px-4 py-2 bg-gray-50 dark:bg-gray-700/40 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
            <span class="text-sm font-semibold capitalize">${dayName(day)}</span>
            <span class="text-xs ${dayMissing ? 'text-red-600 dark:text-red-400 font-medium' : dayOver ? 'text-purple-600 dark:text-purple-400 font-medium' : 'text-green-600 dark:text-green-400'}">${[dayMissing ? `${dayMissing} plats${dayMissing > 1 ? 'er' : ''} saknas` : '', dayOver ? `${dayOver} överbokat` : ''].filter(Boolean).join(' · ') || '✓ allt bemannat'}</span>
          </div>
          <div class="divide-y divide-gray-100 dark:divide-gray-700/60">
            ${list.map(t => {
              const state = ovTaskState(t);
              const [border, badge, label] = OV_STYLE[state];
              return `
              <div class="px-4 py-3 border-l-4 ${border} hover:bg-gray-50 dark:hover:bg-gray-700/30 cursor-pointer ${t.past ? 'opacity-60' : ''}" onclick="window.FV.showTaskDetail(${t.id})">
                <div class="flex items-start justify-between gap-3">
                  <div class="min-w-0">
                    <div class="flex items-center gap-2 flex-wrap">
                      <span class="w-2 h-2 rounded-full flex-shrink-0" style="background:${safeColor(t.category_color)}"></span>
                      <span class="font-medium text-sm">${escHtml(t.title)}</span>
                      <span class="text-xs text-gray-500 dark:text-gray-400">${formatTime(t.start_datetime)}–${formatTime(t.end_datetime)}${t.location ? ' · ' + escHtml(t.location) : ''}</span>
                    </div>
                    <div class="flex flex-wrap gap-1.5 mt-2">
                      ${t.spots.length ? t.spots.map(sp => ovSpotChip(sp, q)).join('') : '<span class="text-xs text-gray-400">Ingen anmäld</span>'}
                      ${t.declined.length ? `<span class="text-xs text-gray-400 self-center" title="Har nekat">· nekat: ${escHtml(t.declined.join(', '))}</span>` : ''}
                    </div>
                  </div>
                  <div class="flex flex-col items-end gap-1 flex-shrink-0">
                    <span class="badge ${badge} text-[11px]">${label}</span>
                    ${t.slots > 0 ? `<span class="text-xs text-gray-500">${t.filled}/${t.slots}</span>` : ''}
                  </div>
                </div>
              </div>`;
            }).join('')}
          </div>
        </div>`;
      }).join('');

    // Needs attention (upcoming, not full)
    const urgent = missingTasks.sort((a, b) => a.start_datetime.localeCompare(b.start_datetime));
    document.getElementById('ov-attention').innerHTML = `
      <h3 class="font-semibold mb-3">Behöver åtgärd <span class="text-sm font-normal text-gray-400">(${urgent.length})</span></h3>
      ${urgent.length === 0 ? '<p class="text-sm text-green-600 dark:text-green-400">✓ Alla kommande pass i perioden är bemannade.</p>' : `
        <ul class="space-y-1.5 max-h-80 overflow-y-auto -mx-2">
          ${urgent.slice(0, 50).map(t => `
            <li class="px-2 py-1.5 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700/40 cursor-pointer flex items-center justify-between gap-2" onclick="window.FV.showTaskDetail(${t.id})">
              <span class="min-w-0">
                <span class="text-sm font-medium block truncate">${escHtml(t.title)}</span>
                <span class="text-xs text-gray-500">${formatDateTime(t.start_datetime)}</span>
              </span>
              <span class="flex flex-col items-end text-xs flex-shrink-0">
                ${t.missing ? `<span class="text-red-600 dark:text-red-400 font-medium">${t.missing} saknas</span>` : ''}
                ${t.driver_missing ? '<span class="text-blue-600 dark:text-blue-400">🛷 skoterförare</span>' : ''}
              </span>
            </li>`).join('')}
        </ul>
        ${urgent.length > 50 ? `<p class="text-xs text-gray-400 mt-2">… och ${urgent.length - 50} till</p>` : ''}`}
    `;

    // People load in the period
    const people = [...data.people].sort((a, b) => a.count - b.count || a.name.localeCompare(b.name, 'sv'));
    const max = Math.max(1, ...people.map(p => p.count));
    const zero = people.filter(p => p.count === 0).length;
    document.getElementById('ov-people').innerHTML = `
      <h3 class="font-semibold mb-1">Pass per person</h3>
      <p class="text-xs text-gray-500 dark:text-gray-400 mb-3">I perioden · färst först${zero ? ` · <span class="text-red-600 dark:text-red-400">${zero} utan pass</span>` : ''}</p>
      <ul class="space-y-1.5 max-h-96 overflow-y-auto overflow-x-hidden">
        ${people.map(p => `
          <li class="flex items-center gap-2 text-sm cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/40 rounded px-1 -mx-1" onclick="window.FV.ovSearchPerson(${JSON.stringify(p.name).replace(/"/g, '&quot;')})" title="Visa ${escHtml(p.name)}s pass">
            <span class="w-32 truncate ${p.count === 0 ? 'text-red-600 dark:text-red-400' : ''}">${escHtml(p.name)}${p.skoterkort ? ' 🛷' : ''}</span>
            <span class="flex-1 h-2 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden"><span class="block h-2 ${p.count === 0 ? '' : 'bg-club-yellow'}" style="width:${Math.round(p.count / max * 100)}%"></span></span>
            <span class="w-6 text-right text-xs font-medium">${p.count}</span>
          </li>`).join('')}
      </ul>
    `;
  }

  function ovSetRange(r) { ov.range = r; if (r === 'custom' && !ov.from) Object.assign(ov, ovPeriod(), { range: 'custom' }); ovSave(); renderOverview(); }
  function ovApplyCustom() {
    const f = document.getElementById('ov-from').value;
    const t = document.getElementById('ov-to').value;
    if (!f || !t || t < f) { toast('Välj ett giltigt datumintervall', 'error'); return; }
    Object.assign(ov, { from: f, to: t }); ovSave(); renderOverview();
  }
  function ovSearchPerson(name) {
    const el = document.getElementById('ov-q');
    el.value = el.value === name ? '' : name;
    // Show all of the person's sessions, not only incomplete ones.
    const open = document.getElementById('ov-open');
    if (el.value && open) open.checked = false;
    ovFilter();
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
  function ovAutoAssign() {
    const { from, to } = ovPeriod();
    aa = Object.assign(aa || {}, { from, to });
    if (!aa.user_ids) aa.user_ids = (ov.data?.people || []).map(p => p.id);
    if (aa.max_per_day === undefined) aa.max_per_day = true;
    openAutoAssign();
  }

  // ---------------------------------------------------------------------------
  // DASHBOARD
  // ---------------------------------------------------------------------------
  async function renderDashboard() {
    if (currentUser.role === 'admin') return renderOverview();
    const el = document.getElementById('main-content');
    try {
      const now = new Date();
      const day = now.getDay();
      const diff = day === 0 ? -6 : 1 - day;
      const weekStart = new Date(now);
      weekStart.setDate(now.getDate() + diff);
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekStart.getDate() + 6);

      const [stats, tasks, weekTasks] = await Promise.all([
        api('/api/tasks/stats'),
        api('/api/tasks?status=planned'),
        api(`/api/tasks/calendar?from=${localDate(weekStart)}&to=${localDate(weekEnd)}`),
      ]);

      const upcomingTasks = (weekTasks || [])
        .filter(t => t.status !== 'cancelled' && t.status !== 'done')
        .sort((a, b) => (a.start_datetime || '').localeCompare(b.start_datetime || ''));

      el.innerHTML = `
        <div class="mb-8">
          <h2 class="text-2xl font-bold mb-1">Dashboard</h2>
          <p class="text-gray-500 dark:text-gray-400">Översikt över föreningens uppgifter</p>
        </div>

        <!-- Stats -->
        <div class="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <div class="card p-5">
            <p class="text-sm text-gray-500 dark:text-gray-400">Denna vecka</p>
            <p class="text-3xl font-bold mt-1 text-club-yellow dark:text-yellow-400">${stats?.thisWeek ?? 0}</p>
          </div>
          <div class="card p-5">
            <p class="text-sm text-gray-500 dark:text-gray-400">Ej tilldelade</p>
            <p class="text-3xl font-bold mt-1 text-yellow-600 dark:text-yellow-400">${stats?.unassigned ?? 0}</p>
          </div>
          <div class="card p-5">
            <p class="text-sm text-gray-500 dark:text-gray-400">Slutförda</p>
            <p class="text-3xl font-bold mt-1 text-green-600 dark:text-green-400">${stats?.completed ?? 0}</p>
          </div>
          <div class="card p-5">
            <p class="text-sm text-gray-500 dark:text-gray-400">Totalt</p>
            <p class="text-3xl font-bold mt-1">${stats?.total ?? 0}</p>
          </div>
        </div>

        <div class="grid lg:grid-cols-2 gap-6">
          <!-- Quick Actions -->
          <div class="card p-6">
            <h3 class="font-semibold text-lg mb-4">Snabbåtgärder</h3>
            <div class="grid grid-cols-2 gap-3">
              ${currentUser.role === 'admin' ? `
                <button onclick="window.FV.navigate('tasks'); setTimeout(() => window.FV.openTaskModal(), 100)" class="btn-primary">+ Ny uppgift</button>
                <button onclick="window.FV.navigate('people'); setTimeout(() => window.FV.openPersonModal(), 100)" class="btn-secondary">+ Ny person</button>
              ` : ''}
              <button onclick="window.FV.navigate('calendar')" class="btn-secondary">Kalender</button>
              <button onclick="window.FV.navigate('my-tasks')" class="btn-secondary">Mina uppgifter</button>
            </div>
          </div>

          <!-- Upcoming Tasks -->
          <div class="card p-6">
            <h3 class="font-semibold text-lg mb-4">Kommande uppgifter</h3>
            ${upcomingTasks.length === 0
              ? '<p class="text-gray-400 text-sm">Inga kommande uppgifter</p>'
              : `<div class="space-y-3">${upcomingTasks.map(t => `
                  <div class="flex items-center justify-between cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/50 -mx-2 px-2 py-1.5 rounded-lg" onclick="window.FV.showTaskDetail(${t.id})">
                    <div class="flex items-center gap-3 min-w-0">
                      <div class="w-2 h-2 rounded-full flex-shrink-0" style="background:${safeColor(t.category_color)}"></div>
                      <div class="min-w-0">
                        <p class="text-sm font-medium truncate">${escHtml(t.title)}</p>
                        <p class="text-xs text-gray-500 dark:text-gray-400">${formatDateTime(t.start_datetime)}</p>
                      </div>
                    </div>
                    ${statusBadge(t.status)}
                  </div>
                `).join('')}</div>`
            }
          </div>
        </div>
      `;
    } catch (err) {
      el.innerHTML = `<p class="text-red-500">Kunde inte ladda dashboard: ${escHtml(err.message)}</p>`;
    }
  }

  // ---------------------------------------------------------------------------
  // CALENDAR
  // ---------------------------------------------------------------------------
  async function renderCalendar() {
    const el = document.getElementById('main-content');

    const monthNames = ['Januari', 'Februari', 'Mars', 'April', 'Maj', 'Juni',
      'Juli', 'Augusti', 'September', 'Oktober', 'November', 'December'];
    const dayNames = ['Mån', 'Tis', 'Ons', 'Tor', 'Fre', 'Lör', 'Sön'];

    el.innerHTML = `
      <div class="flex flex-col sm:flex-row sm:items-center justify-between mb-6 gap-4">
        <h2 class="text-2xl font-bold">Kalender</h2>
        <div class="flex items-center gap-2">
          <div class="flex items-center bg-gray-100 dark:bg-gray-700 rounded-lg p-0.5">
            <button id="cal-view-month" class="px-3 py-1.5 text-sm rounded-md font-medium transition-colors ${calendarView === 'month' ? 'bg-white dark:bg-gray-600 shadow-sm' : ''}" onclick="window.FV.setCalView('month')">Månad</button>
            <button id="cal-view-week" class="px-3 py-1.5 text-sm rounded-md font-medium transition-colors ${calendarView === 'week' ? 'bg-white dark:bg-gray-600 shadow-sm' : ''}" onclick="window.FV.setCalView('week')">Vecka</button>
          </div>
          <button class="btn-secondary btn-sm" onclick="window.FV.calPrev()">◀</button>
          <button class="btn-secondary btn-sm" onclick="window.FV.calToday()">Idag</button>
          <button class="btn-secondary btn-sm" onclick="window.FV.calNext()">▶</button>
        </div>
      </div>
      <div id="calendar-body" class="card overflow-hidden"></div>
    `;

    await renderCalendarBody();
  }

  async function renderCalendarBody() {
    const body = document.getElementById('calendar-body');
    if (!body) return;

    const year = calendarDate.getFullYear();
    const month = calendarDate.getMonth();

    if (calendarView === 'month') {
      await renderMonthView(body, year, month);
    } else {
      await renderWeekView(body);
    }
  }

  async function renderMonthView(body, year, month) {
    const monthNames = ['Januari', 'Februari', 'Mars', 'April', 'Maj', 'Juni',
      'Juli', 'Augusti', 'September', 'Oktober', 'November', 'December'];
    const dayNames = ['Mån', 'Tis', 'Ons', 'Tor', 'Fre', 'Lör', 'Sön'];

    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    let startWeekday = firstDay.getDay() - 1;
    if (startWeekday < 0) startWeekday = 6;

    const from = new Date(year, month, 1 - startWeekday);
    const to = new Date(lastDay);
    to.setDate(to.getDate() + (7 - to.getDay()));

    let tasks = [];
    try {
      tasks = await api(`/api/tasks/calendar?from=${localDate(from)}&to=${localDate(to)}`) || [];
    } catch { /* empty */ }

    const taskMap = {};
    for (const t of tasks) {
      const key = t.start_datetime.slice(0, 10);
      if (!taskMap[key]) taskMap[key] = [];
      taskMap[key].push(t);
    }

    const today = localDate(new Date());

    let html = `
      <div class="p-4 text-center font-semibold text-lg">${monthNames[month]} ${year}</div>
      <div class="grid grid-cols-7 border-t border-gray-200 dark:border-gray-700">
        ${dayNames.map(d => `<div class="p-2 text-center text-xs font-medium text-gray-500 dark:text-gray-400 border-b border-gray-200 dark:border-gray-700">${d}</div>`).join('')}
    `;

    const current = new Date(from);
    while (current <= to || current.getDay() !== 1) {
      const dateKey = localDate(current);
      const isCurrentMonth = current.getMonth() === month;
      const isToday = dateKey === today;
      const dayTasks = taskMap[dateKey] || [];

      html += `
        <div class="min-h-[80px] lg:min-h-[100px] p-1.5 border-b border-r border-gray-200 dark:border-gray-700 ${!isCurrentMonth ? 'bg-gray-50 dark:bg-gray-900/50' : ''} cursor-pointer hover:bg-yellow-50/50 dark:hover:bg-club-black/50" onclick="window.FV.showDayTasks('${dateKey}')">
          <div class="text-xs mb-1 ${isToday ? 'bg-club-yellow text-club-black w-6 h-6 rounded-full flex items-center justify-center font-bold' : isCurrentMonth ? 'text-gray-700 dark:text-gray-300' : 'text-gray-400 dark:text-gray-600'}">${current.getDate()}</div>
          ${dayTasks.slice(0, 3).map(t => {
            const n = (t.assigned_names || []).length;
            const s = t.slots || 0;
            const sc = s > 0 ? (n >= s ? 'color:#16a34a' : n > 0 ? 'color:#ea580c' : 'color:#ef4444') : '';
            return `<div class="text-xs truncate px-1 py-0.5 mb-0.5 rounded flex items-center justify-between gap-0.5" style="background:${safeColor(t.category_color)}22;border-left:2px solid ${safeColor(t.category_color)}" onclick="event.stopPropagation(); window.FV.showTaskDetail(${t.id})"><span class="truncate" style="color:${safeColor(t.category_color)}">${t.skoterkort_slots > 0 ? '🛷 ' : ''}${escHtml(t.title)}</span>${s > 0 ? `<span class="flex-shrink-0 font-bold text-[10px]" style="${sc}">${n}/${s}</span>` : ''}</div>`;
          }).join('')}
          ${dayTasks.length > 3 ? `<div class="text-xs text-gray-500 px-1">+${dayTasks.length - 3} till</div>` : ''}
        </div>
      `;

      current.setDate(current.getDate() + 1);
      if (current > to && current.getDay() === 1) break;
    }

    html += '</div>';
    body.innerHTML = html;
  }

  async function renderWeekView(body) {
    const dayNames = ['Måndag', 'Tisdag', 'Onsdag', 'Torsdag', 'Fredag', 'Lördag', 'Söndag'];
    const start = new Date(calendarDate);
    const day = start.getDay();
    const diff = day === 0 ? -6 : 1 - day;
    start.setDate(start.getDate() + diff);

    const end = new Date(start);
    end.setDate(start.getDate() + 6);

    let tasks = [];
    try {
      tasks = await api(`/api/tasks/calendar?from=${localDate(start)}&to=${localDate(end)}`) || [];
    } catch { /* empty */ }

    const today = localDate(new Date());
    const weekNum = getWeekNumber(start);

    let html = `<div class="p-4 text-center font-semibold text-lg">Vecka ${weekNum}, ${start.getFullYear()}</div>`;
    html += '<div class="divide-y divide-gray-200 dark:divide-gray-700">';

    for (let i = 0; i < 7; i++) {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      const dateKey = localDate(d);
      const dayTasks = tasks.filter(t => t.start_datetime.slice(0, 10) === dateKey);
      const isToday = dateKey === today;

      html += `
        <div class="p-4 ${isToday ? 'bg-yellow-50/50 dark:bg-club-black/30' : ''}">
          <div class="flex items-center gap-2 mb-2">
            <span class="font-medium ${isToday ? 'text-club-yellow dark:text-yellow-400' : ''}">${dayNames[i]}</span>
            <span class="text-sm text-gray-500">${d.getDate()}/${d.getMonth() + 1}</span>
            ${isToday ? '<span class="badge bg-yellow-100 text-club-black dark:bg-club-black dark:text-club-yellow">Idag</span>' : ''}
          </div>
          ${dayTasks.length === 0
            ? '<p class="text-sm text-gray-400 ml-4">Inga uppgifter</p>'
            : dayTasks.map(t => {
                const n = (t.assigned_names || []).length;
                const s = t.slots || 0;
                const slotCls = s > 0 ? (n >= s ? 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300' : n > 0 ? 'bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300' : 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300') : '';
                const slotHtml = s > 0 ? '<span class="badge ' + slotCls + ' text-[10px] font-bold">' + n + '/' + s + '</span>' : '';
                return '<div class="ml-4 mb-2 flex items-start gap-3 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700/50 p-2 rounded-lg -ml-0" onclick="window.FV.showTaskDetail(' + t.id + ')">' +
                  '<div class="w-3 h-3 rounded-full mt-1 flex-shrink-0" style="background:' + safeColor(t.category_color) + '"></div>' +
                  '<div class="flex-1 min-w-0">' +
                  '<div class="flex items-center gap-2 flex-wrap"><p class="text-sm font-medium">' + escHtml(t.title) + '</p>' + slotHtml + '</div>' +
                  '<p class="text-xs text-gray-500">' + formatTime(t.start_datetime) + ' – ' + formatTime(t.end_datetime) + (t.location ? ' · ' + escHtml(t.location) : '') + '</p></div>' +
                  statusBadge(t.status) + '</div>';
              }).join('')}
        </div>
      `;
    }

    html += '</div>';
    body.innerHTML = html;
  }

  function getWeekNumber(d) {
    const date = new Date(d);
    date.setHours(0, 0, 0, 0);
    date.setDate(date.getDate() + 3 - ((date.getDay() + 6) % 7));
    const week1 = new Date(date.getFullYear(), 0, 4);
    return 1 + Math.round(((date - week1) / 86400000 - 3 + ((week1.getDay() + 6) % 7)) / 7);
  }

  function showDayTasks(dateKey) {
    const dateStr = new Date(dateKey).toLocaleDateString('sv-SE', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    api(`/api/tasks/calendar?from=${dateKey}&to=${dateKey} 23:59`).then(tasks => {
      openModal(`
        <div class="p-6">
          <div class="flex items-center justify-between mb-4">
            <h3 class="text-lg font-semibold capitalize">${dateStr}</h3>
            <button onclick="window.FV.closeModal()" class="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 text-xl">×</button>
          </div>
          ${!tasks || tasks.length === 0
            ? '<p class="text-gray-400">Inga uppgifter denna dag</p>'
            : `<div class="space-y-3">${tasks.map(t => `
                <div class="flex items-start gap-3 p-3 rounded-lg border border-gray-200 dark:border-gray-700 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/50" onclick="window.FV.closeModal(); window.FV.showTaskDetail(${t.id})">
                  <div class="w-3 h-3 rounded-full mt-1 flex-shrink-0" style="background:${safeColor(t.category_color)}"></div>
                  <div class="flex-1">
                    <p class="font-medium text-sm">${escHtml(t.title)}</p>
                    <p class="text-xs text-gray-500 mt-0.5">${formatTime(t.start_datetime)} – ${formatTime(t.end_datetime)}</p>
                    ${t.location ? `<p class="text-xs text-gray-500">📍 ${escHtml(t.location)}</p>` : ''}
                  </div>
                  ${statusBadge(t.status)}
                </div>
              `).join('')}</div>`
          }
        </div>
      `);
    });
  }

  // ---------------------------------------------------------------------------
  // TASKS (Admin)
  // ---------------------------------------------------------------------------
  // ---------------------------------------------------------------------------
  // Bulk selection state
  // ---------------------------------------------------------------------------
  let selectedTaskIds = new Set();

  function getSelectedCount() { return selectedTaskIds.size; }

  function updateBulkToolbar() {
    const toolbar = document.getElementById('bulk-toolbar');
    if (!toolbar) return;
    const count = getSelectedCount();
    if (count === 0) {
      toolbar.classList.add('hidden');
    } else {
      toolbar.classList.remove('hidden');
      document.getElementById('bulk-count').textContent = count;
    }
    const selectAll = document.getElementById('select-all-cb');
    if (selectAll) {
      const visible = document.querySelectorAll('.task-row-cb');
      selectAll.checked = visible.length > 0 && count >= visible.length;
      selectAll.indeterminate = count > 0 && count < visible.length;
    }
  }

  function toggleTaskSelect(taskId, checked) {
    if (checked) selectedTaskIds.add(taskId);
    else selectedTaskIds.delete(taskId);
    updateBulkToolbar();
  }

  function toggleSelectAll(checked) {
    document.querySelectorAll('.task-row-cb').forEach(cb => {
      const id = parseInt(cb.value);
      cb.checked = checked;
      if (checked) selectedTaskIds.add(id);
      else selectedTaskIds.delete(id);
    });
    updateBulkToolbar();
  }

  // Progress dialog for long-running bulk operations. Can't be closed while running.
  function progressDialog(title, total) {
    let locked = true;
    const backdrop = document.getElementById('modal-backdrop');
    const block = e => { if (locked && (e.key === 'Escape' || e.target === backdrop)) e.stopImmediatePropagation(); };
    backdrop.addEventListener('click', block, true);
    document.addEventListener('keydown', block, true);
    openModal(`
      <div class="p-6">
        <h3 class="text-lg font-semibold mb-1">${escHtml(title)}</h3>
        <p class="text-sm text-gray-500 dark:text-gray-400 mb-4" id="pg-text">Startar…</p>
        <div class="w-full h-3 rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden">
          <div id="pg-bar" class="h-3 bg-club-yellow transition-all duration-300" style="width:0%"></div>
        </div>
        <div class="flex items-center justify-between mt-2 text-xs text-gray-500 dark:text-gray-400">
          <span id="pg-count">0 av ${total}</span><span id="pg-pct">0 %</span>
        </div>
        <p id="pg-err" class="hidden text-sm text-red-600 dark:text-red-400 mt-3"></p>
        <p id="pg-hint" class="text-xs text-gray-400 mt-4">Stäng inte sidan medan det pågår.</p>
        <div id="pg-done" class="hidden mt-4"><button class="btn-primary w-full" onclick="window.FV.closeModal()">Stäng</button></div>
      </div>`);
    return {
      update(done, text) {
        const pct = total ? Math.round(done / total * 100) : 100;
        document.getElementById('pg-bar').style.width = pct + '%';
        document.getElementById('pg-count').textContent = `${done} av ${total}`;
        document.getElementById('pg-pct').textContent = pct + ' %';
        if (text) document.getElementById('pg-text').textContent = text;
      },
      error(msg) {
        const el = document.getElementById('pg-err');
        el.textContent = msg; el.classList.remove('hidden');
      },
      finish(text, ok = true) {
        locked = false;
        backdrop.removeEventListener('click', block, true);
        document.removeEventListener('keydown', block, true);
        document.getElementById('pg-text').textContent = text;
        document.getElementById('pg-bar').classList.replace('bg-club-yellow', ok ? 'bg-green-500' : 'bg-red-500');
        document.getElementById('pg-hint').classList.add('hidden');
        document.getElementById('pg-done').classList.remove('hidden');
      },
    };
  }

  async function bulkDeleteTasks() {
    const ids = [...selectedTaskIds];
    if (ids.length === 0) return;
    if (!confirm(`Vill du ta bort ${ids.length} uppgift(er)? Anmälningar till dem tas också bort.`)) return;

    const CHUNK = 25;
    const pg = progressDialog(`Tar bort ${ids.length} uppgift(er)`, ids.length);
    let done = 0;
    let deleted = 0;
    let failed = 0;
    for (let i = 0; i < ids.length; i += CHUNK) {
      const chunk = ids.slice(i, i + CHUNK);
      pg.update(done, 'Tar bort…');
      try {
        const r = await api('/api/tasks/bulk-delete', { method: 'POST', body: { ids: chunk } });
        if (!r) return; // session expired – api() has already shown the login page
        deleted += r.deleted;
        chunk.forEach(id => selectedTaskIds.delete(id));
      } catch (err) {
        failed += chunk.length;
        pg.error(`${failed} kunde inte tas bort: ${err.message}`);
      }
      done += chunk.length;
      pg.update(done);
    }
    pg.finish(failed ? `${deleted} borttagna, ${failed} misslyckades.` : `Klart! ${deleted} uppgift(er) borttagna.`, !failed);
    renderTasks();
  }

  function openBulkEditModal() {
    const ids = [...selectedTaskIds];
    if (ids.length === 0) return;
    const categories = window._allCategories || [];

    openModal(`
      <div class="p-6">
        <div class="flex items-center justify-between mb-6">
          <h3 class="text-lg font-semibold">Redigera ${ids.length} uppgift(er)</h3>
          <button onclick="window.FV.closeModal()" class="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 text-xl">&times;</button>
        </div>
        <p class="text-sm text-gray-500 dark:text-gray-400 mb-4">Lämna fält tomma för att behålla nuvarande värden.</p>
        <form id="bulk-edit-form" class="space-y-4">
          <div>
            <label class="label">Status</label>
            <select class="input" name="status">
              <option value="">— Ändra ej —</option>
              <option value="planned">Planerad</option>
              <option value="assigned">Tilldelad</option>
              <option value="done">Klar</option>
              <option value="cancelled">Inställd</option>
            </select>
          </div>
          <div>
            <label class="label">Kategori</label>
            <select class="input" name="category_id">
              <option value="">— Ändra ej —</option>
              ${categories.map(c => `<option value="${c.id}">${escHtml(c.name)}</option>`).join('')}
            </select>
          </div>
          <div>
            <label class="label">Platser (slots)</label>
            <input class="input" type="number" name="slots" min="0" placeholder="— Ändra ej —">
          </div>
          <div class="flex gap-3 pt-2">
            <button type="submit" class="btn-primary flex-1">Spara ändringar</button>
            <button type="button" class="btn-secondary" onclick="window.FV.closeModal()">Avbryt</button>
          </div>
        </form>
      </div>
    `);

    document.getElementById('bulk-edit-form').onsubmit = async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const body = {};
      if (fd.get('status')) body.status = fd.get('status');
      if (fd.get('category_id')) body.category_id = parseInt(fd.get('category_id'));
      if (fd.get('slots') !== '') body.slots = parseInt(fd.get('slots'));

      if (Object.keys(body).length === 0) {
        toast('Inga ändringar valda', 'error');
        return;
      }

      let ok = 0;
      for (const id of ids) {
        try {
          await api(`/api/tasks/${id}`, { method: 'PUT', body });
          ok++;
        } catch { /* skip */ }
      }
      selectedTaskIds.clear();
      closeModal();
      toast(`${ok} uppgift(er) uppdaterade`);
      renderTasks();
    };
  }

  async function renderTasks() {
    if (currentUser.role !== 'admin') return navigate('dashboard');
    const el = document.getElementById('main-content');

    let tasks = [];
    let categories = [];
    try {
      [tasks, categories] = await Promise.all([api('/api/tasks'), api('/api/categories')]);
    } catch (err) {
      el.innerHTML = `<p class="text-red-500">${escHtml(err.message)}</p>`;
      return;
    }

    selectedTaskIds.clear();

    el.innerHTML = `
      <div class="flex flex-col sm:flex-row sm:items-center justify-between mb-6 gap-4">
        <h2 class="text-2xl font-bold">Uppgifter</h2>
        <div class="flex gap-2">
          <button class="btn-secondary" onclick="window.FV.openAutoAssign()">⚡ Fördela pass automatiskt</button>
          <button class="btn-primary" onclick="window.FV.openTaskModal()">+ Ny uppgift</button>
        </div>
      </div>

      <!-- Bulk action toolbar -->
      <div id="bulk-toolbar" class="hidden mb-4 p-3 bg-yellow-50 dark:bg-club-black/50 border border-yellow-200 dark:border-club-yellow/50 rounded-lg flex flex-wrap items-center gap-3">
        <span class="text-sm font-medium text-club-black dark:text-club-yellow"><span id="bulk-count">0</span> markerade</span>
        <button class="btn-sm bg-club-yellow hover:bg-club-yellow-dark text-club-black px-3 py-1.5 rounded-lg text-sm font-medium" onclick="window.FV.openBulkEditModal()">Redigera valda</button>
        <button class="btn-sm bg-red-600 hover:bg-red-700 text-white px-3 py-1.5 rounded-lg text-sm font-medium" onclick="window.FV.bulkDeleteTasks()">Ta bort valda</button>
        <button class="text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 ml-auto" onclick="window.FV.clearSelection()">Avmarkera alla</button>
      </div>

      <div class="card overflow-hidden">
        <div class="p-4 border-b border-gray-200 dark:border-gray-700 flex flex-col sm:flex-row gap-3">
          <input type="text" id="task-search" class="input sm:max-w-xs" placeholder="Sök uppgifter..." oninput="window.FV.filterTasks()">
          <select id="task-filter-status" class="input sm:max-w-[150px]" onchange="window.FV.filterTasks()">
            <option value="">Alla statusar</option>
            <option value="planned">Planerad</option>
            <option value="assigned">Tilldelad</option>
            <option value="done">Klar</option>
            <option value="cancelled">Inställd</option>
          </select>
          <select id="task-filter-cat" class="input sm:max-w-[150px]" onchange="window.FV.filterTasks()">
            <option value="">Alla kategorier</option>
            ${(categories || []).map(c => `<option value="${c.id}">${escHtml(c.name)}</option>`).join('')}
          </select>
        </div>
        <div class="overflow-x-auto">
          <table class="w-full text-sm">
            <thead>
              <tr class="bg-gray-50 dark:bg-gray-700/50 text-left">
                <th class="px-3 py-3 w-10">
                  <input type="checkbox" id="select-all-cb" class="rounded border-gray-300 text-club-yellow focus:ring-club-yellow" onchange="window.FV.toggleSelectAll(this.checked)">
                </th>
                <th class="px-4 py-3 font-medium">Uppgift</th>
                <th class="px-4 py-3 font-medium hidden md:table-cell">Kategori</th>
                <th class="px-4 py-3 font-medium hidden sm:table-cell">Datum</th>
                <th class="px-4 py-3 font-medium">Status</th>
                <th class="px-4 py-3 font-medium w-20"></th>
              </tr>
            </thead>
            <tbody id="tasks-tbody" class="divide-y divide-gray-200 dark:divide-gray-700">
              ${renderTaskRows(tasks)}
            </tbody>
          </table>
        </div>
      </div>
    `;

    window._allTasks = tasks;
    window._allCategories = categories;
  }

  function renderTaskRows(tasks) {
    if (!tasks || tasks.length === 0) {
      return '<tr><td colspan="6" class="px-4 py-8 text-center text-gray-400">Inga uppgifter hittades</td></tr>';
    }
    return tasks.map(t => `
      <tr class="hover:bg-gray-50 dark:hover:bg-gray-700/30 ${selectedTaskIds.has(t.id) ? 'bg-yellow-50/50 dark:bg-club-black/30' : ''}">
        <td class="px-3 py-3" onclick="event.stopPropagation()">
          <input type="checkbox" class="task-row-cb rounded border-gray-300 text-club-yellow focus:ring-club-yellow" value="${t.id}" ${selectedTaskIds.has(t.id) ? 'checked' : ''} onchange="window.FV.toggleTaskSelect(${t.id}, this.checked)">
        </td>
        <td class="px-4 py-3 cursor-pointer" onclick="window.FV.showTaskDetail(${t.id})">
          <p class="font-medium">${escHtml(t.title)}</p>
          <p class="text-xs text-gray-500 md:hidden">${t.category_name ? escHtml(t.category_name) : ''}</p>
        </td>
        <td class="px-4 py-3 hidden md:table-cell cursor-pointer" onclick="window.FV.showTaskDetail(${t.id})">
          ${t.category_name ? `<span class="inline-flex items-center gap-1.5"><span class="w-2 h-2 rounded-full" style="background:${safeColor(t.category_color)}"></span>${escHtml(t.category_name)}</span>` : '–'}
        </td>
        <td class="px-4 py-3 text-gray-500 hidden sm:table-cell whitespace-nowrap cursor-pointer" onclick="window.FV.showTaskDetail(${t.id})">${formatDateTime(t.start_datetime)}</td>
        <td class="px-4 py-3 cursor-pointer" onclick="window.FV.showTaskDetail(${t.id})">
          <div class="flex flex-wrap items-center gap-1">
            ${statusBadge(t.status)}
            ${t.slots > 0 ? `<span class="badge bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400">${t.slots} pl</span>` : ''}
            ${t.skoterkort_slots > 0 ? `<span class="badge bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300" title="Platser som kräver skoterkort">🛷 ${t.skoterkort_slots}</span>` : ''}
          </div>
        </td>
        <td class="px-4 py-3">
          <div class="flex gap-1" onclick="event.stopPropagation()">
            <button class="p-1.5 rounded hover:bg-gray-200 dark:hover:bg-gray-600" title="Redigera" onclick="window.FV.openTaskModal(${t.id})">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>
            </button>
            <button class="p-1.5 rounded hover:bg-red-100 dark:hover:bg-red-900/30 text-red-500" title="Ta bort" onclick="window.FV.deleteTask(${t.id})">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
            </button>
          </div>
        </td>
      </tr>
    `).join('');
  }

  function clearSelection() {
    selectedTaskIds.clear();
    document.querySelectorAll('.task-row-cb').forEach(cb => cb.checked = false);
    updateBulkToolbar();
  }

  function filterTasks() {
    const search = (document.getElementById('task-search')?.value || '').toLowerCase();
    const status = document.getElementById('task-filter-status')?.value || '';
    const cat = document.getElementById('task-filter-cat')?.value || '';

    let filtered = window._allTasks || [];
    if (search) filtered = filtered.filter(t => t.title.toLowerCase().includes(search) || (t.description || '').toLowerCase().includes(search));
    if (status) filtered = filtered.filter(t => t.status === status);
    if (cat) filtered = filtered.filter(t => t.category_id == cat);

    document.getElementById('tasks-tbody').innerHTML = renderTaskRows(filtered);
    updateBulkToolbar();
  }

  async function openTaskModal(taskId) {
    let task = null;
    let categories = window._allCategories || [];
    let users = [];

    try {
      [categories, users] = await Promise.all([
        categories.length ? categories : api('/api/categories'),
        api('/api/users'),
      ]);
      if (taskId) task = await api(`/api/tasks/${taskId}`);
    } catch { /* use defaults */ }

    const isEdit = !!task;

    openModal(`
      <div class="p-6">
        <div class="flex items-center justify-between mb-6">
          <h3 class="text-lg font-semibold">${isEdit ? 'Redigera uppgift' : 'Ny uppgift'}</h3>
          <button onclick="window.FV.closeModal()" class="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 text-xl">×</button>
        </div>
        <form id="task-form" class="space-y-4">
          <div>
            <label class="label">Titel *</label>
            <input class="input" name="title" value="${isEdit ? escHtml(task.title) : ''}" required>
          </div>
          <div>
            <label class="label">Beskrivning</label>
            <textarea class="input" name="description" rows="3">${isEdit ? escHtml(task.description || '') : ''}</textarea>
          </div>
          <div class="grid grid-cols-2 gap-4">
            <div>
              <label class="label">Startdatum *</label>
              <input class="input" type="datetime-local" name="start_datetime" value="${isEdit ? task.start_datetime.replace(' ', 'T') : ''}" required>
            </div>
            <div>
              <label class="label">Slutdatum *</label>
              <input class="input" type="datetime-local" name="end_datetime" value="${isEdit ? task.end_datetime.replace(' ', 'T') : ''}" required>
            </div>
          </div>
          <div class="grid grid-cols-3 gap-4">
            <div>
              <label class="label">Plats</label>
              <input class="input" name="location" value="${isEdit ? escHtml(task.location || '') : ''}">
            </div>
            <div>
              <label class="label">Kategori</label>
              <select class="input" name="category_id">
                <option value="">Välj kategori</option>
                ${(categories || []).map(c => `<option value="${c.id}" ${isEdit && task.category_id == c.id ? 'selected' : ''}>${escHtml(c.name)}</option>`).join('')}
              </select>
            </div>
            <div>
              <label class="label">Antal platser</label>
              <input class="input" type="number" name="slots" min="0" value="${isEdit ? (task.slots || 0) : 0}" placeholder="0 = obegränsat">
              <p class="text-xs text-gray-400 mt-0.5">0 = obegränsat</p>
            </div>
          </div>
          <div>
            <label class="label">🛷 Varav platser som kräver skoterkort</label>
            <input class="input sm:w-40" type="number" name="skoterkort_slots" min="0" value="${isEdit ? (task.skoterkort_slots || 0) : 0}">
            <p class="text-xs text-gray-400 mt-0.5">T.ex. Liftvärd: 2 platser, varav 1 kräver skoterkort. 0 = ingen plats kräver skoterkort.</p>
          </div>
          ${isEdit ? `
            <div>
              <label class="label">Status</label>
              <select class="input" name="status">
                <option value="planned" ${task.status === 'planned' ? 'selected' : ''}>Planerad</option>
                <option value="assigned" ${task.status === 'assigned' ? 'selected' : ''}>Tilldelad</option>
                <option value="done" ${task.status === 'done' ? 'selected' : ''}>Klar</option>
                <option value="cancelled" ${task.status === 'cancelled' ? 'selected' : ''}>Inställd</option>
              </select>
            </div>
          ` : ''}
          <div>
            <label class="label">Tilldela personer</label>
            <div class="max-h-40 overflow-y-auto border border-gray-200 dark:border-gray-600 rounded-lg p-2 space-y-1">
              ${(users || []).map(u => {
                const assigned = isEdit && task.assignments?.some(a => a.user_id === u.id);
                return `<label class="flex items-center gap-2 p-1 rounded hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer">
                  <input type="checkbox" name="assignees" value="${u.id}" ${assigned ? 'checked' : ''} class="rounded border-gray-300 text-club-yellow focus:ring-club-yellow">
                  <span class="text-sm">${escHtml(u.name)}</span>
                  <span class="text-xs text-gray-400">${escHtml(u.email)}</span>
                </label>`;
              }).join('')}
            </div>
          </div>
          <div class="flex gap-3 pt-2">
            <button type="submit" class="btn-primary flex-1">${isEdit ? 'Spara' : 'Skapa'}</button>
            <button type="button" class="btn-secondary" onclick="window.FV.closeModal()">Avbryt</button>
          </div>
        </form>
      </div>
    `);

    document.getElementById('task-form').onsubmit = async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const body = {
        title: fd.get('title'),
        description: fd.get('description'),
        start_datetime: fd.get('start_datetime')?.replace('T', ' '),
        end_datetime: fd.get('end_datetime')?.replace('T', ' '),
        location: fd.get('location'),
        category_id: fd.get('category_id') ? parseInt(fd.get('category_id')) : null,
        slots: parseInt(fd.get('slots')) || 0,
        assignees: fd.getAll('assignees').map(Number),
        skoterkort_slots: parseInt(fd.get('skoterkort_slots')) || 0,
      };
      if (fd.get('status')) body.status = fd.get('status');

      try {
        if (isEdit) {
          await api(`/api/tasks/${task.id}`, { method: 'PUT', body });
          const before = new Set((task.assignments || []).map(a => a.user_id));
          const after = new Set(body.assignees);
          const added = body.assignees.filter(id => !before.has(id));
          const removed = [...before].filter(id => !after.has(id));
          if (added.length) await api(`/api/tasks/${task.id}/assign`, { method: 'POST', body: { user_ids: added } });
          for (const uid of removed) await api(`/api/tasks/${task.id}/assign/${uid}`, { method: 'DELETE' });
          toast(`Uppgift uppdaterad${added.length ? ` · ${added.length} tillagd(a)` : ''}${removed.length ? ` · ${removed.length} borttagen/borttagna` : ''}`);
        } else {
          await api('/api/tasks', { method: 'POST', body });
          toast('Uppgift skapad');
        }
        closeModal();
        renderTasks();
      } catch (err) {
        toast(err.message, 'error');
      }
    };
  }

  // Spots one by one (same rule as the server): skoterkort spots first, filled by holders.
  function buildSpots(task, assignments) {
    const required = task.skoterkort_slots || 0;
    const total = Math.max(task.slots || 0, assignments.length);
    const ordered = [...assignments].sort((a, b) => a.id - b.id);
    const drivers = ordered.filter(a => a.user_skoterkort).slice(0, required);
    const rest = ordered.filter(a => !drivers.includes(a));
    const spots = [];
    for (let i = 0; i < total; i++) {
      spots.push(i < required ? { skoter: true, assignment: drivers[i] || null } : { skoter: false, extra: task.slots > 0 && i >= task.slots, assignment: null });
    }
    const free = spots.filter(x => !x.skoter).concat(spots.filter(x => x.skoter && !x.assignment));
    rest.forEach((a, i) => { if (free[i]) free[i].assignment = a; });
    return spots;
  }

  function adminSpotRow(task, sp, i) {
    const a = sp.assignment;
    const label = sp.skoter
      ? '<span class="badge bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200 text-[11px] whitespace-nowrap">🛷 Skoterförare · kräver skoterkort</span>'
      : sp.extra ? '<span class="badge bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300 text-[11px]">Extra (överfullt)</span>'
      : `<span class="badge bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300 text-[11px]">Plats ${i + 1}</span>`;
    const warn = sp.skoter && a && !a.user_skoterkort ? ' <span class="text-xs text-amber-600" title="Har inte skoterkort">⚠️ saknar skoterkort</span>' : '';
    return `
      <div class="flex items-center justify-between gap-2 rounded-lg p-2 ${sp.skoter ? 'bg-blue-50/60 dark:bg-blue-900/10 border border-blue-100 dark:border-blue-900/40' : 'bg-gray-50 dark:bg-gray-700/50'}">
        <div class="flex items-center gap-2 min-w-0">
          ${a ? `<div class="w-7 h-7 bg-yellow-100 dark:bg-club-black rounded-full flex items-center justify-center text-xs font-bold text-club-yellow flex-shrink-0">${escHtml(a.user_name.charAt(0))}</div>
          <div class="min-w-0">
            <span class="text-sm font-medium">${escHtml(a.user_name)}</span>${warn}
            ${a.user_phone ? `<p class="text-xs text-gray-500 dark:text-gray-400 mt-0.5"><a href="tel:${escHtml(a.user_phone.replace(/\s/g, ''))}" class="hover:text-club-yellow">${escHtml(a.user_phone)}</a></p>` : ''}
          </div>` : '<span class="text-sm text-gray-400 italic">Ledig</span>'}
        </div>
        <div class="flex items-center gap-1.5 flex-shrink-0">${label}${a ? statusBadge(a.status) : ''}${a ? `${currentUser.role === 'admin' ? `<button class="p-1 rounded text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30" title="Ta bort ${escHtml(a.user_name)} från passet" onclick="window.FV.removeFromTask(${task.id}, ${a.user_id}, ${JSON.stringify(a.user_name).replace(/"/g, '&quot;')})">✕</button>` : ''}` : ''}</div>
      </div>`;
  }

  async function removeFromTask(taskId, userId, name) {
    if (!confirm(`Ta bort ${name} från passet? (Kan ångras i Loggen.)`)) return;
    try {
      await api(`/api/tasks/${taskId}/assign/${userId}`, { method: 'DELETE' });
      toast(`${name} borttagen från passet`);
      await showTaskDetail(taskId);
      refreshBehindModal();
    } catch (err) { toast(err.message, 'error'); }
  }

  // Re-render the page under an open dialog (e.g. overview counts after a change).
  function refreshBehindModal() {
    if (currentPage === 'dashboard' && currentUser.role === 'admin') renderOverview();
    else if (currentPage === 'tasks') renderTasks();
  }

  async function showTaskDetail(taskId) {
    try {
      const task = await api(`/api/tasks/${taskId}`);
      openModal(`
        <div class="p-6">
          <div class="flex items-center justify-between mb-4">
            <h3 class="text-lg font-semibold">${escHtml(task.title)}</h3>
            <button onclick="window.FV.closeModal()" class="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 text-xl">×</button>
          </div>
          <div class="space-y-4">
            <div class="flex flex-wrap gap-2">
              ${statusBadge(task.status)}
              ${task.category_name ? `<span class="badge" style="background:${safeColor(task.category_color)}22;color:${safeColor(task.category_color)}">${escHtml(task.category_name)}</span>` : ''}
            </div>
            ${task.description ? `<p class="text-sm text-gray-600 dark:text-gray-400">${escHtml(task.description)}</p>` : ''}
            <div class="grid grid-cols-2 gap-4 text-sm">
              <div>
                <p class="text-gray-500 dark:text-gray-400">Start</p>
                <p class="font-medium">${formatDateTime(task.start_datetime)}</p>
              </div>
              <div>
                <p class="text-gray-500 dark:text-gray-400">Slut</p>
                <p class="font-medium">${formatDateTime(task.end_datetime)}</p>
              </div>
              ${task.location ? `<div class="col-span-2"><p class="text-gray-500 dark:text-gray-400">Plats</p><p class="font-medium">📍 ${escHtml(task.location)}</p></div>` : ''}
            </div>
            ${task.slots > 0 ? `
              <div>
                <p class="text-sm text-gray-500 dark:text-gray-400 mb-1">Bemanning</p>
                <div class="flex items-center gap-3">
                  <div class="flex-1 bg-gray-200 dark:bg-gray-700 rounded-full h-2.5">
                    <div class="h-2.5 rounded-full ${task.assignments.length >= task.slots ? 'bg-green-500' : 'bg-club-yellow'}" style="width:${Math.min(100, Math.round(task.assignments.length / task.slots * 100))}%"></div>
                  </div>
                  <span class="text-sm font-medium whitespace-nowrap">${task.assignments.length} / ${task.slots}</span>
                </div>
              </div>
            ` : ''}
            ${task.skoterkort_slots > 0 && task.slots > 0 ? `
              <div>
                <p class="text-sm text-gray-500 dark:text-gray-400 mb-2">Platser (${task.assignments.length} av ${task.slots})</p>
                <div class="space-y-2">${buildSpots(task, task.assignments || []).map((sp, i) => adminSpotRow(task, sp, i)).join('')}</div>
              </div>
            ` : `
            ${task.assignments && task.assignments.length > 0 ? `
              <div>
                <p class="text-sm text-gray-500 dark:text-gray-400 mb-2">Tilldelade (${task.assignments.length}${task.slots > 0 ? ' av ' + task.slots : ''})</p>
                ${task.skoterkort_slots > 0 ? (() => {
                  const covered = task.assignments.filter(a => a.user_skoterkort).length;
                  const ok = covered >= task.skoterkort_slots;
                  return `<p class="text-xs mb-2 ${ok ? 'text-green-700 dark:text-green-400' : 'text-amber-700 dark:text-amber-400'}">🛷 Skoterkort: ${Math.min(covered, task.skoterkort_slots)} av ${task.skoterkort_slots} ${ok ? '✓' : '– saknas'}</p>`;
                })() : ''}
                <div class="space-y-2">
                  ${task.assignments.map(a => `
                    <div class="flex items-center justify-between bg-gray-50 dark:bg-gray-700/50 rounded-lg p-2">
                      <div class="flex items-center gap-2 min-w-0">
                        <div class="w-7 h-7 bg-yellow-100 dark:bg-club-black rounded-full flex items-center justify-center text-xs font-bold text-club-yellow dark:text-club-yellow flex-shrink-0">${escHtml(a.user_name.charAt(0))}</div>
                        <div class="min-w-0">
                          <span class="text-sm font-medium">${escHtml(a.user_name)}</span>${a.user_skoterkort && task.skoterkort_slots > 0 ? ' <span class="text-xs" title="Har skoterkort">🛷</span>' : ''}
                          ${a.user_phone ? `<p class="text-xs text-gray-500 dark:text-gray-400 mt-0.5"><a href="tel:${escHtml(a.user_phone.replace(/\s/g, ''))}" class="hover:text-club-yellow">${escHtml(a.user_phone)}</a></p>` : ''}
                        </div>
                      </div>
                      <div class="flex items-center gap-1.5 flex-shrink-0">${statusBadge(a.status)}${currentUser.role === 'admin' ? `<button class="p-1 rounded text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30" title="Ta bort ${escHtml(a.user_name)} från passet" onclick="window.FV.removeFromTask(${task.id}, ${a.user_id}, ${JSON.stringify(a.user_name).replace(/"/g, '&quot;')})">✕</button>` : ''}</div>
                    </div>
                  `).join('')}
                </div>
              </div>
            ` : '<p class="text-sm text-gray-400">Ingen tilldelad</p>'}
            `}
            ${currentUser.role === 'admin' ? `
              <div class="flex gap-2 pt-2">
                <button class="btn-primary btn-sm flex-1" onclick="window.FV.closeModal(); window.FV.openTaskModal(${task.id})">Redigera</button>
                <button class="btn-danger btn-sm" onclick="window.FV.closeModal(); window.FV.deleteTask(${task.id})">Ta bort</button>
              </div>
            ` : ''}
          </div>
        </div>
      `);
    } catch (err) {
      toast(err.message, 'error');
    }
  }

  async function deleteTask(taskId) {
    if (!confirm('Vill du verkligen ta bort denna uppgift?')) return;
    try {
      await api(`/api/tasks/${taskId}`, { method: 'DELETE' });
      toast('Uppgift borttagen');
      closeModal();
      if (currentPage === 'tasks') renderTasks();
      else if (currentPage === 'dashboard') renderDashboard();
    } catch (err) {
      toast(err.message, 'error');
    }
  }

  // ---------------------------------------------------------------------------
  // PEOPLE (Admin)
  // ---------------------------------------------------------------------------
  const SNOLAGGNING_LABELS = { 0: '–', 1: 'Mycket erfaren', 2: 'Varit med', 3: 'Nybörjare' };
  const SNOLAGGNING_COLORS = {
    0: '', 1: 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300',
    2: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300',
    3: 'bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300',
  };

  async function renderPeople() {
    if (currentUser.role !== 'admin') return navigate('dashboard');
    const el = document.getElementById('main-content');

    let users = [];
    try {
      users = await api('/api/users') || [];
    } catch (err) {
      el.innerHTML = `<p class="text-red-500">${escHtml(err.message)}</p>`;
      return;
    }

    el.innerHTML = `
      <div class="flex flex-col sm:flex-row sm:items-center justify-between mb-6 gap-4">
        <h2 class="text-2xl font-bold">Personer</h2>
        <div class="flex gap-2">
          <button class="btn-secondary" onclick="window.FV.exportLinks()" title="Ladda ner en fil med alla personliga länkar, t.ex. för utskick">⬇ Exportera länkar</button>
          <button class="btn-primary" onclick="window.FV.openPersonModal()">+ Ny person</button>
        </div>
      </div>

      <div class="card overflow-hidden">
        <div class="p-4 border-b border-gray-200 dark:border-gray-700 flex flex-col sm:flex-row gap-3">
          <input type="text" id="person-search" class="input sm:max-w-xs" placeholder="Sök namn, e-post, familj..." oninput="window.FV.filterPeople()">
          <select id="person-filter-skill" class="input sm:max-w-[180px]" onchange="window.FV.filterPeople()">
            <option value="">Alla kompetenser</option>
            <option value="skoterkort">Skoterkort</option>
            <option value="kan_kiosk">Kan kiosk</option>
            <option value="snolaggning">Snöläggning</option>
          </select>
        </div>
        <div class="overflow-x-auto">
          <table class="w-full text-sm">
            <thead>
              <tr class="bg-gray-50 dark:bg-gray-700/50 text-left">
                <th class="px-4 py-3 font-medium">Namn</th>
                <th class="px-4 py-3 font-medium hidden lg:table-cell">Familj</th>
                <th class="px-4 py-3 font-medium hidden sm:table-cell">Kontakt</th>
                <th class="px-4 py-3 font-medium hidden md:table-cell">Kompetenser</th>
                <th class="px-4 py-3 font-medium hidden lg:table-cell">Barn</th>
                <th class="px-4 py-3 font-medium w-20"></th>
              </tr>
            </thead>
            <tbody id="people-tbody" class="divide-y divide-gray-200 dark:divide-gray-700">
              ${renderPeopleRows(users)}
            </tbody>
          </table>
        </div>
      </div>
    `;

    window._allUsers = users;
  }

  function renderPeopleRows(users) {
    if (!users || users.length === 0) {
      return '<tr><td colspan="6" class="px-4 py-8 text-center text-gray-400">Inga personer hittades</td></tr>';
    }
    return users.map(u => {
      const barn = (u.barn || []).filter(b => b);
      const skills = [];
      if (u.skoterkort) skills.push('<span class="badge bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300 text-[10px]">Skoter</span>');
      if (u.kan_kiosk) skills.push('<span class="badge bg-yellow-100 text-club-black dark:bg-club-black dark:text-club-yellow text-[10px]">Kiosk</span>');
      if (u.snolaggning > 0) skills.push(`<span class="badge ${SNOLAGGNING_COLORS[u.snolaggning]} text-[10px]">Snö ${u.snolaggning}</span>`);

      return `
        <tr class="hover:bg-gray-50 dark:hover:bg-gray-700/30 cursor-pointer" onclick="window.FV.showPersonDetail(${u.id})">
          <td class="px-4 py-3">
            <div class="flex items-center gap-3">
              <div class="w-8 h-8 bg-yellow-100 dark:bg-club-black rounded-full flex items-center justify-center text-sm font-bold text-club-yellow dark:text-club-yellow">${escHtml(u.name.charAt(0))}</div>
              <div>
                <p class="font-medium">${escHtml(u.name)}</p>
                <p class="text-xs text-gray-500 sm:hidden">${escHtml(u.email)}</p>
                ${u.familj ? `<p class="text-xs text-gray-400 lg:hidden">${escHtml(u.familj)}</p>` : ''}
              </div>
            </div>
          </td>
          <td class="px-4 py-3 text-gray-500 hidden lg:table-cell">${escHtml(u.familj || '–')}</td>
          <td class="px-4 py-3 hidden sm:table-cell">
            <p class="text-xs text-gray-600 dark:text-gray-400">${escHtml(u.email)}</p>
            <p class="text-xs text-gray-400">${escHtml(u.phone || '')}</p>
          </td>
          <td class="px-4 py-3 hidden md:table-cell">
            <div class="flex flex-wrap gap-1">${skills.length > 0 ? skills.join('') : '<span class="text-xs text-gray-300 dark:text-gray-600">–</span>'}</div>
          </td>
          <td class="px-4 py-3 hidden lg:table-cell">
            <p class="text-xs text-gray-500">${barn.length > 0 ? barn.map(b => escHtml(b)).join(', ') : '–'}</p>
          </td>
          <td class="px-4 py-3">
            <div class="flex gap-1" onclick="event.stopPropagation()">
              <button class="p-1.5 rounded hover:bg-gray-200 dark:hover:bg-gray-600" title="Kopiera personlig länk" onclick="window.FV.copyMemberLink(${u.id})">🔗</button>
              <button class="p-1.5 rounded hover:bg-gray-200 dark:hover:bg-gray-600" title="Redigera" onclick="window.FV.openPersonModal(${u.id})">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>
              </button>
              <button class="p-1.5 rounded hover:bg-red-100 dark:hover:bg-red-900/30 text-red-500" title="Ta bort" onclick="window.FV.deletePerson(${u.id})">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
              </button>
            </div>
          </td>
        </tr>
      `;
    }).join('');
  }

  function filterPeople() {
    const search = (document.getElementById('person-search')?.value || '').toLowerCase();
    const skill = document.getElementById('person-filter-skill')?.value || '';

    let filtered = window._allUsers || [];
    if (search) {
      filtered = filtered.filter(u =>
        u.name.toLowerCase().includes(search) ||
        u.email.toLowerCase().includes(search) ||
        (u.phone || '').toLowerCase().includes(search) ||
        (u.familj || '').toLowerCase().includes(search)
      );
    }
    if (skill === 'skoterkort') filtered = filtered.filter(u => u.skoterkort);
    if (skill === 'kan_kiosk') filtered = filtered.filter(u => u.kan_kiosk);
    if (skill === 'snolaggning') filtered = filtered.filter(u => u.snolaggning > 0);

    document.getElementById('people-tbody').innerHTML = renderPeopleRows(filtered);
  }

  async function showPersonDetail(userId) {
    try {
      const user = await api(`/api/users/${userId}`);
      if (!user) return;
      const barn = (user.barn || []).filter(b => b);

      openModal(`
        <div class="p-6">
          <div class="flex items-center justify-between mb-4">
            <div class="flex items-center gap-3">
              <div class="w-10 h-10 bg-yellow-100 dark:bg-club-black rounded-full flex items-center justify-center text-lg font-bold text-club-yellow dark:text-club-yellow">${escHtml(user.name.charAt(0))}</div>
              <div>
                <h3 class="text-lg font-semibold">${escHtml(user.name)}</h3>
                ${user.familj ? `<p class="text-sm text-gray-500 dark:text-gray-400">Familj ${escHtml(user.familj)}</p>` : ''}
              </div>
            </div>
            <button onclick="window.FV.closeModal()" class="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 text-xl">×</button>
          </div>
          <div class="space-y-4">
            <div class="grid grid-cols-2 gap-4 text-sm">
              <div>
                <p class="text-gray-500 dark:text-gray-400">E-post</p>
                <p class="font-medium">${escHtml(user.email)}</p>
              </div>
              <div>
                <p class="text-gray-500 dark:text-gray-400">Telefon</p>
                <p class="font-medium">${escHtml(user.phone || '–')}</p>
              </div>
            </div>

            <div>
              <p class="text-sm text-gray-500 dark:text-gray-400 mb-2">Kompetenser</p>
              <div class="flex flex-wrap gap-2">
                <span class="badge ${user.skoterkort ? 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300' : 'bg-gray-100 text-gray-400 dark:bg-gray-700 dark:text-gray-500'}">
                  ${user.skoterkort ? '✓' : '✗'} Skoterkort
                </span>
                <span class="badge ${user.kan_kiosk ? 'bg-yellow-100 text-club-black dark:bg-club-black dark:text-club-yellow' : 'bg-gray-100 text-gray-400 dark:bg-gray-700 dark:text-gray-500'}">
                  ${user.kan_kiosk ? '✓' : '✗'} Kan kiosk
                </span>
                ${user.snolaggning > 0 ? `<span class="badge ${SNOLAGGNING_COLORS[user.snolaggning]}">Snöläggning: ${SNOLAGGNING_LABELS[user.snolaggning]}</span>` : '<span class="badge bg-gray-100 text-gray-400 dark:bg-gray-700 dark:text-gray-500">✗ Snöläggning</span>'}
              </div>
            </div>

            ${barn.length > 0 ? `
              <div>
                <p class="text-sm text-gray-500 dark:text-gray-400 mb-2">Barn (${barn.length})</p>
                <div class="flex flex-wrap gap-2">
                  ${barn.map(b => `<span class="badge bg-yellow-50 text-club-black dark:bg-club-black/50 dark:text-club-yellow">${escHtml(b)}</span>`).join('')}
                </div>
              </div>
            ` : ''}

            ${user.kommentar ? `
              <div>
                <p class="text-sm text-gray-500 dark:text-gray-400 mb-1">Kommentar</p>
                <p class="text-sm bg-gray-50 dark:bg-gray-700/50 rounded-lg p-3">${escHtml(user.kommentar)}</p>
              </div>
            ` : ''}

            <div class="bg-yellow-50 dark:bg-club-black/40 rounded-lg p-3">
              <p class="text-sm font-medium mb-1">🔗 Personlig länk</p>
              <p class="text-xs text-gray-500 dark:text-gray-400 mb-2">Med länken kan ${escHtml(user.name.split(' ')[0])} anmäla och avanmäla sig själv i översikten – utan lösenord. Dela den bara med personen själv.</p>
              <input class="input text-xs font-mono mb-2" readonly value="${escHtml(memberLink(user))}" onclick="this.select()">
              <div class="flex flex-wrap gap-2">
                <button class="btn-primary btn-sm" onclick="window.FV.copyMemberLink(${user.id})">Kopiera</button>
                ${user.phone ? `<a class="btn-secondary btn-sm" href="${escHtml(smsHref(user))}">Skicka SMS</a>` : ''}
                ${user.email ? `<a class="btn-secondary btn-sm" href="${escHtml(mailHref(user))}">Skicka e-post</a>` : ''}
                <button class="btn-secondary btn-sm" onclick="window.FV.regenerateMemberLink(${user.id})" title="Den gamla länken slutar fungera">Ny länk</button>
              </div>
            </div>

            <div class="flex gap-2 pt-2">
              <button class="btn-primary btn-sm flex-1" onclick="window.FV.closeModal(); window.FV.openPersonModal(${user.id})">Redigera</button>
              <button class="btn-danger btn-sm" onclick="window.FV.closeModal(); window.FV.deletePerson(${user.id})">Ta bort</button>
            </div>
          </div>
        </div>
      `);
    } catch (err) {
      toast(err.message, 'error');
    }
  }

  async function openPersonModal(userId) {
    let user = null;
    if (userId) {
      try { user = await api(`/api/users/${userId}`); } catch { /* empty */ }
    }
    const isEdit = !!user;
    const barn = isEdit ? (user.barn || []) : [];
    const barnFields = Math.max(barn.length, 1);

    openModal(`
      <div class="p-6 max-h-[85vh] overflow-y-auto">
        <div class="flex items-center justify-between mb-6">
          <h3 class="text-lg font-semibold">${isEdit ? 'Redigera person' : 'Ny person'}</h3>
          <button onclick="window.FV.closeModal()" class="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 text-xl">×</button>
        </div>
        <form id="person-form" class="space-y-4">
          <div class="grid grid-cols-2 gap-4">
            <div>
              <label class="label">Namn *</label>
              <input class="input" name="name" value="${isEdit ? escHtml(user.name) : ''}" required>
            </div>
            <div>
              <label class="label">Familj</label>
              <input class="input" name="familj" value="${isEdit ? escHtml(user.familj || '') : ''}" placeholder="Efternamn / familj">
            </div>
          </div>
          <div class="grid grid-cols-2 gap-4">
            <div>
              <label class="label">E-post *</label>
              <input class="input" type="email" name="email" value="${isEdit ? escHtml(user.email) : ''}" required>
            </div>
            <div>
              <label class="label">Telefon</label>
              <input class="input" name="phone" value="${isEdit ? escHtml(user.phone || '') : ''}">
            </div>
          </div>

          <fieldset class="border border-gray-200 dark:border-gray-700 rounded-lg p-4">
            <legend class="text-sm font-medium text-gray-700 dark:text-gray-300 px-2">Kompetenser</legend>
            <div class="space-y-3">
              <label class="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" name="skoterkort" value="1" ${isEdit && user.skoterkort ? 'checked' : ''} class="rounded border-gray-300 text-club-yellow focus:ring-club-yellow">
                <span class="text-sm">Skoterkort</span>
              </label>
              <label class="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" name="kan_kiosk" value="1" ${isEdit && user.kan_kiosk ? 'checked' : ''} class="rounded border-gray-300 text-club-yellow focus:ring-club-yellow">
                <span class="text-sm">Kan kiosk</span>
              </label>
              <div>
                <label class="label">Snöläggningserfarenhet</label>
                <select class="input" name="snolaggning">
                  <option value="0" ${!isEdit || user.snolaggning == 0 ? 'selected' : ''}>Ingen</option>
                  <option value="1" ${isEdit && user.snolaggning == 1 ? 'selected' : ''}>1 – Mycket erfaren</option>
                  <option value="2" ${isEdit && user.snolaggning == 2 ? 'selected' : ''}>2 – Varit med någon gång</option>
                  <option value="3" ${isEdit && user.snolaggning == 3 ? 'selected' : ''}>3 – Nybörjare</option>
                </select>
              </div>
            </div>
          </fieldset>

          <fieldset class="border border-gray-200 dark:border-gray-700 rounded-lg p-4">
            <legend class="text-sm font-medium text-gray-700 dark:text-gray-300 px-2">Barn</legend>
            <div id="barn-fields" class="space-y-2">
              ${Array.from({ length: Math.max(barnFields, 3) }, (_, i) => `
                <input class="input" name="barn" value="${barn[i] ? escHtml(barn[i]) : ''}" placeholder="Barn ${i + 1} namn">
              `).join('')}
            </div>
            <button type="button" class="text-sm text-club-yellow dark:text-yellow-400 hover:underline mt-2" onclick="document.getElementById('barn-fields').insertAdjacentHTML('beforeend', '<input class=\\'input mt-2\\' name=\\'barn\\' placeholder=\\'Barn namn\\'>')">+ Lägg till barn</button>
          </fieldset>

          <div>
            <label class="label">Övriga kommentarer</label>
            <textarea class="input" name="kommentar" rows="2">${isEdit ? escHtml(user.kommentar || '') : ''}</textarea>
          </div>

          <div class="grid grid-cols-2 gap-4">
            <div>
              <label class="label">Roll</label>
              <select class="input" name="role">
                <option value="user" ${isEdit && user.role === 'user' ? 'selected' : ''}>Användare</option>
                <option value="admin" ${isEdit && user.role === 'admin' ? 'selected' : ''}>Admin</option>
              </select>
            </div>
            ${isEdit ? `
              <div>
                <label class="label">Status</label>
                <select class="input" name="active">
                  <option value="1" ${user.active ? 'selected' : ''}>Aktiv</option>
                  <option value="0" ${!user.active ? 'selected' : ''}>Inaktiv</option>
                </select>
              </div>
            ` : `
              <div>
                <label class="label">Lösenord <span class="font-normal text-gray-400">(valfritt – behövs bara för att logga in i admin-appen)</span></label>
                <input class="input" type="password" name="password" minlength="6" autocomplete="new-password">
              </div>
            `}
          </div>
          ${isEdit ? `
            <div>
              <label class="label">Nytt lösenord (lämna tomt för att behålla)</label>
              <input class="input" type="password" name="password" minlength="6">
            </div>
          ` : ''}

          <div class="flex gap-3 pt-2">
            <button type="submit" class="btn-primary flex-1">${isEdit ? 'Spara' : 'Skapa'}</button>
            <button type="button" class="btn-secondary" onclick="window.FV.closeModal()">Avbryt</button>
          </div>
        </form>
      </div>
    `);

    document.getElementById('person-form').onsubmit = async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const body = {
        name: fd.get('name'),
        email: fd.get('email'),
        phone: fd.get('phone'),
        role: fd.get('role'),
        familj: fd.get('familj'),
        skoterkort: fd.has('skoterkort'),
        kan_kiosk: fd.has('kan_kiosk'),
        snolaggning: parseInt(fd.get('snolaggning')) || 0,
        barn: fd.getAll('barn').filter(b => b.trim()),
        kommentar: fd.get('kommentar'),
      };
      if (fd.get('password')) body.password = fd.get('password');
      if (fd.get('active') !== null && isEdit) body.active = fd.get('active') === '1';

      try {
        if (isEdit) {
          await api(`/api/users/${user.id}`, { method: 'PUT', body });
          toast('Person uppdaterad');
        } else {
          await api('/api/users', { method: 'POST', body });
          toast('Person skapad');
        }
        closeModal();
        renderPeople();
      } catch (err) {
        toast(err.message, 'error');
      }
    };
  }

  async function deletePerson(userId) {
    if (!confirm('Vill du verkligen ta bort denna person?')) return;
    try {
      await api(`/api/users/${userId}`, { method: 'DELETE' });
      toast('Person borttagen');
      renderPeople();
    } catch (err) {
      toast(err.message, 'error');
    }
  }

  // ---------------------------------------------------------------------------
  // Personal member links
  // ---------------------------------------------------------------------------
  function memberLink(user) {
    return `${location.origin}/oversikt?k=${encodeURIComponent(user.access_token || '')}`;
  }

  function linkMessage(user) {
    return `Hej ${user.name.split(' ')[0]}! Här är din personliga länk till FV:s bemanningsschema. ` +
      `Där kan du anmäla och avanmäla dig till pass: ${memberLink(user)}\n` +
      'Länken är personlig – dela den inte med någon annan.';
  }

  function smsHref(user) {
    const phone = String(user.phone || '').replace(/[^\d+]/g, '');
    return `sms:${phone}?&body=${encodeURIComponent(linkMessage(user))}`;
  }

  function mailHref(user) {
    return `mailto:${encodeURIComponent(user.email)}?subject=${encodeURIComponent('Din länk till bemanningsschemat')}&body=${encodeURIComponent(linkMessage(user))}`;
  }

  async function copyText(text) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      prompt('Kopiera länken:', text);
      return false;
    }
  }

  async function copyMemberLink(userId) {
    let user = (window._allUsers || []).find(u => u.id === userId);
    if (!user || !user.access_token) {
      try { user = await api(`/api/users/${userId}`); } catch (err) { toast(err.message, 'error'); return; }
    }
    if (user && await copyText(memberLink(user))) toast(`Länken till ${user.name} är kopierad`);
  }

  async function regenerateMemberLink(userId) {
    if (!confirm('Skapa en ny länk? Den gamla länken slutar fungera direkt, och personen behöver få den nya.')) return;
    try {
      await api(`/api/users/${userId}/regenerate-link`, { method: 'POST' });
      toast('Ny länk skapad');
      if (currentPage === 'people') {
        window._allUsers = await api('/api/users') || [];
      }
      showPersonDetail(userId);
    } catch (err) {
      toast(err.message, 'error');
    }
  }

  function exportLinks() {
    const users = (window._allUsers || []).filter(u => u.active);
    const cell = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const rows = [['Namn', 'E-post', 'Telefon', 'Familj', 'Personlig länk']]
      .concat(users.map(u => [u.name, u.email, u.phone, u.familj, memberLink(u)]));
    const csv = '﻿' + rows.map(r => r.map(cell).join(';')).join('\r\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    a.download = `personliga-lankar-${localDate(new Date())}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    toast(`Exporterade ${users.length} länkar. Filen innehåller hemliga länkar – radera den efter utskick.`, 'info');
  }

  // ---------------------------------------------------------------------------
  // AUDIT LOG (Admin)
  // ---------------------------------------------------------------------------
  const AUDIT_ACTIONS = {
    signup: ['Anmälan', 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'],
    unsign: ['Avanmälan', 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'],
    assign: ['Tillagd', 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200'],
    unassign: ['Borttagen', 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200'],
    assignment_status: ['Status', 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200'],
    task_delete: ['Uppgift raderad', 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'],
    user_create: ['Ny person', 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200'],
    user_delete: ['Person borttagen', 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'],
    user_role: ['Roll ändrad', 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200'],
    user_activate: ['Aktiverad', 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200'],
    user_deactivate: ['Inaktiverad', 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200'],
    link_regenerate: ['Ny länk', 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200'],
    reminders_on: ['Påminnelser på', 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200'],
    reminders_off: ['Påminnelser av', 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200'],
  };
  const ACTOR_KIND = { member: 'via personlig länk', admin: 'admin', user: 'via inloggning', system: 'system' };

  function describeAudit(e) {
    const actor = escHtml(e.actor_name || 'Okänd');
    const target = escHtml(e.target_name || '');
    const task = e.task_title
      ? `<strong>${escHtml(e.task_title)}</strong>${e.task_start ? ` <span class="text-gray-400">(${formatDateTime(e.task_start)})</span>` : ''}`
      : '';
    switch (e.action) {
      case 'signup': return `<strong>${target}</strong> anmälde sig till ${task}`;
      case 'unsign': return `<strong>${target}</strong> avanmälde sig från ${task}`;
      case 'assign': return `${actor} lade till <strong>${target}</strong> på ${task}`;
      case 'unassign': return `${actor} tog bort <strong>${target}</strong> från ${task}`;
      case 'assignment_status': return `${actor} ändrade status för <strong>${target}</strong> på ${task}`;
      case 'task_delete': return `${actor} raderade uppgiften ${task}`;
      case 'user_create': return `${actor} skapade <strong>${target}</strong>`;
      case 'user_delete': return `${actor} tog bort <strong>${target}</strong>`;
      case 'user_role': return `${actor} ändrade roll för <strong>${target}</strong>`;
      case 'user_activate': return `${actor} aktiverade <strong>${target}</strong>`;
      case 'user_deactivate': return `${actor} inaktiverade <strong>${target}</strong>`;
      case 'reminders_on': return `<strong>${target}</strong> slog på mejlpåminnelser`;
      case 'reminders_off': return `<strong>${target}</strong> stängde av mejlpåminnelser`;
      case 'link_regenerate': return `${actor} skapade ny personlig länk för <strong>${target}</strong>`;
      default: return `${actor}: ${escHtml(e.action)}${target ? ` – <strong>${target}</strong>` : ''}`;
    }
  }

  async function renderAudit() {
    if (currentUser.role !== 'admin') return navigate('dashboard');
    const el = document.getElementById('main-content');
    let entries = [];
    try {
      entries = await api('/api/audit?limit=300') || [];
    } catch (err) {
      el.innerHTML = `<p class="text-red-500">${escHtml(err.message)}</p>`;
      return;
    }
    window._auditEntries = entries;

    el.innerHTML = `
      <div class="flex flex-col lg:flex-row lg:items-center justify-between mb-6 gap-4">
        <div>
          <h2 class="text-2xl font-bold">Logg</h2>
          <p class="text-sm text-gray-500 dark:text-gray-400">Vem anmälde, avanmälde eller ändrade vad – och när. Visar de senaste 300 händelserna.</p>
        </div>
        <div class="flex flex-col sm:flex-row gap-2">
          <input type="text" id="audit-search" class="input sm:w-64" placeholder="Sök namn eller uppgift..." oninput="window.FV.filterAudit()">
          <select id="audit-filter" class="input sm:w-56" onchange="window.FV.filterAudit()">
            <option value="">Alla händelser</option>
            <option value="member">Ändringar via personlig länk</option>
            <option value="signup">Endast anmälningar</option>
            <option value="unsign">Endast avanmälningar</option>
            <option value="admin">Admin-ändringar</option>
          </select>
        </div>
      </div>
      <div class="card divide-y divide-gray-200 dark:divide-gray-700" id="audit-list">${renderAuditRows(entries)}</div>
    `;
  }

  function renderAuditRows(entries) {
    if (!entries.length) return '<p class="p-8 text-center text-gray-400">Inga händelser ännu</p>';
    return entries.map(e => {
      const [label, cls] = AUDIT_ACTIONS[e.action] || [e.action, 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200'];
      return `
        <div class="p-4 flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 ${e.undone_at ? 'opacity-50' : ''}">
          <div class="text-xs text-gray-500 dark:text-gray-400 sm:w-32 flex-shrink-0">${formatDateTime(e.created_at)}</div>
          <div class="flex-1 min-w-0 text-sm">
            <span class="badge ${cls} mr-1">${escHtml(label)}</span>
            ${describeAudit(e)}
            ${e.details ? `<span class="text-xs text-gray-400"> · ${escHtml(e.details)}</span>` : ''}
            <span class="text-xs text-gray-400"> · ${ACTOR_KIND[e.actor_kind] || ''}</span>
            ${e.undone_at ? `<span class="text-xs text-gray-500"> · ångrad av ${escHtml(e.undone_by || '')} ${formatDateTime(e.undone_at)}</span>` : ''}
          </div>
          ${e.undoable ? `<button class="btn-secondary btn-sm flex-shrink-0 self-start sm:self-auto" onclick="window.FV.undoAudit(${e.id})">Ångra</button>` : ''}
        </div>`;
    }).join('');
  }

  function filterAudit() {
    const q = (document.getElementById('audit-search')?.value || '').toLowerCase();
    const f = document.getElementById('audit-filter')?.value || '';
    let list = window._auditEntries || [];
    if (q) list = list.filter(e => [e.actor_name, e.target_name, e.task_title].some(v => (v || '').toLowerCase().includes(q)));
    if (f === 'member') list = list.filter(e => e.actor_kind === 'member');
    else if (f === 'admin') list = list.filter(e => e.actor_kind === 'admin');
    else if (f) list = list.filter(e => e.action === f);
    document.getElementById('audit-list').innerHTML = renderAuditRows(list);
  }

  async function undoAudit(id) {
    const e = (window._auditEntries || []).find(x => x.id === id);
    if (!e) return;
    const what = ['signup', 'assign'].includes(e.action)
      ? `ta bort ${e.target_name} från "${e.task_title}"`
      : `lägga tillbaka ${e.target_name} på "${e.task_title}"`;
    if (!confirm(`Vill du ${what}?`)) return;
    try {
      await api(`/api/audit/${id}/undo`, { method: 'POST' });
      toast('Ångrat');
      renderAudit();
    } catch (err) {
      toast(err.message, 'error');
    }
  }

  // ---------------------------------------------------------------------------
  // AUTO-ASSIGN (Admin): distribute open slots fairly, matching skills
  // ---------------------------------------------------------------------------
  const SKILL_OPTIONS = [
    ['', 'Ingen kompetens krävs'],
    ['kan_kiosk', 'Kiosk'],
    ['skoterkort', 'Skoterkort'],
    ['snolaggning', 'Snöläggning'],
  ];
  let aa = null; // { from, to, user_ids, max_per_day, preview }

  function skillBadges(u) {
    const b = [];
    if (u.skoterkort) b.push('<span class="badge bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300 text-[10px]">Skoter</span>');
    if (u.kan_kiosk) b.push('<span class="badge bg-yellow-100 text-club-black dark:bg-club-black dark:text-club-yellow text-[10px]">Kiosk</span>');
    if (u.snolaggning > 0) b.push(`<span class="badge ${SNOLAGGNING_COLORS[u.snolaggning] || ''} text-[10px]">Snö ${u.snolaggning}</span>`);
    return b.join(' ');
  }

  async function openAutoAssign() {
    let users, categories;
    try {
      [users, categories] = await Promise.all([api('/api/users?active=1'), api('/api/categories')]);
    } catch (err) { toast(err.message, 'error'); return; }
    users = (users || []).filter(u => u.active);

    if (!aa) {
      const from = new Date();
      const to = new Date(); to.setDate(to.getDate() + 28);
      aa = { from: localDate(from), to: localDate(to), user_ids: users.map(u => u.id), max_per_day: true };
    }
    const selected = new Set(aa.user_ids);

    openModal(`
      <div class="p-6">
        <div class="flex items-center justify-between mb-1">
          <h3 class="text-lg font-semibold">⚡ Fördela pass automatiskt</h3>
          <button onclick="window.FV.closeModal()" class="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 text-xl" aria-label="Stäng">×</button>
        </div>
        <p class="text-sm text-gray-500 dark:text-gray-400 mb-5">Lediga platser i perioden fördelas jämnt mellan de valda personerna. Bara personer med rätt kompetens får ett pass, och ingen bokas på två pass samtidigt. Du får se ett förslag innan något sparas.</p>

        <div class="space-y-5">
          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="label" for="aa-from">Från</label>
              <input type="date" id="aa-from" class="input" value="${aa.from}">
            </div>
            <div>
              <label class="label" for="aa-to">Till och med</label>
              <input type="date" id="aa-to" class="input" value="${aa.to}">
            </div>
          </div>

          <div>
            <div class="flex items-center justify-between mb-1">
              <span class="label mb-0">Personer som kan få pass (<span id="aa-count">${selected.size}</span> valda)</span>
              <div class="text-xs space-x-2">
                <button class="text-gray-600 dark:text-gray-300 hover:underline" onclick="window.FV.aaSelectAll(true)">Alla</button>
                <button class="text-gray-600 dark:text-gray-300 hover:underline" onclick="window.FV.aaSelectAll(false)">Inga</button>
              </div>
            </div>
            <div class="border border-gray-200 dark:border-gray-700 rounded-lg max-h-56 overflow-y-auto divide-y divide-gray-100 dark:divide-gray-700/60">
              ${users.map(u => `
                <label class="flex items-center gap-3 px-3 py-2 hover:bg-gray-50 dark:hover:bg-gray-700/40 cursor-pointer">
                  <input type="checkbox" class="aa-user rounded" value="${u.id}" ${selected.has(u.id) ? 'checked' : ''} onchange="window.FV.aaUpdateCount()">
                  <span class="text-sm flex-1">${escHtml(u.name)}</span>
                  <span class="flex gap-1">${skillBadges(u)}</span>
                </label>`).join('')}
            </div>
          </div>

          <div>
            <span class="label">Kompetenskrav per kategori</span>
            <p class="text-xs text-gray-500 dark:text-gray-400 mb-2">Sparas direkt. Platser som kräver skoterkort (anges per pass och mall) fylls bara med personer som har skoterkort.</p>
            <div class="grid sm:grid-cols-2 gap-2">
              ${(categories || []).map(c => `
                <div class="flex items-center gap-2">
                  <span class="w-2.5 h-2.5 rounded-full flex-shrink-0" style="background:${safeColor(c.color)}"></span>
                  <span class="text-sm w-28 truncate" title="${escHtml(c.name)}">${escHtml(c.name)}</span>
                  <select class="input py-1 text-xs flex-1" onchange="window.FV.aaSaveCategorySkill(${c.id}, this.value)">
                    ${SKILL_OPTIONS.map(([v, l]) => `<option value="${v}" ${(c.required_skill || '') === v ? 'selected' : ''}>${l}</option>`).join('')}
                  </select>
                </div>`).join('')}
            </div>
          </div>

          <label class="flex items-center gap-2 text-sm">
            <input type="checkbox" id="aa-maxday" class="rounded" ${aa.max_per_day ? 'checked' : ''}>
            Max ett pass per person och dag
          </label>

          <div class="flex gap-2 pt-1">
            <button class="btn-primary flex-1" id="aa-preview-btn" onclick="window.FV.aaPreview()">Visa förslag</button>
            <button class="btn-secondary" onclick="window.FV.closeModal()">Avbryt</button>
          </div>
        </div>
      </div>
    `, { wide: true });
  }

  function aaUpdateCount() {
    const n = document.querySelectorAll('.aa-user:checked').length;
    const el = document.getElementById('aa-count');
    if (el) el.textContent = n;
  }

  function aaSelectAll(on) {
    document.querySelectorAll('.aa-user').forEach(cb => { cb.checked = on; });
    aaUpdateCount();
  }

  async function aaSaveCategorySkill(id, value) {
    try {
      await api(`/api/categories/${id}`, { method: 'PUT', body: { required_skill: value || null } });
      toast('Kompetenskrav sparat');
    } catch (err) { toast(err.message, 'error'); }
  }

  async function aaPreview() {
    aa.from = document.getElementById('aa-from').value;
    aa.to = document.getElementById('aa-to').value;
    aa.user_ids = [...document.querySelectorAll('.aa-user:checked')].map(cb => Number(cb.value));
    aa.max_per_day = document.getElementById('aa-maxday').checked;
    if (!aa.from || !aa.to) { toast('Välj en period', 'error'); return; }
    if (aa.user_ids.length === 0) { toast('Välj minst en person', 'error'); return; }

    const btn = document.getElementById('aa-preview-btn');
    btn.disabled = true; btn.textContent = 'Räknar…';
    try {
      aa.preview = await api('/api/auto-assign/preview', { method: 'POST', body: { from: aa.from, to: aa.to, user_ids: aa.user_ids, max_per_day: aa.max_per_day } });
      renderAaPreview();
    } catch (err) {
      toast(err.message, 'error');
      btn.disabled = false; btn.textContent = 'Visa förslag';
    }
  }

  function renderAaPreview() {
    const p = aa.preview;
    const unfilledSlots = p.unfilled.reduce((s, u) => s + u.missing, 0);
    const maxAfter = Math.max(1, ...p.people.map(x => x.after));

    // Group proposals by date
    const byDate = {};
    p.assignments.forEach((a, i) => { (byDate[a.task.start_datetime.slice(0, 10)] ||= []).push({ ...a, i }); });

    const stat = (label, value, cls) => `
      <div class="rounded-lg bg-gray-50 dark:bg-gray-700/40 p-3 text-center">
        <div class="text-2xl font-bold ${cls}">${value}</div>
        <div class="text-xs text-gray-500 dark:text-gray-400">${label}</div>
      </div>`;

    openModal(`
      <div class="p-6">
        <div class="flex items-center justify-between mb-1">
          <h3 class="text-lg font-semibold">Förslag: ${formatDate(p.period.from)} – ${formatDate(p.period.to)}</h3>
          <button onclick="window.FV.closeModal()" class="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 text-xl" aria-label="Stäng">×</button>
        </div>
        <p class="text-sm text-gray-500 dark:text-gray-400 mb-4">Inget är sparat än. Bocka ur enskilda tilldelningar om du vill, och spara sedan.</p>

        <div class="grid grid-cols-3 gap-2 mb-5">
          ${stat('lediga platser', p.open_slots, '')}
          ${stat('föreslagna', p.assignments.length, 'text-green-600 dark:text-green-400')}
          ${stat('kan inte fyllas', unfilledSlots, unfilledSlots ? 'text-red-600 dark:text-red-400' : 'text-gray-400')}
        </div>

        ${p.open_slots === 0 ? `<p class="text-sm text-gray-500 dark:text-gray-400 mb-4 text-center">Alla pass i perioden är redan fullt bemannade (${p.tasks_in_period} pass). 🎉</p>` : ''}
        ${p.skipped_no_slots ? `<p class="text-xs text-amber-700 dark:text-amber-400 mb-4">${p.skipped_no_slots} pass saknar angivet antal platser och har hoppats över.</p>` : ''}

        ${unfilledSlots ? `
          <div class="rounded-lg border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-900/20 p-3 mb-5">
            <p class="text-sm font-semibold text-red-800 dark:text-red-200 mb-1">Kan inte fyllas automatiskt</p>
            <ul class="text-sm text-red-800 dark:text-red-200 space-y-1 max-h-32 overflow-y-auto">
              ${p.unfilled.map(u => `<li>${formatDateTime(u.task.start_datetime)} · <strong>${escHtml(u.task.title)}</strong> – ${u.missing} plats${u.missing > 1 ? 'er' : ''}: ${escHtml(u.reason)}</li>`).join('')}
            </ul>
          </div>` : ''}

        <h4 class="text-sm font-semibold mb-2">Fördelning per person i perioden</h4>
        <div class="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden mb-5">
          <table class="w-full text-sm">
            <thead class="bg-gray-50 dark:bg-gray-700/50 text-left text-xs text-gray-500 dark:text-gray-400">
              <tr><th class="px-3 py-2 font-medium">Person</th><th class="px-3 py-2 font-medium text-right">Har redan</th><th class="px-3 py-2 font-medium text-right">Nya</th><th class="px-3 py-2 font-medium w-1/3">Totalt</th></tr>
            </thead>
            <tbody class="divide-y divide-gray-100 dark:divide-gray-700/60">
              ${p.people.map(x => `
                <tr>
                  <td class="px-3 py-1.5">${escHtml(x.name)} <span class="text-[10px] text-gray-400">${escHtml(x.skills.join(', '))}</span></td>
                  <td class="px-3 py-1.5 text-right text-gray-500">${x.before}</td>
                  <td class="px-3 py-1.5 text-right font-medium ${x.added ? 'text-green-600 dark:text-green-400' : 'text-gray-400'}">${x.added ? '+' + x.added : '–'}</td>
                  <td class="px-3 py-1.5">
                    <div class="flex items-center gap-2">
                      <div class="flex-1 h-2 rounded-full bg-gray-100 dark:bg-gray-700 overflow-hidden">
                        <div class="h-2 bg-club-yellow" style="width:${Math.round(x.after / maxAfter * 100)}%"></div>
                      </div>
                      <span class="text-xs w-5 text-right">${x.after}</span>
                    </div>
                  </td>
                </tr>`).join('')}
            </tbody>
          </table>
        </div>

        ${p.assignments.length ? `
          <details class="mb-5" ${p.assignments.length <= 15 ? 'open' : ''}>
            <summary class="cursor-pointer text-sm font-semibold">Alla föreslagna tilldelningar (${p.assignments.length})</summary>
            <div class="mt-2 border border-gray-200 dark:border-gray-700 rounded-lg max-h-72 overflow-y-auto divide-y divide-gray-100 dark:divide-gray-700/60">
              ${Object.entries(byDate).map(([date, rows]) => `
                <div class="px-3 py-1.5 bg-gray-50 dark:bg-gray-700/40 text-xs font-medium text-gray-600 dark:text-gray-300 sticky top-0">${formatDate(date)}</div>
                ${rows.map(a => `
                  <label class="flex items-center gap-3 px-3 py-1.5 text-sm hover:bg-gray-50 dark:hover:bg-gray-700/30 cursor-pointer">
                    <input type="checkbox" class="aa-pair rounded" data-i="${a.i}" checked onchange="window.FV.aaUpdateApply()">
                    <span class="w-2 h-2 rounded-full flex-shrink-0" style="background:${safeColor(a.task.category_color)}"></span>
                    <span class="text-gray-500 w-24 flex-shrink-0">${formatTime(a.task.start_datetime)}–${formatTime(a.task.end_datetime)}</span>
                    <span class="flex-1 truncate">${escHtml(a.task.title)}${a.task.skills.length ? ` <span class="text-[10px] text-gray-400">(${escHtml(a.task.skills.join(', '))})</span>` : ''}</span>
                    <span class="font-medium">→ ${escHtml(a.user_name)}</span>
                  </label>`).join('')}
              `).join('')}
            </div>
          </details>` : ''}

        <p class="text-xs text-gray-500 dark:text-gray-400 mb-3">De som tilldelas ser passen direkt på sin personliga sida (och får mejlpåminnelse om de slagit på det). Varje tilldelning hamnar i Loggen och kan ångras där.</p>
        <div class="flex gap-2">
          <button class="btn-secondary" onclick="window.FV.openAutoAssign()">← Ändra</button>
          <button class="btn-primary flex-1" id="aa-apply-btn" onclick="window.FV.aaApply()" ${p.assignments.length ? '' : 'disabled'}>Tilldela ${p.assignments.length} pass</button>
        </div>
      </div>
    `, { wide: true });
  }

  function aaSelectedPairs() {
    const boxes = [...document.querySelectorAll('.aa-pair')];
    const list = boxes.length ? boxes.filter(b => b.checked).map(b => aa.preview.assignments[Number(b.dataset.i)]) : aa.preview.assignments;
    return list.map(a => ({ task_id: a.task_id, user_id: a.user_id }));
  }

  function aaUpdateApply() {
    const n = aaSelectedPairs().length;
    const btn = document.getElementById('aa-apply-btn');
    if (btn) { btn.textContent = `Tilldela ${n} pass`; btn.disabled = n === 0; }
  }

  async function aaApply() {
    const pairs = aaSelectedPairs();
    if (!pairs.length) return;
    if (!confirm(`Tilldela ${pairs.length} pass?`)) return;
    const btn = document.getElementById('aa-apply-btn');
    btn.disabled = true; btn.textContent = 'Sparar…';
    try {
      const res = await api('/api/auto-assign/apply', { method: 'POST', body: { from: aa.from, to: aa.to, max_per_day: aa.max_per_day, pairs } });
      closeModal();
      toast(`${res.applied} pass tilldelade`);
      if (res.skipped.length) toast(`${res.skipped.length} hoppades över eftersom något ändrats sedan förslaget (t.ex. passet blev fullt).`, 'info');
      aa.preview = null;
      if (currentPage === 'tasks') renderTasks(); else navigate(currentPage);
    } catch (err) {
      toast(err.message, 'error');
      btn.disabled = false; aaUpdateApply();
    }
  }

  // ---------------------------------------------------------------------------
  // TEMPLATES (Admin)
  // ---------------------------------------------------------------------------
  const DAY_NAMES_MAP = {
    1: 'Måndag', 2: 'Tisdag', 3: 'Onsdag', 4: 'Torsdag',
    5: 'Fredag', 6: 'Lördag', 7: 'Söndag',
  };
  const DAY_SHORT = { 1: 'Mån', 2: 'Tis', 3: 'Ons', 4: 'Tor', 5: 'Fre', 6: 'Lör', 7: 'Sön' };

  // ---------------------------------------------------------------------------
  // Template selection (Grundbemanning)
  // ---------------------------------------------------------------------------
  let selectedTemplateIds = new Set();

  function updateTemplateBulkToolbar() {
    const toolbar = document.getElementById('template-bulk-toolbar');
    if (!toolbar) return;
    const count = selectedTemplateIds.size;
    if (count === 0) {
      toolbar.classList.add('hidden');
    } else {
      toolbar.classList.remove('hidden');
      document.getElementById('template-bulk-count').textContent = count;
    }
    const selectAll = document.getElementById('select-all-templates-cb');
    if (selectAll) {
      const visible = document.querySelectorAll('.template-card-cb');
      selectAll.checked = visible.length > 0 && count >= visible.length;
      selectAll.indeterminate = count > 0 && count < visible.length;
    }
  }

  function toggleTemplateSelect(id, checked) {
    if (checked) selectedTemplateIds.add(id);
    else selectedTemplateIds.delete(id);
    updateTemplateBulkToolbar();
  }

  function toggleSelectAllTemplates(checked) {
    document.querySelectorAll('.template-card-cb').forEach(cb => {
      const id = parseInt(cb.value);
      cb.checked = checked;
      if (checked) selectedTemplateIds.add(id);
      else selectedTemplateIds.delete(id);
    });
    updateTemplateBulkToolbar();
  }

  function clearTemplateSelection() {
    selectedTemplateIds.clear();
    document.querySelectorAll('.template-card-cb').forEach(cb => { cb.checked = false; });
    updateTemplateBulkToolbar();
  }

  async function renderTemplates() {
    if (currentUser.role !== 'admin') return navigate('dashboard');
    const el = document.getElementById('main-content');

    let templates = [];
    try {
      templates = await api('/api/templates') || [];
    } catch (err) {
      el.innerHTML = `<p class="text-red-500">${escHtml(err.message)}</p>`;
      return;
    }

    window._allTemplates = templates;

    el.innerHTML = `
      <div class="flex flex-col sm:flex-row sm:items-center justify-between mb-6 gap-4">
        <div>
          <h2 class="text-2xl font-bold">Mallar</h2>
          <p class="text-gray-500 dark:text-gray-400 text-sm">Skapa mallar för återkommande pass och generera uppgifter</p>
        </div>
        <button class="btn-primary" onclick="window.FV.openTemplateModal()">+ Ny mall</button>
      </div>

      <div id="template-bulk-toolbar" class="hidden mb-4 p-3 bg-yellow-50 dark:bg-club-black/50 border border-yellow-200 dark:border-club-yellow/50 rounded-lg flex flex-wrap items-center gap-3">
        <span class="text-sm font-medium text-club-black dark:text-club-yellow"><span id="template-bulk-count">0</span> mallar valda (Grundbemanning)</span>
        <button class="btn-sm bg-club-yellow hover:bg-club-yellow-dark text-club-black px-3 py-1.5 rounded-lg text-sm font-medium" onclick="window.FV.openBulkGenerateModal()">Generera uppgifter för valda</button>
        <button class="text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 ml-auto" onclick="window.FV.clearTemplateSelection()">Avmarkera alla</button>
      </div>

      ${templates.length === 0
        ? `<div class="card p-12 text-center">
            <div class="text-4xl mb-3">📋</div>
            <p class="text-gray-500 dark:text-gray-400 mb-4">Inga mallar skapade ännu</p>
            <button class="btn-primary" onclick="window.FV.openTemplateModal()">Skapa din första mall</button>
          </div>`
        : `<div class="flex items-center gap-2 mb-3">
            <label class="flex items-center gap-2 cursor-pointer select-none text-sm text-gray-600 dark:text-gray-400">
              <input type="checkbox" id="select-all-templates-cb" class="rounded border-gray-300 text-club-yellow focus:ring-club-yellow" onchange="window.FV.toggleSelectAllTemplates(this.checked)">
              Välj alla
            </label>
          </div>
          <div class="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            ${templates.map(t => renderTemplateCard(t)).join('')}
          </div>`
      }
    `;
    updateTemplateBulkToolbar();
  }

  function renderTemplateCard(t) {
    const dayBadges = t.days.sort((a, b) => a - b).map(d =>
      `<span class="inline-block px-1.5 py-0.5 rounded text-[10px] font-medium bg-yellow-100 text-club-black dark:bg-club-black dark:text-club-yellow">${DAY_SHORT[d] || d}</span>`
    ).join(' ');
    const checked = selectedTemplateIds.has(t.id);

    return `
      <div class="card p-5 flex flex-col ${checked ? 'ring-2 ring-club-yellow dark:ring-club-yellow' : ''}">
        <div class="flex items-start justify-between mb-3">
          <div class="flex items-center gap-2 min-w-0">
            <input type="checkbox" class="template-card-cb rounded border-gray-300 text-club-yellow focus:ring-club-yellow flex-shrink-0" value="${t.id}" ${checked ? 'checked' : ''} onclick="event.stopPropagation()" onchange="window.FV.toggleTemplateSelect(${t.id}, this.checked)">
            ${t.category_color ? `<div class="w-3 h-3 rounded-full flex-shrink-0" style="background:${safeColor(t.category_color)}"></div>` : ''}
            <h3 class="font-semibold text-sm truncate">${escHtml(t.name)}</h3>
          </div>
          <div class="flex gap-1 flex-shrink-0 ml-2">
            <button class="p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-600" title="Redigera" onclick="window.FV.openTemplateModal(${t.id})">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>
            </button>
            <button class="p-1 rounded hover:bg-red-100 dark:hover:bg-red-900/30 text-red-500" title="Ta bort" onclick="window.FV.deleteTemplate(${t.id})">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
            </button>
          </div>
        </div>

        <div class="space-y-2 text-sm flex-1">
          <p class="text-gray-600 dark:text-gray-400">${escHtml(t.title)}</p>
          ${t.description ? `<p class="text-xs text-gray-400 line-clamp-2">${escHtml(t.description)}</p>` : ''}

          <div class="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
            <span>🕐 ${escHtml(t.start_time)} – ${escHtml(t.end_time)}</span>
            ${t.location ? `<span>📍 ${escHtml(t.location)}</span>` : ''}
          </div>

          ${t.slots > 0 ? `<p class="text-xs text-gray-500 dark:text-gray-400">👥 ${t.slots} platser${t.skoterkort_slots > 0 ? `, varav ${t.skoterkort_slots} med skoterkort 🛷` : ''}</p>` : ''}

          <div class="flex flex-wrap gap-1 mt-1">
            ${dayBadges || '<span class="text-xs text-gray-400">Inga dagar valda</span>'}
          </div>
        </div>

        <div class="mt-4 pt-3 border-t border-gray-200 dark:border-gray-700">
          <button class="btn-primary btn-sm w-full" onclick="window.FV.openGenerateModal(${t.id}, '${escHtml(t.name).replace(/'/g, "\\'")}')">Generera uppgifter</button>
        </div>
      </div>
    `;
  }

  async function openTemplateModal(templateId) {
    let tmpl = null;
    let categories = [];

    try {
      categories = await api('/api/categories') || [];
      if (templateId) tmpl = await api(`/api/templates/${templateId}`);
    } catch { /* use defaults */ }

    const isEdit = !!tmpl;
    const selectedDays = isEdit ? new Set(tmpl.days) : new Set();

    openModal(`
      <div class="p-6">
        <div class="flex items-center justify-between mb-6">
          <h3 class="text-lg font-semibold">${isEdit ? 'Redigera mall' : 'Ny mall'}</h3>
          <button onclick="window.FV.closeModal()" class="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 text-xl">×</button>
        </div>
        <form id="template-form" class="space-y-4">
          <div>
            <label class="label">Mallnamn *</label>
            <input class="input" name="name" value="${isEdit ? escHtml(tmpl.name) : ''}" placeholder="T.ex. Kioskpass helg" required>
          </div>
          <div>
            <label class="label">Uppgiftstitel *</label>
            <input class="input" name="title" value="${isEdit ? escHtml(tmpl.title) : ''}" placeholder="Titeln som skapas på varje uppgift" required>
          </div>
          <div>
            <label class="label">Beskrivning</label>
            <textarea class="input" name="description" rows="2" placeholder="Valfri beskrivning">${isEdit ? escHtml(tmpl.description || '') : ''}</textarea>
          </div>
          <div class="grid grid-cols-2 gap-4">
            <div>
              <label class="label">Plats</label>
              <input class="input" name="location" value="${isEdit ? escHtml(tmpl.location || '') : ''}">
            </div>
            <div>
              <label class="label">Kategori</label>
              <select class="input" name="category_id">
                <option value="">Välj kategori</option>
                ${categories.map(c => `<option value="${c.id}" ${isEdit && tmpl.category_id == c.id ? 'selected' : ''}>${escHtml(c.name)}</option>`).join('')}
              </select>
            </div>
          </div>
          <div class="grid grid-cols-3 gap-4">
            <div>
              <label class="label">Starttid *</label>
              <input class="input" type="time" name="start_time" value="${isEdit ? tmpl.start_time : '10:00'}" required>
            </div>
            <div>
              <label class="label">Sluttid *</label>
              <input class="input" type="time" name="end_time" value="${isEdit ? tmpl.end_time : '15:00'}" required>
            </div>
            <div>
              <label class="label">Antal platser</label>
              <input class="input" type="number" name="slots" min="0" value="${isEdit ? (tmpl.slots || 0) : 0}">
            </div>
          </div>
          <div>
            <label class="label">Dagar *</label>
            <div class="flex flex-wrap gap-2">
              ${[1,2,3,4,5,6,7].map(d => `
                <label class="flex items-center gap-1.5 cursor-pointer select-none">
                  <input type="checkbox" name="days" value="${d}" ${selectedDays.has(d) ? 'checked' : ''} class="rounded border-gray-300 text-club-yellow focus:ring-club-yellow">
                  <span class="text-sm">${DAY_NAMES_MAP[d]}</span>
                </label>
              `).join('')}
            </div>
          </div>
          <div>
            <label class="label">🛷 Varav platser som kräver skoterkort</label>
            <input class="input sm:w-40" type="number" name="skoterkort_slots" min="0" value="${isEdit ? (tmpl.skoterkort_slots || 0) : 0}">
            <p class="text-xs text-gray-500 dark:text-gray-400 mt-0.5">T.ex. Liftvärd: 2 platser, varav 1 kräver skoterkort. Bara personer med skoterkort kan ta de platserna.</p>
          </div>
          <div class="flex gap-3 pt-2">
            <button type="submit" class="btn-primary flex-1">${isEdit ? 'Spara' : 'Skapa mall'}</button>
            <button type="button" class="btn-secondary" onclick="window.FV.closeModal()">Avbryt</button>
          </div>
        </form>
      </div>
    `);

    document.getElementById('template-form').onsubmit = async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const days = fd.getAll('days').map(Number);
      if (days.length === 0) { toast('Välj minst en dag', 'error'); return; }

      const body = {
        name: fd.get('name'),
        title: fd.get('title'),
        description: fd.get('description'),
        location: fd.get('location'),
        category_id: fd.get('category_id') ? parseInt(fd.get('category_id')) : null,
        start_time: fd.get('start_time'),
        end_time: fd.get('end_time'),
        slots: parseInt(fd.get('slots')) || 0,
        days,
        skoterkort_slots: parseInt(fd.get('skoterkort_slots')) || 0,
      };

      try {
        if (isEdit) {
          await api(`/api/templates/${tmpl.id}`, { method: 'PUT', body });
          toast('Mall uppdaterad');
        } else {
          await api('/api/templates', { method: 'POST', body });
          toast('Mall skapad');
        }
        closeModal();
        renderTemplates();
      } catch (err) {
        toast(err.message, 'error');
      }
    };
  }

  async function deleteTemplate(id) {
    if (!confirm('Vill du ta bort denna mall?')) return;
    try {
      await api(`/api/templates/${id}`, { method: 'DELETE' });
      toast('Mall borttagen');
      renderTemplates();
    } catch (err) {
      toast(err.message, 'error');
    }
  }

  function openGenerateModal(templateId, templateName) {
    const today = localDate(new Date());
    const nextMonth = new Date();
    nextMonth.setMonth(nextMonth.getMonth() + 1);
    const nextMonthStr = localDate(nextMonth);

    openModal(`
      <div class="p-6">
        <div class="flex items-center justify-between mb-4">
          <div>
            <h3 class="text-lg font-semibold">Generera uppgifter</h3>
            <p class="text-sm text-gray-500 dark:text-gray-400">Från mall: ${escHtml(templateName)}</p>
          </div>
          <button onclick="window.FV.closeModal()" class="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 text-xl">×</button>
        </div>
        <form id="generate-form" class="space-y-4">
          <p class="text-sm text-gray-600 dark:text-gray-400">Välj datumintervall – uppgifter skapas för varje matchande dag inom perioden.</p>
          <div class="grid grid-cols-2 gap-4">
            <div>
              <label class="label">Från *</label>
              <input class="input" type="date" name="from" value="${today}" required>
            </div>
            <div>
              <label class="label">Till *</label>
              <input class="input" type="date" name="to" value="${nextMonthStr}" required>
            </div>
          </div>
          <div id="generate-result" class="hidden"></div>
          <div class="flex gap-3 pt-2">
            <button type="submit" class="btn-success flex-1" id="generate-btn">Generera</button>
            <button type="button" class="btn-secondary" onclick="window.FV.closeModal()">Stäng</button>
          </div>
        </form>
      </div>
    `);

    document.getElementById('generate-form').onsubmit = async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const btn = document.getElementById('generate-btn');
      btn.disabled = true;
      btn.textContent = 'Genererar...';

      try {
        const result = await api(`/api/templates/${templateId}/generate`, {
          method: 'POST',
          body: { from: fd.get('from'), to: fd.get('to') },
        });
        const resEl = document.getElementById('generate-result');
        resEl.classList.remove('hidden');
        resEl.innerHTML = `
          <div class="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4">
            <p class="text-green-700 dark:text-green-300 font-medium">✓ ${result.created} uppgift${result.created !== 1 ? 'er' : ''} skapade!</p>
            <p class="text-sm text-green-600 dark:text-green-400 mt-1">Uppgifterna syns nu i kalendern och uppgiftslistan.</p>
          </div>
        `;
        btn.textContent = 'Klart!';
      } catch (err) {
        toast(err.message, 'error');
        btn.disabled = false;
        btn.textContent = 'Generera';
      }
    };
  }

  function openBulkGenerateModal() {
    const ids = [...selectedTemplateIds];
    if (ids.length === 0) return;

    const today = localDate(new Date());
    const nextMonth = new Date();
    nextMonth.setMonth(nextMonth.getMonth() + 1);
    const nextMonthStr = localDate(nextMonth);

    openModal(`
      <div class="p-6">
        <div class="flex items-center justify-between mb-4">
          <div>
            <h3 class="text-lg font-semibold">Grundbemanning – generera uppgifter</h3>
            <p class="text-sm text-gray-500 dark:text-gray-400">${ids.length} mallar valda. Uppgifter skapas för varje mall inom datumintervallet.</p>
          </div>
          <button onclick="window.FV.closeModal()" class="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 text-xl">×</button>
        </div>
        <form id="bulk-generate-form" class="space-y-4">
          <div class="grid grid-cols-2 gap-4">
            <div>
              <label class="label">Från *</label>
              <input class="input" type="date" name="from" value="${today}" required>
            </div>
            <div>
              <label class="label">Till *</label>
              <input class="input" type="date" name="to" value="${nextMonthStr}" required>
            </div>
          </div>
          <div id="bulk-generate-result" class="hidden"></div>
          <div class="flex gap-3 pt-2">
            <button type="submit" class="btn-success flex-1" id="bulk-generate-btn">Generera för alla valda mallar</button>
            <button type="button" class="btn-secondary" onclick="window.FV.closeModal()">Avbryt</button>
          </div>
        </form>
      </div>
    `);

    document.getElementById('bulk-generate-form').onsubmit = async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const from = fd.get('from');
      const to = fd.get('to');
      const btn = document.getElementById('bulk-generate-btn');
      const resEl = document.getElementById('bulk-generate-result');
      btn.disabled = true;
      btn.textContent = 'Genererar...';
      resEl.classList.add('hidden');

      let totalCreated = 0;
      let errors = [];

      for (const templateId of ids) {
        try {
          const result = await api(`/api/templates/${templateId}/generate`, {
            method: 'POST',
            body: { from, to },
          });
          totalCreated += result.created || 0;
        } catch (err) {
          const name = (window._allTemplates || []).find(t => t.id === templateId)?.name || templateId;
          errors.push(name + ': ' + err.message);
        }
      }

      resEl.classList.remove('hidden');
      resEl.innerHTML = `
        <div class="rounded-lg p-4 ${errors.length === 0 ? 'bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800' : 'bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800'}">
          <p class="font-medium ${errors.length === 0 ? 'text-green-700 dark:text-green-300' : 'text-yellow-800 dark:text-yellow-200'}">✓ ${totalCreated} uppgift${totalCreated !== 1 ? 'er' : ''} skapade från ${ids.length} mallar.</p>
          ${errors.length > 0 ? `<p class="text-sm text-yellow-700 dark:text-yellow-300 mt-2">Varningar:</p><ul class="text-xs list-disc list-inside mt-1">${errors.map(e => '<li>' + escHtml(e) + '</li>').join('')}</ul>` : '<p class="text-sm text-green-600 dark:text-green-400 mt-1">Uppgifterna syns i kalendern och uppgiftslistan.</p>'}
        </div>
      `;
      btn.textContent = 'Klart!';
      btn.disabled = false;
      clearTemplateSelection();
    };
  }

  // ---------------------------------------------------------------------------
  // STATISTICS (Admin)
  // ---------------------------------------------------------------------------
  async function renderStatistics() {
    if (currentUser.role !== 'admin') return navigate('dashboard');
    const el = document.getElementById('main-content');

    let stats = [];
    try {
      stats = await api('/api/users/assignment-stats') || [];
    } catch (err) {
      el.innerHTML = `<p class="text-red-500">${escHtml(err.message)}</p>`;
      return;
    }

    const withTasks = stats.filter(s => s.total_assignments > 0);
    const withoutTasks = stats.filter(s => s.total_assignments === 0);
    const maxAssignments = Math.max(...stats.map(s => s.total_assignments), 1);

    el.innerHTML = `
      <div class="mb-8">
        <h2 class="text-2xl font-bold mb-1">Statistik</h2>
        <p class="text-gray-500 dark:text-gray-400">Översikt av arbetsfördelning per person</p>
      </div>

      <!-- Summary cards -->
      <div class="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <div class="card p-5">
          <p class="text-sm text-gray-500 dark:text-gray-400">Totalt medlemmar</p>
          <p class="text-3xl font-bold mt-1">${stats.length}</p>
        </div>
        <div class="card p-5">
          <p class="text-sm text-gray-500 dark:text-gray-400">Har tagit pass</p>
          <p class="text-3xl font-bold mt-1 text-green-600 dark:text-green-400">${withTasks.length}</p>
        </div>
        <div class="card p-5">
          <p class="text-sm text-gray-500 dark:text-gray-400">Utan pass</p>
          <p class="text-3xl font-bold mt-1 text-red-600 dark:text-red-400">${withoutTasks.length}</p>
        </div>
        <div class="card p-5">
          <p class="text-sm text-gray-500 dark:text-gray-400">Totalt tilldelningar</p>
          <p class="text-3xl font-bold mt-1 text-club-yellow dark:text-yellow-400">${stats.reduce((s, u) => s + u.total_assignments, 0)}</p>
        </div>
      </div>

      <!-- Tabs -->
      <div class="flex gap-1 mb-6 bg-gray-100 dark:bg-gray-700 rounded-lg p-0.5 w-fit">
        <button id="stat-tab-all" class="px-4 py-2 text-sm rounded-md font-medium bg-white dark:bg-gray-600 shadow-sm" onclick="window.FV.switchStatTab('all')">Alla (${stats.length})</button>
        <button id="stat-tab-active" class="px-4 py-2 text-sm rounded-md font-medium" onclick="window.FV.switchStatTab('active')">Har pass (${withTasks.length})</button>
        <button id="stat-tab-inactive" class="px-4 py-2 text-sm rounded-md font-medium" onclick="window.FV.switchStatTab('inactive')">Utan pass (${withoutTasks.length})</button>
      </div>

      <!-- All members with tasks -->
      <div id="stat-all" class="card overflow-hidden">
        <div class="overflow-x-auto">
          <table class="w-full text-sm">
            <thead>
              <tr class="bg-gray-50 dark:bg-gray-700/50 text-left">
                <th class="px-4 py-3 font-medium">Person</th>
                <th class="px-4 py-3 font-medium">Pass</th>
                <th class="px-4 py-3 font-medium hidden sm:table-cell">Fördelning</th>
                <th class="px-4 py-3 font-medium hidden md:table-cell">Klara</th>
                <th class="px-4 py-3 font-medium hidden md:table-cell">Accepterade</th>
                <th class="px-4 py-3 font-medium hidden lg:table-cell">Tilldelade</th>
                <th class="px-4 py-3 font-medium hidden lg:table-cell">Nekade</th>
                <th class="px-4 py-3 font-medium w-10"></th>
              </tr>
            </thead>
            <tbody class="divide-y divide-gray-200 dark:divide-gray-700">
              ${stats.map(u => renderStatRow(u, maxAssignments)).join('')}
            </tbody>
          </table>
        </div>
      </div>

      <!-- Active members -->
      <div id="stat-active" class="card overflow-hidden hidden">
        <div class="overflow-x-auto">
          <table class="w-full text-sm">
            <thead>
              <tr class="bg-gray-50 dark:bg-gray-700/50 text-left">
                <th class="px-4 py-3 font-medium">Person</th>
                <th class="px-4 py-3 font-medium">Pass</th>
                <th class="px-4 py-3 font-medium hidden sm:table-cell">Fördelning</th>
                <th class="px-4 py-3 font-medium hidden md:table-cell">Klara</th>
                <th class="px-4 py-3 font-medium hidden md:table-cell">Accepterade</th>
                <th class="px-4 py-3 font-medium hidden lg:table-cell">Tilldelade</th>
                <th class="px-4 py-3 font-medium hidden lg:table-cell">Nekade</th>
                <th class="px-4 py-3 font-medium w-10"></th>
              </tr>
            </thead>
            <tbody class="divide-y divide-gray-200 dark:divide-gray-700">
              ${withTasks.map(u => renderStatRow(u, maxAssignments)).join('')}
            </tbody>
          </table>
        </div>
      </div>

      <!-- Members without tasks -->
      <div id="stat-inactive" class="card overflow-hidden hidden">
        ${withoutTasks.length === 0 ? `
          <div class="p-8 text-center text-gray-400">Alla medlemmar har minst ett pass!</div>
        ` : `
          <div class="p-4 mb-0 bg-red-50 dark:bg-red-900/20 border-b border-red-100 dark:border-red-900/30">
            <p class="text-sm text-red-700 dark:text-red-300 font-medium">${withoutTasks.length} medlem${withoutTasks.length !== 1 ? 'mar' : ''} har inte tagit något pass</p>
          </div>
          <div class="divide-y divide-gray-200 dark:divide-gray-700">
            ${withoutTasks.map(u => `
              <div class="flex items-center justify-between px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-700/30">
                <div class="flex items-center gap-3">
                  <div class="w-9 h-9 bg-red-100 dark:bg-red-900/40 rounded-full flex items-center justify-center text-sm font-bold text-red-600 dark:text-red-300">${escHtml(u.name.charAt(0))}</div>
                  <div>
                    <p class="font-medium text-sm">${escHtml(u.name)}</p>
                    <p class="text-xs text-gray-500 dark:text-gray-400">${escHtml(u.email)}${u.phone ? ' · ' + escHtml(u.phone) : ''}</p>
                  </div>
                </div>
                <span class="badge bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300">0 pass</span>
              </div>
            `).join('')}
          </div>
        `}
      </div>
    `;
  }

  function renderStatRow(u, max) {
    const pct = max > 0 ? Math.round(u.total_assignments / max * 100) : 0;
    return `
      <tr class="hover:bg-gray-50 dark:hover:bg-gray-700/30">
        <td class="px-4 py-3">
          <div class="flex items-center gap-3">
            <div class="w-8 h-8 ${u.total_assignments > 0 ? 'bg-yellow-100 dark:bg-club-black' : 'bg-red-100 dark:bg-red-900/40'} rounded-full flex items-center justify-center text-sm font-bold ${u.total_assignments > 0 ? 'text-club-yellow dark:text-club-yellow' : 'text-red-600 dark:text-red-300'}">${escHtml(u.name.charAt(0))}</div>
            <div>
              <p class="font-medium text-sm">${escHtml(u.name)}</p>
              <p class="text-xs text-gray-500 dark:text-gray-400 hidden sm:block">${escHtml(u.email)}</p>
            </div>
          </div>
        </td>
        <td class="px-4 py-3">
          <span class="text-lg font-bold ${u.total_assignments > 0 ? '' : 'text-red-500'}">${u.total_assignments}</span>
        </td>
        <td class="px-4 py-3 hidden sm:table-cell">
          <div class="w-full max-w-[120px] bg-gray-200 dark:bg-gray-700 rounded-full h-2">
            <div class="h-2 rounded-full bg-club-yellow" style="width:${pct}%"></div>
          </div>
        </td>
        <td class="px-4 py-3 hidden md:table-cell">
          ${u.done_count > 0 ? `<span class="badge bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300">${u.done_count}</span>` : '<span class="text-gray-300 dark:text-gray-600">–</span>'}
        </td>
        <td class="px-4 py-3 hidden md:table-cell">
          ${u.accepted_count > 0 ? `<span class="badge bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300">${u.accepted_count}</span>` : '<span class="text-gray-300 dark:text-gray-600">–</span>'}
        </td>
        <td class="px-4 py-3 hidden lg:table-cell">
          ${u.assigned_count > 0 ? `<span class="badge bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300">${u.assigned_count}</span>` : '<span class="text-gray-300 dark:text-gray-600">–</span>'}
        </td>
        <td class="px-4 py-3 hidden lg:table-cell">
          ${u.declined_count > 0 ? `<span class="badge bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300">${u.declined_count}</span>` : '<span class="text-gray-300 dark:text-gray-600">–</span>'}
        </td>
        <td class="px-4 py-3">
          ${u.total_assignments > 0 ? `<button class="p-1.5 rounded hover:bg-gray-200 dark:hover:bg-gray-600" title="Visa detaljer" onclick="window.FV.showPersonStats(${u.id}, '${escHtml(u.name)}')">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/></svg>
          </button>` : ''}
        </td>
      </tr>
    `;
  }

  function switchStatTab(tab) {
    ['all', 'active', 'inactive'].forEach(id => {
      document.getElementById('stat-' + id).classList.toggle('hidden', id !== tab);
      const btn = document.getElementById('stat-tab-' + id);
      if (id === tab) {
        btn.classList.add('bg-white', 'dark:bg-gray-600', 'shadow-sm');
      } else {
        btn.classList.remove('bg-white', 'dark:bg-gray-600', 'shadow-sm');
      }
    });
  }

  async function showPersonStats(userId, name) {
    try {
      const assignments = await api(`/api/users/${userId}/assignments`);
      if (!assignments) return;

      openModal(`
        <div class="p-6">
          <div class="flex items-center justify-between mb-4">
            <div>
              <h3 class="text-lg font-semibold">${escHtml(name)}</h3>
              <p class="text-sm text-gray-500 dark:text-gray-400">${assignments.length} pass totalt</p>
            </div>
            <button onclick="window.FV.closeModal()" class="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 text-xl">×</button>
          </div>
          ${assignments.length === 0
            ? '<p class="text-gray-400 text-center py-4">Inga pass</p>'
            : `<div class="space-y-2 max-h-[60vh] overflow-y-auto">${assignments.map(a => `
              <div class="flex items-start gap-3 p-3 rounded-lg border border-gray-200 dark:border-gray-700">
                <div class="w-1.5 self-stretch rounded-full flex-shrink-0" style="background:${safeColor(a.category_color)}"></div>
                <div class="flex-1 min-w-0">
                  <div class="flex items-center gap-2 flex-wrap">
                    <p class="font-medium text-sm">${escHtml(a.title)}</p>
                    ${statusBadge(a.assignment_status)}
                  </div>
                  <p class="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                    ${formatDateTime(a.start_datetime)} – ${formatTime(a.end_datetime)}
                    ${a.location ? ' · 📍 ' + escHtml(a.location) : ''}
                  </p>
                  ${a.category_name ? `<p class="text-xs text-gray-400 mt-0.5">${escHtml(a.category_name)}</p>` : ''}
                  ${a.comment ? `<p class="text-xs text-gray-400 mt-1 italic">💬 ${escHtml(a.comment)}</p>` : ''}
                </div>
              </div>
            `).join('')}</div>`}
        </div>
      `);
    } catch (err) {
      toast(err.message, 'error');
    }
  }

  // ---------------------------------------------------------------------------
  // MY TASKS (User view)
  // ---------------------------------------------------------------------------
  async function renderMyTasks() {
    const el = document.getElementById('main-content');

    try {
      const data = await api('/api/tasks/my');
      const upcoming = data?.upcoming || [];
      const history = data?.history || [];

      el.innerHTML = `
        <div class="mb-6">
          <h2 class="text-2xl font-bold mb-1">Mina uppgifter</h2>
          <p class="text-gray-500 dark:text-gray-400">Uppgifter tilldelade till dig</p>
        </div>

        <!-- Tabs -->
        <div class="flex gap-1 mb-6 bg-gray-100 dark:bg-gray-700 rounded-lg p-0.5 w-fit">
          <button id="tab-upcoming" class="px-4 py-2 text-sm rounded-md font-medium bg-white dark:bg-gray-600 shadow-sm" onclick="window.FV.switchMyTab('upcoming')">Kommande</button>
          <button id="tab-history" class="px-4 py-2 text-sm rounded-md font-medium" onclick="window.FV.switchMyTab('history')">Historik</button>
        </div>

        <div id="my-upcoming" class="space-y-3">
          ${renderMyTaskCards(upcoming, 'upcoming')}
        </div>
        <div id="my-history" class="space-y-3 hidden">
          ${renderMyTaskCards(history, 'history')}
        </div>
      `;
    } catch (err) {
      el.innerHTML = `<p class="text-red-500">${escHtml(err.message)}</p>`;
    }
  }

  function renderMyTaskCards(assignments, type) {
    window._myAssignmentComments = window._myAssignmentComments || {};
    (assignments || []).forEach(a => { window._myAssignmentComments[a.id] = a.comment || ''; });
    if (!assignments || assignments.length === 0) {
      return `<div class="card p-8 text-center text-gray-400">Inga ${type === 'upcoming' ? 'kommande' : 'tidigare'} uppgifter</div>`;
    }
    return assignments.map(a => `
      <div class="card p-4">
        <div class="flex items-start justify-between gap-4">
          <div class="flex items-start gap-3 min-w-0 flex-1">
            <div class="w-3 h-3 rounded-full mt-1.5 flex-shrink-0" style="background:${safeColor(a.category_color)}"></div>
            <div class="min-w-0">
              <p class="font-medium">${escHtml(a.title)}</p>
              <p class="text-sm text-gray-500 dark:text-gray-400 mt-0.5">${formatDateTime(a.start_datetime)} – ${formatTime(a.end_datetime)}</p>
              ${a.location ? `<p class="text-sm text-gray-500 dark:text-gray-400">📍 ${escHtml(a.location)}</p>` : ''}
              ${a.description ? `<p class="text-sm text-gray-500 dark:text-gray-400 mt-1">${escHtml(a.description)}</p>` : ''}
              <div class="flex items-center gap-2 mt-2">
                ${statusBadge(a.status)}
                ${a.comment ? `<span class="text-xs text-gray-400">💬 ${escHtml(a.comment)}</span>` : ''}
              </div>
            </div>
          </div>
          <div class="flex flex-col gap-1.5 flex-shrink-0">
            ${a.status === 'assigned' ? `
              <button class="btn-success btn-sm" onclick="window.FV.updateMyAssignment(${a.id}, 'accepted')">Acceptera</button>
              <button class="btn-secondary btn-sm" onclick="window.FV.updateMyAssignment(${a.id}, 'declined')">Neka</button>
            ` : ''}
            ${a.status === 'accepted' ? `
              <button class="btn-primary btn-sm" onclick="window.FV.updateMyAssignment(${a.id}, 'done')">Markera klar</button>
            ` : ''}
            <button class="btn-secondary btn-sm" onclick="window.FV.commentAssignment(${a.id})">Kommentera</button>
          </div>
        </div>
      </div>
    `).join('');
  }

  function switchMyTab(tab) {
    const upcoming = document.getElementById('my-upcoming');
    const history = document.getElementById('my-history');
    const tabUpcoming = document.getElementById('tab-upcoming');
    const tabHistory = document.getElementById('tab-history');

    if (tab === 'upcoming') {
      upcoming.classList.remove('hidden');
      history.classList.add('hidden');
      tabUpcoming.classList.add('bg-white', 'dark:bg-gray-600', 'shadow-sm');
      tabHistory.classList.remove('bg-white', 'dark:bg-gray-600', 'shadow-sm');
    } else {
      upcoming.classList.add('hidden');
      history.classList.remove('hidden');
      tabHistory.classList.add('bg-white', 'dark:bg-gray-600', 'shadow-sm');
      tabUpcoming.classList.remove('bg-white', 'dark:bg-gray-600', 'shadow-sm');
    }
  }

  async function updateMyAssignment(id, status) {
    try {
      await api(`/api/assignments/${id}`, { method: 'PUT', body: { status } });
      toast(status === 'accepted' ? 'Accepterad!' : status === 'done' ? 'Markerad som klar!' : 'Uppdaterad');
      renderMyTasks();
    } catch (err) {
      toast(err.message, 'error');
    }
  }

  function commentAssignment(id) {
    const existing = (window._myAssignmentComments || {})[id] || '';
    const comment = prompt('Skriv en kommentar:', existing);
    if (comment === null) return;
    api(`/api/assignments/${id}`, { method: 'PUT', body: { comment } })
      .then(() => { toast('Kommentar sparad'); renderMyTasks(); })
      .catch(err => toast(err.message, 'error'));
  }

  // ---------------------------------------------------------------------------
  // Calendar navigation
  // ---------------------------------------------------------------------------
  function calPrev() {
    if (calendarView === 'month') {
      calendarDate.setMonth(calendarDate.getMonth() - 1);
    } else {
      calendarDate.setDate(calendarDate.getDate() - 7);
    }
    renderCalendarBody();
  }

  function calNext() {
    if (calendarView === 'month') {
      calendarDate.setMonth(calendarDate.getMonth() + 1);
    } else {
      calendarDate.setDate(calendarDate.getDate() + 7);
    }
    renderCalendarBody();
  }

  function calToday() {
    calendarDate = new Date();
    renderCalendarBody();
  }

  function setCalView(view) {
    calendarView = view;
    renderCalendar();
  }

  // ---------------------------------------------------------------------------
  // Event Listeners
  // ---------------------------------------------------------------------------
  function init() {
    initDarkMode();

    document.getElementById('login-form').addEventListener('submit', handleLogin);
    document.getElementById('logout-btn').addEventListener('click', handleLogout);

    document.getElementById('mobile-menu-btn').addEventListener('click', openSidebar);
    document.getElementById('sidebar-overlay').addEventListener('click', closeSidebar);

    document.getElementById('dark-toggle').addEventListener('click', toggleDarkMode);
    document.getElementById('mobile-dark-toggle').addEventListener('click', toggleDarkMode);

    document.getElementById('modal-backdrop').addEventListener('click', (e) => {
      if (e.target === e.currentTarget) closeModal();
    });

    document.querySelectorAll('.nav-link').forEach((link) => {
      link.addEventListener('click', (e) => {
        e.preventDefault();
        navigate(link.dataset.page);
      });
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') closeModal();
    });

    checkAuth();
  }

  // ---------------------------------------------------------------------------
  // Public API (exposed for onclick handlers)
  // ---------------------------------------------------------------------------
  window.FV = {
    navigate,
    openTaskModal,
    showTaskDetail,
    deleteTask,
    filterTasks,
    toggleTaskSelect,
    toggleSelectAll,
    bulkDeleteTasks,
    openBulkEditModal,
    clearSelection,
    openPersonModal,
    deletePerson,
    filterPeople,
    showPersonDetail,
    openTemplateModal,
    deleteTemplate,
    openGenerateModal,
    openBulkGenerateModal,
    toggleTemplateSelect,
    toggleSelectAllTemplates,
    clearTemplateSelection,
    switchStatTab,
    showPersonStats,
    updateMyAssignment,
    commentAssignment,
    switchMyTab,
    closeModal,
    calPrev,
    calNext,
    calToday,
    setCalView,
    showDayTasks,
    copyMemberLink,
    regenerateMemberLink,
    exportLinks,
    filterAudit,
    undoAudit,
    openAutoAssign,
    ovSetRange,
    ovApplyCustom,
    ovFilter,
    ovSearchPerson,
    ovAutoAssign,
    removeFromTask,
    aaUpdateCount,
    aaSelectAll,
    aaSaveCategorySkill,
    aaPreview,
    aaUpdateApply,
    aaApply,
  };

  document.addEventListener('DOMContentLoaded', init);
})();
