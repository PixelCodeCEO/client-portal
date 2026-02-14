const seed = {
  users: [
    { uid: 'admin-1', email: 'admin@portal.dev', password: 'Admin123!', role: 'admin', name: 'Avery Admin', createdAt: now(), lastActiveAt: now(), firstLogin: false, notifications: true },
    { uid: 'client-1', email: 'owner@acme.com', password: 'Temp123!', role: 'client', name: 'Jordan Client', createdAt: now(), lastActiveAt: now(), firstLogin: true, notifications: true },
  ],
  invites: [
    { token: 'INVITE-ACME', clientEmail: 'owner@acme.com', expiresAt: addHours(24), used: false },
  ],
  projects: [
    { projectId: 'proj-1', clientId: 'client-1', businessName: 'Acme Bakery', status: 'Mockup', dueDate: dateDays(18), startDate: dateDays(-10), nextStepText: 'Please review homepage concept.', assignedAdminId: 'admin-1', createdAt: now(), updatedAt: now(), lastActivityAt: now(), statusHistory: [{ status: 'Audit', at: dateDays(-8) }, { status: 'Mockup', at: dateDays(-2) }] },
  ],
  deliverables: [{ deliverableId: 'del-1', projectId: 'proj-1', title: 'Homepage Mockup', type: 'mockup', urls: ['https://example.com/mockup'], status: 'pending', createdAt: now() }],
  deliverable_comments: [],
  messages: [{ messageId: 'msg-1', projectId: 'proj-1', authorId: 'admin-1', role: 'admin', text: 'Welcome to your project thread.', createdAt: now() }],
  uploads: [],
  audit_logs: [],
};

let state = load();
let session = JSON.parse(localStorage.getItem('session') || 'null');
let route = 'Dashboard';
let selectedProjectId = state.projects[0]?.projectId;

const app = document.querySelector('#app');
render();

function render() {
  if (!session) return renderAuth();
  const me = getUser(session.uid);
  if (!me) { logout(); return; }
  me.lastActiveAt = now();
  persist();

  const menu = me.role === 'admin'
    ? ['Projects', 'Project Admin', 'Audit Log', 'Admins']
    : ['Dashboard', 'Project', 'Files', 'Messages', 'Settings'];

  app.innerHTML = `
    <div class="shell">
      <nav class="glass">
        <h3>Client Portal</h3>
        <div class="small">${me.name} (${me.role})</div>
        ${menu.map((m) => `<button class="menu-btn secondary" data-route="${m}">${m}</button>`).join('')}
        <button id="logoutBtn" class="danger">Logout</button>
      </nav>
      <main class="glass">${renderRoute(me)}</main>
    </div>
  `;

  app.querySelectorAll('[data-route]').forEach((btn) => btn.onclick = () => { route = btn.dataset.route; render(); });
  app.querySelector('#logoutBtn').onclick = logout;

  bindForms(me);
}

function renderAuth() {
  app.innerHTML = `
    <div class="auth glass">
      <h2>Invite-Only Login</h2>
      <div class="small">No public signup. Admin can create client or send invite token.</div>
      <form id="loginForm">
        <label>Email<input name="email" required /></label>
        <label>Password<input type="password" name="password" required /></label>
        <button>Login</button>
      </form>
      <button id="forgot" class="secondary">Forgot Password</button>
      <hr/>
      <h3>Activate invite</h3>
      <form id="inviteForm">
        <label>Invite token<input name="token" required /></label>
        <label>Temporary password<input type="password" name="password" required /></label>
        <button>Use invite</button>
      </form>
      <div class="small">Demo admin: admin@portal.dev / Admin123!</div>
    </div>
  `;
  document.querySelector('#forgot').onclick = () => {
    alert('Forgot password flow: enter an existing email to trigger reset instructions (simulated).');
  };
  document.querySelector('#loginForm').onsubmit = (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const user = state.users.find((u) => u.email.toLowerCase() === fd.get('email').toLowerCase());
    if (!user || user.password !== fd.get('password')) return alert('Invalid credentials');
    session = { uid: user.uid };
    localStorage.setItem('session', JSON.stringify(session));
    if (user.role === 'client' && user.firstLogin) {
      const newPw = prompt('First login: set a new password');
      if (!newPw) return alert('Password reset required');
      user.password = newPw;
      user.firstLogin = false;
      logEvent(user.uid, user.role, 'client.password.reset', 'users', user.uid, null);
      persist();
    }
    route = user.role === 'admin' ? 'Projects' : 'Dashboard';
    render();
  };
  document.querySelector('#inviteForm').onsubmit = (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const invite = state.invites.find((i) => i.token === fd.get('token'));
    if (!invite || invite.used || Date.now() > new Date(invite.expiresAt).getTime()) return alert('Invalid or expired token');
    const user = state.users.find((u) => u.email === invite.clientEmail);
    if (!user) return alert('Invite user not found');
    user.password = fd.get('password');
    user.firstLogin = true;
    invite.used = true;
    persist();
    alert('Invite accepted. Now login.');
  };
}

function renderRoute(me) {
  if (me.role === 'client') {
    const project = state.projects.find((p) => p.clientId === me.uid);
    if (!project) return '<h2>No project assigned yet.</h2>';
    selectedProjectId = project.projectId;

    if (route === 'Project') return renderClientProject(project);
    if (route === 'Files') return renderFiles(project, me);
    if (route === 'Messages') return renderMessages(project, me);
    if (route === 'Settings') return renderSettings(me);
    return renderDashboard(project);
  }

  if (route === 'Project Admin') return renderProjectAdmin(me);
  if (route === 'Audit Log') return renderAudit();
  if (route === 'Admins') return renderAdmins(me);
  return renderProjectsList();
}

function renderDashboard(project) {
  return `<h2>Dashboard</h2>
    <div class="card">
      <h3>${project.businessName}</h3>
      <span class="badge ${project.status.toLowerCase()}">${project.status}</span>
      <p><strong>Next step:</strong> ${project.nextStepText}</p>
      <p class="small">Read-only status for clients.</p>
    </div>`;
}

function renderClientProject(project) {
  return `<h2>Project</h2>
  <div class="grid two">
    <div class="card">
      <h3>Metadata</h3>
      <p><strong>Scope:</strong> Website redesign + copy updates</p>
      <p><strong>Start:</strong> ${fmt(project.startDate)}</p>
      <p><strong>Target:</strong> ${fmt(project.dueDate)}</p>
      <p class="small">Client fields are read-only.</p>
    </div>
    <div class="card">
      <h3>Status timeline</h3>
      <ul class="timeline">${project.statusHistory.map((s) => `<li>${s.status} <span class="small">${fmt(s.at)}</span></li>`).join('')}</ul>
    </div>
  </div>
  <div class="card">
    <h3>Deliverables</h3>
    ${state.deliverables.filter((d) => d.projectId === project.projectId).map((d) => `
      <div class="card">
        <strong>${d.title}</strong> (${d.type})
        <p><a href="${d.urls[0]}" target="_blank">Preview link</a></p>
        <p>Status: ${d.status}</p>
        <form class="deliverable-action" data-id="${d.deliverableId}">
          <label>Comment<textarea name="comment" required></textarea></label>
          <div class="row">
            <button class="good" name="decision" value="approved">Approve</button>
            <button class="warn" name="decision" value="changes">Request Changes</button>
          </div>
        </form>
        ${state.deliverable_comments.filter((c) => c.deliverableId === d.deliverableId).map((c) => `<p class="small">${c.text} — ${fmt(c.createdAt)}</p>`).join('')}
      </div>`).join('')}
  </div>`;
}

function renderFiles(project, me) {
  const uploads = state.uploads.filter((u) => u.projectId === project.projectId);
  return `<h2>Files</h2>
  <div class="grid two">
    <form id="uploadForm" class="card">
      <h3>Upload logo / copy / images</h3>
      <label>Label<input name="label" required /></label>
      <label>File URL<input name="fileUrl" required placeholder="https://..."/></label>
      <label>Type<select name="fileType"><option>logo</option><option>copy</option><option>image</option></select></label>
      <button>Upload</button>
    </form>
    <div class="card"><h3>File list</h3>
      ${uploads.map((u) => `<p>${u.label} (${u.fileType}) - <a href="${u.fileUrl}" target="_blank">Download</a>${canDeleteUpload(me,u)?` <button data-delupload="${u.uploadId}" class="secondary">Delete</button>`:''}</p>`).join('') || '<p class="small">No uploads yet.</p>'}
    </div>
  </div>`;
}

function renderMessages(project, me) {
  const msgs = state.messages.filter((m) => m.projectId === project.projectId).sort((a,b)=>new Date(a.createdAt)-new Date(b.createdAt));
  return `<h2>Messages</h2>
  <div class="card">${msgs.map((m)=>`<div class="message"><div>${m.text}</div><div class="meta">${m.role} • ${fmt(m.createdAt)}</div></div>`).join('')}</div>
  <form id="messageForm" class="card">
    <label>New message<textarea name="text" required></textarea></label>
    <button>Send</button>
  </form>`;
}

function renderSettings(me) {
  return `<h2>Settings</h2>
  <form id="settingsForm" class="card">
    <label>Name<input name="name" value="${me.name}" required /></label>
    <label><input type="checkbox" name="notifications" ${me.notifications ? 'checked' : ''}/> Notifications enabled</label>
    <label>Change password<input type="password" name="password" placeholder="new password" /></label>
    <button>Save</button>
    <p class="small">Email change disabled in MVP.</p>
  </form>`;
}

function renderProjectsList() {
  const rows = state.projects.map((p) => {
    const overdue = new Date(p.dueDate) < Date.now() ? 'Yes' : 'No';
    const waiting = /review|approve/i.test(p.nextStepText) ? 'Yes' : 'No';
    return `<tr><td>${p.businessName}</td><td>${p.status}</td><td>${fmt(p.dueDate)}</td><td>${overdue}</td><td>${waiting}</td></tr>`;
  }).join('');
  return `<h2>Projects</h2>
  <form id="filterProjects" class="card row">
    <input name="search" placeholder="Search business name" />
    <select name="status"><option value="">All Statuses</option><option>Audit</option><option>Mockup</option><option>Build</option><option>Live</option></select>
    <select name="flags"><option value="">Any</option><option value="overdue">Overdue</option><option value="waiting">Waiting on client</option></select>
    <button>Apply</button>
  </form>
  <div class="card"><table class="table"><thead><tr><th>Business</th><th>Status</th><th>Due</th><th>Overdue</th><th>Waiting</th></tr></thead><tbody id="projectRows">${rows}</tbody></table></div>`;
}

function renderProjectAdmin(me) {
  const p = state.projects.find((x) => x.projectId === selectedProjectId) || state.projects[0];
  if (!p) return '<h2>No projects</h2>';
  const client = getUser(p.clientId);
  return `<h2>Project Admin View</h2>
  <div class="grid two">
    <form id="adminEditProject" class="card">
      <h3>${p.businessName}</h3>
      <label>Status<select name="status">${['Audit','Mockup','Build','Live'].map((s)=>`<option ${s===p.status?'selected':''}>${s}</option>`).join('')}</select></label>
      <label>Due date<input type="date" name="dueDate" value="${p.dueDate.slice(0,10)}" /></label>
      <label>Assigned admin<select name="assignedAdminId">${state.users.filter((u)=>u.role==='admin').map((u)=>`<option value="${u.uid}" ${u.uid===p.assignedAdminId?'selected':''}>${u.name}</option>`).join('')}</select></label>
      <label>Next step<input name="nextStepText" value="${p.nextStepText}"/></label>
      <button>Save changes</button>
    </form>
    <form id="addDeliverable" class="card">
      <h3>Upload deliverable</h3>
      <label>Title<input name="title" required /></label>
      <label>Type<select name="type"><option value="mockup">mockup</option><option value="live">live</option></select></label>
      <label>URL<input name="url" required /></label>
      <button>Add</button>
    </form>
  </div>
  <div class="card"><h3>Client uploads (${client?.name || ''})</h3>${state.uploads.filter((u)=>u.projectId===p.projectId).map((u)=>`<p>${u.label} - ${u.fileType}</p>`).join('') || '<p class="small">None</p>'}</div>
  ${renderMessages(p, me)}
  `;
}

function renderAudit() {
  return `<h2>Audit Log</h2>
  <form id="filterAudit" class="card row">
    <input name="projectId" placeholder="Project ID" />
    <input name="actorId" placeholder="Actor ID" />
    <input name="action" placeholder="Action" />
    <input name="from" type="date" />
    <input name="to" type="date" />
    <button>Filter</button>
    <button type="button" id="exportCsv" class="secondary">Export CSV</button>
  </form>
  <div class="card"><table class="table"><thead><tr><th>Timestamp</th><th>Actor</th><th>Action</th><th>Target</th><th>Project</th></tr></thead><tbody id="auditRows">${auditRows(state.audit_logs)}</tbody></table></div>`;
}

function renderAdmins(me) {
  return `<h2>Admin Management</h2>
  <form id="addAdmin" class="card">
    <label>Email<input name="email" required /></label>
    <label>Name<input name="name" required /></label>
    <button>Add admin</button>
  </form>
  <div class="card"><h3>Admins</h3>
  ${state.users.filter((u)=>u.role==='admin').map((u)=>`<p>${u.name} (${u.email}) - last active ${fmt(u.lastActiveAt)} ${u.uid!==me.uid?`<button class="danger" data-remove-admin="${u.uid}">Remove</button>`:''}</p>`).join('')}
  </div>`;
}

function bindForms(me) {
  document.querySelectorAll('.deliverable-action').forEach((form) => form.onsubmit = (e) => {
    e.preventDefault();
    const d = state.deliverables.find((x) => x.deliverableId === form.dataset.id);
    const fd = new FormData(form);
    d.status = fd.get('decision');
    state.deliverable_comments.push({ commentId: uid('dc'), deliverableId: d.deliverableId, authorId: me.uid, text: fd.get('comment'), createdAt: now() });
    logEvent(me.uid, me.role, `deliverable.${d.status}`, 'deliverables', d.deliverableId, d.projectId);
    persist(); render();
  });

  const uploadForm = document.querySelector('#uploadForm');
  if (uploadForm) uploadForm.onsubmit = (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    state.uploads.push({ uploadId: uid('up'), projectId: selectedProjectId, uploaderId: me.uid, fileUrl: fd.get('fileUrl'), fileType: fd.get('fileType'), label: fd.get('label'), createdAt: now() });
    if (me.role === 'admin') logEvent(me.uid, me.role, 'upload.create', 'uploads', '', selectedProjectId);
    persist(); render();
  };

  document.querySelectorAll('[data-delupload]').forEach((btn) => btn.onclick = () => {
    const upload = state.uploads.find((u) => u.uploadId === btn.dataset.delupload);
    if (!canDeleteUpload(me, upload)) return;
    state.uploads = state.uploads.filter((u) => u.uploadId !== upload.uploadId);
    persist(); render();
  });

  const messageForm = document.querySelector('#messageForm');
  if (messageForm) messageForm.onsubmit = (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    state.messages.push({ messageId: uid('msg'), projectId: selectedProjectId, authorId: me.uid, role: me.role, text: fd.get('text'), createdAt: now() });
    if (me.role === 'admin') logEvent(me.uid, me.role, 'message.create', 'messages', '', selectedProjectId);
    persist(); render();
  };

  const settingsForm = document.querySelector('#settingsForm');
  if (settingsForm) settingsForm.onsubmit = (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    me.name = fd.get('name');
    me.notifications = !!fd.get('notifications');
    if (fd.get('password')) me.password = fd.get('password');
    persist(); render();
  };

  const filterProjects = document.querySelector('#filterProjects');
  if (filterProjects) filterProjects.onsubmit = (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const search = String(fd.get('search') || '').toLowerCase();
    const status = String(fd.get('status') || '');
    const flag = String(fd.get('flags') || '');
    const rows = state.projects.filter((p) => {
      const overdue = new Date(p.dueDate) < Date.now();
      const waiting = /review|approve/i.test(p.nextStepText);
      return (!search || p.businessName.toLowerCase().includes(search)) && (!status || p.status === status) && (!flag || (flag === 'overdue' ? overdue : waiting));
    }).map((p) => `<tr><td>${p.businessName}</td><td>${p.status}</td><td>${fmt(p.dueDate)}</td><td>${new Date(p.dueDate)<Date.now()?'Yes':'No'}</td><td>${/review|approve/i.test(p.nextStepText)?'Yes':'No'}</td></tr>`).join('');
    document.querySelector('#projectRows').innerHTML = rows || '<tr><td colspan="5">No matches</td></tr>';
  };

  const adminEdit = document.querySelector('#adminEditProject');
  if (adminEdit) adminEdit.onsubmit = (e) => {
    e.preventDefault();
    const p = state.projects.find((x) => x.projectId === selectedProjectId);
    const fd = new FormData(e.target);
    const prevStatus = p.status;
    p.status = fd.get('status');
    p.dueDate = new Date(fd.get('dueDate')).toISOString();
    p.assignedAdminId = fd.get('assignedAdminId');
    p.nextStepText = fd.get('nextStepText');
    p.updatedAt = now();
    if (prevStatus !== p.status) p.statusHistory.push({ status: p.status, at: now() });
    logEvent(me.uid, me.role, 'project.update', 'projects', p.projectId, p.projectId);
    persist(); render();
  };

  const addDeliverable = document.querySelector('#addDeliverable');
  if (addDeliverable) addDeliverable.onsubmit = (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const d = { deliverableId: uid('del'), projectId: selectedProjectId, title: fd.get('title'), type: fd.get('type'), urls: [fd.get('url')], status: 'pending', createdAt: now() };
    state.deliverables.push(d);
    logEvent(me.uid, me.role, 'deliverable.create', 'deliverables', d.deliverableId, selectedProjectId);
    persist(); render();
  };

  const filterAudit = document.querySelector('#filterAudit');
  if (filterAudit) filterAudit.onsubmit = (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const rows = state.audit_logs.filter((l) => {
      if (fd.get('projectId') && !String(l.projectId || '').includes(fd.get('projectId'))) return false;
      if (fd.get('actorId') && !String(l.actorId).includes(fd.get('actorId'))) return false;
      if (fd.get('action') && !String(l.action).includes(fd.get('action'))) return false;
      if (fd.get('from') && new Date(l.timestamp) < new Date(fd.get('from'))) return false;
      if (fd.get('to') && new Date(l.timestamp) > new Date(fd.get('to') + 'T23:59:59')) return false;
      return true;
    });
    document.querySelector('#auditRows').innerHTML = auditRows(rows);
  };

  const exportCsv = document.querySelector('#exportCsv');
  if (exportCsv) exportCsv.onclick = () => {
    const headers = ['timestamp','actorId','actorRole','action','targetType','targetId','projectId'];
    const lines = [headers.join(',')].concat(state.audit_logs.map((l)=>headers.map((h)=>`"${String(l[h] ?? '').replaceAll('"','""')}"`).join(',')));
    const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'audit-log.csv';
    a.click();
  };

  const addAdmin = document.querySelector('#addAdmin');
  if (addAdmin) addAdmin.onsubmit = (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const u = { uid: uid('admin'), email: fd.get('email'), password: 'Temp123!', role: 'admin', name: fd.get('name'), createdAt: now(), lastActiveAt: now(), notifications: true, firstLogin: true };
    state.users.push(u);
    logEvent(me.uid, me.role, 'admin.add', 'users', u.uid, null);
    persist(); render();
  };

  document.querySelectorAll('[data-remove-admin]').forEach((btn) => btn.onclick = () => {
    state.users = state.users.filter((u) => u.uid !== btn.dataset.removeAdmin);
    logEvent(me.uid, me.role, 'admin.remove', 'users', btn.dataset.removeAdmin, null);
    persist(); render();
  });
}

function canDeleteUpload(me, upload) {
  if (!upload) return false;
  if (me.role === 'admin') return true;
  return upload.uploaderId === me.uid;
}

function logEvent(actorId, actorRole, action, targetType, targetId, projectId) {
  if (actorRole !== 'admin') return;
  state.audit_logs.push({ eventId: uid('evt'), timestamp: now(), actorId, actorRole, action, targetType, targetId, projectId, metadata: {} });
}

function auditRows(logs) {
  return logs.slice().reverse().map((l)=>`<tr><td>${fmt(l.timestamp)}</td><td>${l.actorId}</td><td>${l.action}</td><td>${l.targetType}:${l.targetId || '-'}</td><td>${l.projectId || '-'}</td></tr>`).join('') || '<tr><td colspan="5">No logs yet</td></tr>';
}

function persist() { localStorage.setItem('portal-state', JSON.stringify(state)); }
function load() { return JSON.parse(localStorage.getItem('portal-state') || 'null') || structuredClone(seed); }
function logout() { session = null; localStorage.removeItem('session'); render(); }
function getUser(uid) { return state.users.find((u) => u.uid === uid); }
function now() { return new Date().toISOString(); }
function addHours(h) { return new Date(Date.now() + h * 3600_000).toISOString(); }
function dateDays(d) { return new Date(Date.now() + d * 86400_000).toISOString(); }
function uid(prefix) { return `${prefix}-${Math.random().toString(36).slice(2, 9)}`; }
function fmt(x) { return new Date(x).toLocaleString(); }
