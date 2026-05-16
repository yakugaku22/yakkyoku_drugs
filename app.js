/* ===========================
   薬剤学習ノート - app.js
   =========================== */

const STORAGE_KEY = 'pharma_notes_v1';
const TABS = [
  { id: 'tab1', label: '第1章', range: [1, 30],  title: '薬剤 1〜30' },
  { id: 'tab2', label: '第2章', range: [31, 60], title: '薬剤 31〜60' },
  { id: 'tab3', label: '第3章', range: [61, 90], title: '薬剤 61〜90' },
  { id: 'tab4', label: '第4章', range: [91, 120], title: '薬剤 91〜120' },
];

let drugsData = [];
let notes = {};      // { id: { mechanism, effect, memo, complete } }
let currentTab = 0;
let searchQuery = '';
let filterMode = 'all'; // 'all' | 'complete' | 'incomplete'
let saveTimers = {};

/* ---- LocalStorage ---- */
function loadNotes() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    notes = raw ? JSON.parse(raw) : {};
  } catch { notes = {}; }
}

function saveNotes() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(notes));
}

function getNoteFor(id) {
  return notes[id] || { mechanism: '', effect: '', dosage: '', generic: '', memo: '', complete: false };
}

/* ---- Progress ---- */
function calcProgress() {
  const total = drugsData.length;
  const done = drugsData.filter(d => {
    const n = getNoteFor(d.id);
    return n.complete || (n.mechanism || n.effect || n.memo);
  }).length;
  return { done, total };
}

function updateProgressBar() {
  const { done, total } = calcProgress();
  const pct = Math.round((done / total) * 100);
  const fill = document.getElementById('progress-fill');
  const label = document.getElementById('progress-label');
  if (fill) fill.style.width = pct + '%';
  if (label) label.textContent = `${done} / ${total} 記入済み`;
}

/* ---- Tabs ---- */
function switchTab(idx) {
  currentTab = idx;
  searchQuery = '';
  filterMode = 'all';

  // Update tab buttons
  document.querySelectorAll('.tab-btn').forEach((btn, i) => {
    btn.classList.toggle('active', i === idx);
  });

  // Update page visibility
  document.querySelectorAll('.tab-page').forEach((page, i) => {
    page.classList.toggle('active', i === idx);
  });

  if (idx === GLOBAL_TAB_IDX) {
    // 全章検索タブ: フォーカスだけ当てて再描画
    setTimeout(() => {
      const input = document.getElementById('global-search-input');
      if (input) { input.focus(); }
    }, 50);
    return;
  }

  // Reset search input and filter
  const input = document.getElementById(`search-${idx}`);
  const sel = document.getElementById(`filter-${idx}`);
  if (input) input.value = '';
  if (sel) sel.value = 'all';

  renderPage(idx);
}

/* ---- Render a Page ---- */
function renderPage(idx) {
  const tab = TABS[idx];
  const [start, end] = tab.range;
  let drugs = drugsData.filter(d => d.id >= start && d.id <= end);

  // Filter by search
  if (searchQuery) {
    const q = searchQuery.toLowerCase();
    drugs = drugs.filter(d =>
      d.name.toLowerCase().includes(q) ||
      String(d.id).includes(q)
    );
  }

  // Filter by completion
  if (filterMode === 'complete') {
    drugs = drugs.filter(d => getNoteFor(d.id).complete);
  } else if (filterMode === 'incomplete') {
    drugs = drugs.filter(d => !getNoteFor(d.id).complete);
  }

  const container = document.getElementById(`list-${idx}`);
  const countEl   = document.getElementById(`count-${idx}`);
  if (!container) return;

  if (countEl) {
    const total = drugsData.filter(d => d.id >= start && d.id <= end).length;
    const done  = drugsData.filter(d => d.id >= start && d.id <= end && getNoteFor(d.id).complete).length;
    countEl.textContent = `${drugs.length}件表示 / 完了 ${done}/${total}`;
  }

  if (drugs.length === 0) {
    container.innerHTML = '<div class="empty-state">🔍 該当する薬剤が見つかりません</div>';
    return;
  }

  container.innerHTML = drugs.map(d => buildCardHTML(d)).join('');

  // Attach events
  drugs.forEach(d => attachCardEvents(d.id));
}

/* ---- Build Card HTML ---- */
function buildCardHTML(drug) {
  const n = getNoteFor(drug.id);
  const hasNotes = n.mechanism || n.effect || n.dosage || n.generic || n.memo;
  const compClass  = n.complete ? 'complete'  : '';
  const notesClass = hasNotes   ? 'has-notes' : '';
  const checkIcon  = n.complete ? '✓'         : '';

  return `
<div class="drug-card ${compClass} ${notesClass}" id="card-${drug.id}">
  <div class="card-header" onclick="toggleCard(${drug.id})">
    <span class="card-num">${drug.id}</span>
    <span class="card-name">${escHtml(drug.name)}</span>
    <span class="card-unit">${drug.unit}</span>
    <div class="card-status">${checkIcon}</div>
    <span class="card-chevron">▾</span>
  </div>
  <div class="card-body">
    <div class="note-grid">
      <div class="note-field">
        <label class="note-label"><span class="label-icon">🏷️</span> 一般名（商品名）</label>
        <textarea
          id="generic-${drug.id}"
          placeholder="例）アムロジピンベシル酸塩（アムロジン）"
          oninput="onFieldInput(${drug.id})"
          rows="2"
        >${escHtml(n.generic)}</textarea>
      </div>
      <div class="note-field">
        <label class="note-label"><span class="label-icon">📏</span> 用法・用量</label>
        <textarea
          id="dosage-${drug.id}"
          placeholder="例）1回5mg、1日1回 食後服用"
          oninput="onFieldInput(${drug.id})"
          rows="2"
        >${escHtml(n.dosage)}</textarea>
      </div>
      <div class="note-field">
        <label class="note-label"><span class="label-icon">⚙️</span> 作用機序</label>
        <textarea
          id="mech-${drug.id}"
          placeholder="例）β受容体遮断 → 心拍数↓・血圧↓"
          oninput="onFieldInput(${drug.id})"
        >${escHtml(n.mechanism)}</textarea>
      </div>
      <div class="note-field">
        <label class="note-label"><span class="label-icon">💊</span> 効果・効能</label>
        <textarea
          id="effect-${drug.id}"
          placeholder="例）高血圧、狭心症、不整脈"
          oninput="onFieldInput(${drug.id})"
        >${escHtml(n.effect)}</textarea>
      </div>
      <div class="note-field full-width">
        <label class="note-label"><span class="label-icon">📝</span> メモ・注意点・副作用など</label>
        <textarea
          id="memo-${drug.id}"
          placeholder="例）食後服用、腎機能低下時は減量、妊婦禁忌 etc."
          oninput="onFieldInput(${drug.id})"
        >${escHtml(n.memo)}</textarea>
      </div>
    </div>
    <div class="card-actions">
      <span class="save-status" id="status-${drug.id}"></span>
      <div class="btn-group">
        <button class="btn btn-clear" onclick="clearCard(${drug.id})">クリア</button>
        <button class="btn btn-complete" id="comp-btn-${drug.id}" onclick="toggleComplete(${drug.id})">
          ${n.complete ? '✓ 完了済み' : '完了にする'}
        </button>
        <button class="btn btn-save" onclick="manualSave(${drug.id})">保存</button>
      </div>
    </div>
  </div>
</div>`;
}

/* ---- Card Interactions ---- */
function toggleCard(id) {
  const card = document.getElementById(`card-${id}`);
  if (!card) return;
  card.classList.toggle('expanded');
}

function onFieldInput(id) {
  // Autosave with debounce
  clearTimeout(saveTimers[id]);
  setStatus(id, 'saving', '保存中…');
  saveTimers[id] = setTimeout(() => autoSave(id), 900);
}

function autoSave(id) {
  writeNote(id);
  setStatus(id, 'saved', '✓ 自動保存しました');
  setTimeout(() => setStatus(id, '', ''), 2500);
  updateProgressBar();
  refreshCardClasses(id);
}

function manualSave(id) {
  clearTimeout(saveTimers[id]);
  writeNote(id);
  setStatus(id, 'saved', '✓ 保存しました');
  setTimeout(() => setStatus(id, '', ''), 2500);
  updateProgressBar();
  refreshCardClasses(id);
}

function writeNote(id) {
  const mechanism = (document.getElementById(`mech-${id}`)?.value   || '').trim();
  const effect    = (document.getElementById(`effect-${id}`)?.value || '').trim();
  const dosage    = (document.getElementById(`dosage-${id}`)?.value || '').trim();
  const generic   = (document.getElementById(`generic-${id}`)?.value || '').trim();
  const memo      = (document.getElementById(`memo-${id}`)?.value   || '').trim();
  const prev      = getNoteFor(id);

  notes[id] = { mechanism, effect, dosage, generic, memo, complete: prev.complete };
  saveNotes();
}

function clearCard(id) {
  if (!confirm('このカードのメモをすべてクリアしますか？')) return;
  notes[id] = { mechanism: '', effect: '', memo: '', complete: false };
  saveNotes();

  ['mech', 'effect', 'memo'].forEach(f => {
    const el = document.getElementById(`${f}-${id}`);
    if (el) el.value = '';
  });

  refreshCardClasses(id);
  setStatus(id, '', 'クリアしました');
  updateProgressBar();
}

function toggleComplete(id) {
  writeNote(id);
  const n = getNoteFor(id);
  notes[id].complete = !n.complete;
  saveNotes();

  refreshCardClasses(id);
  updateProgressBar();

  const btn = document.getElementById(`comp-btn-${id}`);
  if (btn) btn.textContent = notes[id].complete ? '✓ 完了済み' : '完了にする';
}

function refreshCardClasses(id) {
  const card = document.getElementById(`card-${id}`);
  if (!card) return;
  const n = getNoteFor(id);
  const hasNotes = n.mechanism || n.effect || n.memo;

  card.classList.toggle('complete', !!n.complete);
  card.classList.toggle('has-notes', !!(hasNotes && !n.complete));

  const statusEl = card.querySelector('.card-status');
  if (statusEl) statusEl.textContent = n.complete ? '✓' : '';

  const compBtn = document.getElementById(`comp-btn-${id}`);
  if (compBtn) compBtn.textContent = n.complete ? '✓ 完了済み' : '完了にする';
}

function setStatus(id, cls, msg) {
  const el = document.getElementById(`status-${id}`);
  if (!el) return;
  el.className = 'save-status ' + cls;
  el.textContent = msg;
}

/* ---- Attach Events (search / filter) ---- */
function attachCardEvents(id) {
  // textarea autosave already wired via oninput in HTML
}

/* ---- Search & Filter (per-tab) ---- */
function onSearch(idx, val) {
  if (idx !== currentTab) return;
  searchQuery = val;
  renderPage(idx);
}

function onFilter(idx, val) {
  if (idx !== currentTab) return;
  filterMode = val;
  renderPage(idx);
}

/* ---- Global Search ---- */
const GLOBAL_TAB_IDX = TABS.length; // index 4

function onGlobalSearch(val) {
  renderGlobalSearch(val.trim());
}

function onGlobalFilter(val) {
  const query = document.getElementById('global-search-input')?.value.trim() || '';
  renderGlobalSearch(query, val);
}

function renderGlobalSearch(query, filter) {
  filter = filter || document.getElementById('global-filter-select')?.value || 'all';
  const countEl   = document.getElementById('global-count');
  const container = document.getElementById('global-list');
  if (!container) return;

  // ヒット件数ゼロ or 空クエリ時
  if (!query && filter === 'all') {
    container.innerHTML = '<div class="empty-state">🔍 薬剤名や番号を入力してください</div>';
    if (countEl) countEl.textContent = '';
    return;
  }

  let results = drugsData.filter(d => {
    const q = query.toLowerCase();
    const matchText = !query ||
      d.name.toLowerCase().includes(q) ||
      String(d.id).includes(q);

    const n = getNoteFor(d.id);
    const matchFilter =
      filter === 'all'        ? true :
      filter === 'complete'   ? n.complete :
      filter === 'incomplete' ? !n.complete : true;

    return matchText && matchFilter;
  });

  if (countEl) countEl.textContent = `${results.length} 件ヒット`;

  if (results.length === 0) {
    container.innerHTML = '<div class="empty-state">😔 該当する薬剤が見つかりません</div>';
    return;
  }

  // 章ラベルを挿入しながらレンダリング
  let html = '';
  let lastChapter = -1;
  results.forEach(d => {
    const chapterIdx = TABS.findIndex(t => d.id >= t.range[0] && d.id <= t.range[1]);
    if (chapterIdx !== lastChapter) {
      const tab = TABS[chapterIdx];
      html += `<div class="global-chapter-label">${tab.label}（${tab.title}）</div>`;
      lastChapter = chapterIdx;
    }
    html += buildCardHTML(d);
  });

  container.innerHTML = html;
  results.forEach(d => attachCardEvents(d.id));

  // クエリをハイライト
  if (query) highlightMatches(container, query);
}

function highlightMatches(container, query) {
  const q = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`(${q})`, 'gi');
  container.querySelectorAll('.card-name').forEach(el => {
    el.innerHTML = el.textContent.replace(re, '<mark class="hl">$1</mark>');
  });
}

/* ---- Build Static Structure ---- */
function buildUI() {
  const tabNav = document.getElementById('tab-nav');

  // 章タブ（1〜4）
  TABS.forEach((tab, i) => {
    const btn = document.createElement('button');
    btn.className = 'tab-btn' + (i === 0 ? ' active' : '');
    btn.innerHTML = `${tab.label} <span class="tab-badge">${tab.range[1] - tab.range[0] + 1}</span>`;
    btn.addEventListener('click', () => switchTab(i));
    tabNav.appendChild(btn);
  });

  // 全章検索タブ
  const globalBtn = document.createElement('button');
  globalBtn.className = 'tab-btn tab-btn-global';
  globalBtn.innerHTML = `🔍 全章検索`;
  globalBtn.addEventListener('click', () => switchTab(GLOBAL_TAB_IDX));
  tabNav.appendChild(globalBtn);

  const pagesWrap = document.getElementById('pages-wrap');

  // 章ページ（1〜4）
  TABS.forEach((tab, i) => {
    const page = document.createElement('div');
    page.className = 'tab-page' + (i === 0 ? ' active' : '');
    page.id = `page-${i}`;
    page.innerHTML = `
      <div class="page-header">
        <span class="page-title">${tab.title}</span>
        <span class="page-count" id="count-${i}"></span>
      </div>
      <div class="controls">
        <div class="search-wrap">
          <span class="search-icon">🔍</span>
          <input
            type="text"
            id="search-${i}"
            placeholder="薬剤名・番号で検索…"
            oninput="onSearch(${i}, this.value)"
          />
        </div>
        <select class="filter-select" id="filter-${i}" onchange="onFilter(${i}, this.value)">
          <option value="all">すべて表示</option>
          <option value="complete">完了のみ</option>
          <option value="incomplete">未完了のみ</option>
        </select>
      </div>
      <div class="drug-list" id="list-${i}"></div>
    `;
    pagesWrap.appendChild(page);
  });

  // 全章検索ページ
  const globalPage = document.createElement('div');
  globalPage.className = 'tab-page';
  globalPage.id = `page-${GLOBAL_TAB_IDX}`;
  globalPage.innerHTML = `
    <div class="page-header">
      <span class="page-title">🔍 全章横断検索</span>
      <span class="page-count" id="global-count"></span>
    </div>
    <div class="controls">
      <div class="search-wrap" style="flex:2">
        <span class="search-icon">🔍</span>
        <input
          type="text"
          id="global-search-input"
          placeholder="1〜120番すべての薬剤名・番号で検索…"
          oninput="onGlobalSearch(this.value)"
          autofocus
        />
      </div>
      <select class="filter-select" id="global-filter-select" onchange="onGlobalFilter(this.value)">
        <option value="all">すべて表示</option>
        <option value="complete">完了のみ</option>
        <option value="incomplete">未完了のみ</option>
      </select>
    </div>
    <div class="drug-list" id="global-list">
      <div class="empty-state">🔍 薬剤名や番号を入力してください</div>
    </div>
  `;
  pagesWrap.appendChild(globalPage);
}

/* ---- Utility ---- */
function escHtml(str) {
  return (str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/* ---- Init ---- */
async function init() {
  loadNotes();

  // Load drugs.json (same directory)
  try {
    const res = await fetch('drugs.json');
    drugsData = await res.json();
  } catch (e) {
    console.error('drugs.json の読み込みに失敗しました', e);
    return;
  }

  buildUI();
  updateProgressBar();
  renderPage(0);  // render first tab
}

document.addEventListener('DOMContentLoaded', init);

/* ==============================
   PDF 印刷機能
   ============================== */

function openPrintModal() {
  document.getElementById('print-modal').classList.add('open');
}

function closePrintModal(e) {
  if (e && e.target !== document.getElementById('print-modal')) return;
  document.getElementById('print-modal').classList.remove('open');
}

document.addEventListener('keydown', function(e) {
  if (e.key === 'Escape') {
    var m = document.getElementById('print-modal');
    if (m) m.classList.remove('open');
  }
});

function executePrint() {
  const range = document.querySelector('input[name="print-range"]:checked')?.value || 'filled';
  document.getElementById('print-modal').classList.remove('open');

  let targets = [];
  if (range === 'filled') {
    targets = drugsData.filter(d => {
      const n = getNoteFor(d.id);
      return n.mechanism || n.effect || n.memo;
    });
  } else if (range === 'all') {
    targets = [...drugsData];
  } else if (range === 'tab') {
    const [start, end] = TABS[currentTab].range;
    targets = drugsData.filter(d => d.id >= start && d.id <= end);
  }

  if (targets.length === 0) {
    alert('出力対象の薬剤がありません。\nまずメモを記入してください。');
    return;
  }

  buildPrintArea(targets, range);

  setTimeout(function() {
    window.print();
    setTimeout(function() {
      document.getElementById('print-area').innerHTML = '';
    }, 1500);
  }, 200);
}

function buildPrintArea(targets, range) {
  const rangeLabel = {
    filled: '記入済みの薬',
    all:    '全120種類',
    tab:    TABS[currentTab].title,
  }[range];

  const today = new Date().toLocaleDateString('ja-JP', { year: 'numeric', month: 'long', day: 'numeric' });

  const pages = [];
  for (let i = 0; i < targets.length; i += 15) {
    pages.push(targets.slice(i, i + 15));
  }

  const pagesHtml = pages.map(function(group, pi) {
    return `
    <div class="print-page">
      <div class="print-page-header">
        <span class="print-title">💊 薬剤学習ノート — ${escHtml(rangeLabel)}</span>
        <span class="print-meta">${today} 出力　${pi + 1} / ${pages.length} ページ</span>
      </div>
      ${group.map(function(d) { return buildPrintCard(d); }).join('')}
    </div>`;
  }).join('');

  document.getElementById('print-area').innerHTML = pagesHtml;
}

function buildPrintCard(drug) {
  const n = getNoteFor(drug.id);
  const completeTag = n.complete ? '<span class="print-complete-tag">✓ 完了</span>' : '';

  function row(icon, label, val) {
    if (val) {
      return `<div class="print-row">
        <div class="print-row-label">${icon} ${label}</div>
        <div class="print-row-val">${escHtml(val)}</div>
      </div>`;
    }
    return `<div class="print-row empty">
      <div class="print-row-label">${icon} ${label}</div>
      <div class="print-row-val print-blank">&nbsp;</div>
    </div>`;
  }

  return `
    <div class="print-card">
      <div class="print-card-header">
        <span class="print-num">${drug.id}</span>
        <span class="print-name">${escHtml(drug.name)}</span>
        <span class="print-unit">${drug.unit}</span>
        ${completeTag}
      </div>
      <div class="print-card-body">
        ${row('🏷️', '一般名（商品名）', n.generic)}
        ${row('📏', '用法・用量', n.dosage)}
        ${row('⚙️', '作用機序', n.mechanism)}
        ${row('💊', '効果・効能', n.effect)}
        ${row('📝', 'メモ・注意点', n.memo)}
      </div>
    </div>`;
}
