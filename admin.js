// PrintDrop - staff page. Made by KUPL

const KEY = 'printdrop_orders';   // same key the student page saves to
const PASSWORD = 'admin123';      // demo only. A real site checks this on a server.
const STATUSES = ['Received', 'Printing', 'Ready for Pickup'];

const $ = id => document.getElementById(id);

/* ---------- dark mode ---------- */
const root = document.documentElement;
const themeBtn = $('theme');

function setTheme(mode) {
  root.dataset.theme = mode;
  themeBtn.innerHTML = mode === 'dark' ? '&#9728;' : '&#9790;';
  themeBtn.setAttribute('aria-label', mode === 'dark' ? 'Switch to light mode' : 'Switch to dark mode');
  try { localStorage.setItem('pd_theme', mode); } catch (e) {}
}

let saved = null;
try { saved = localStorage.getItem('pd_theme'); } catch (e) {}
setTheme(saved || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'));
themeBtn.addEventListener('click', () => setTheme(root.dataset.theme === 'dark' ? 'light' : 'dark'));

/* ---------- saved orders ---------- */
function loadData() {
  try { return JSON.parse(localStorage.getItem(KEY)) || { n: 0, orders: [] }; }
  catch (e) { return { n: 0, orders: [] }; }
}
function saveData(d) {
  try { localStorage.setItem(KEY, JSON.stringify(d)); }
  catch (e) { alert('Could not save the change.'); }
}
function esc(s) {
  return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}
const peso = n => '₱' + n.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const pad = n => String(n).padStart(3, '0');

/* ---------- files are kept in IndexedDB (localStorage is too small for 24 MB) ---------- */
function openDB() {
  return new Promise((ok, fail) => {
    const r = indexedDB.open('printdrop_files', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('files');
    r.onsuccess = () => ok(r.result);
    r.onerror = () => fail(r.error);
  });
}
function fileStore(mode, fn) {
  return openDB().then(db => new Promise((ok, fail) => {
    const t = db.transaction('files', mode);
    const req = fn(t.objectStore('files'));
    t.oncomplete = () => ok(req && req.result);
    t.onerror = () => fail(t.error);
  }));
}

/* ---------- login -> loading screen -> dashboard ---------- */
let loggedIn = false;

$('loginForm').addEventListener('submit', e => {
  e.preventDefault();
  if ($('pw').value !== PASSWORD) {
    $('lerr').textContent = 'Wrong password. Try again.';
    $('pw').select();
    return;
  }
  $('lerr').textContent = '';
  $('pw').value = '';
  $('loginView').classList.add('hide');
  $('loader').classList.remove('hide');
  void $('loader').offsetWidth;            // restart the progress bar animation
  $('loader').classList.add('go');

  setTimeout(() => {
    loggedIn = true;
    $('loader').classList.add('hide');
    $('loader').classList.remove('go');
    $('dash').classList.remove('hide');
    $('logout').classList.remove('hide');
    render();
  }, 1900);
});

$('logout').addEventListener('click', () => {
  loggedIn = false;
  $('dash').classList.add('hide');
  $('logout').classList.add('hide');
  $('loginView').classList.remove('hide');
  $('pw').focus();
});

/* ---------- dashboard ---------- */
function render() {
  const all = loadData().orders;
  const text = $('q').value.trim().toLowerCase();
  const status = $('f').value;

  const list = all
    .filter(o => !status || o.status === status)
    .filter(o => !text || [o.name, o.sid, o.file, pad(o.id), String(o.id)].some(v => String(v).toLowerCase().includes(text)))
    .sort((a, b) => b.time - a.time);   // newest first

  $('s1').textContent = all.filter(o => o.status === 'Received').length;
  $('s2').textContent = all.filter(o => o.status === 'Printing').length;
  $('s3').textContent = all.filter(o => o.status === 'Ready for Pickup').length;
  $('s4').textContent = peso(all.reduce((sum, o) => sum + o.price, 0));
  $('empty').classList.toggle('hide', list.length > 0);

  $('rows').innerHTML = list.map(o => `
    <tr>
      <td data-label="Queue"><b>#${pad(o.id)}</b></td>
      <td data-label="Student">${esc(o.name)}<br><small>${esc(o.sid)}</small></td>
      <td data-label="File">${esc(o.file)}<br><small>${Math.max(1, Math.round(o.size / 1024))} KB</small></td>
      <td data-label="Print settings">${esc(o.paper)} &bull; ${o.pages} page(s) x ${o.copies}<br>${o.color} &bull; ${o.sides}${o.notes ? '<br><small>Note: ' + esc(o.notes) + '</small>' : ''}</td>
      <td data-label="Price">${peso(o.price)}</td>
      <td data-label="Status">
        <select class="st" data-id="${o.id}" aria-label="Status for queue ${pad(o.id)}">
          ${STATUSES.map(s => `<option${s === o.status ? ' selected' : ''}>${s}</option>`).join('')}
        </select>
      </td>
      <td data-label="Actions">
        <div class="acts">
          ${o.hasFile ? `<button class="btn small dl" data-id="${o.id}">Download</button>` : '<small>No file saved</small>'}
          <button class="btn small rm" data-id="${o.id}">Delete</button>
        </div>
      </td>
    </tr>`).join('');
}

$('q').addEventListener('input', render);
$('f').addEventListener('change', render);

// change status
$('rows').addEventListener('change', e => {
  if (!e.target.classList.contains('st')) return;
  const d = loadData();
  const order = d.orders.find(o => o.id === +e.target.dataset.id);
  if (order) { order.status = e.target.value; saveData(d); render(); }
});

// download / delete
let deleteId = null;

$('rows').addEventListener('click', e => {
  const id = +e.target.dataset.id;
  if (!id) return;
  const order = loadData().orders.find(o => o.id === id);
  if (!order) return;

  if (e.target.classList.contains('dl')) {
    fileStore('readonly', s => s.get(id)).then(file => {
      if (!file) { alert('This file could not be found in the browser.'); return; }
      const url = URL.createObjectURL(file);
      const a = document.createElement('a');
      a.href = url;
      a.download = order.file;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    });
  }
  if (e.target.classList.contains('rm')) {
    deleteId = id;
    $('cmsg').textContent = 'Queue #' + pad(id) + ' (' + order.file + ') and its file will be removed. This cannot be undone.';
    $('confirm').showModal();
  }
});

$('cno').addEventListener('click', () => $('confirm').close());
$('cyes').addEventListener('click', () => {
  const d = loadData();
  d.orders = d.orders.filter(o => o.id !== deleteId);
  saveData(d);
  fileStore('readwrite', s => s.delete(deleteId)).catch(() => {});
  $('confirm').close();
  render();
});

// new requests from the student page show up without refreshing
window.addEventListener('storage', () => { if (loggedIn) render(); });
