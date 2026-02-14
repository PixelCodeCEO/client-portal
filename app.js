import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.4/firebase-app.js';
import { getFirestore, doc, getDoc, setDoc, onSnapshot } from 'https://www.gstatic.com/firebasejs/10.12.4/firebase-firestore.js';
import {
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  sendPasswordResetEmail,
  createUserWithEmailAndPassword,
  signOut,
  updatePassword,
  reauthenticateWithCredential,
  EmailAuthProvider,
  deleteUser,
} from 'https://www.gstatic.com/firebasejs/10.12.4/firebase-auth.js';
import { firebaseConfig } from './firebase-config.js';

const seed = {
  users: [
    { uid: 'admin-1', email: 'admin@portal.dev', role: 'admin', name: 'Avery Admin', createdAt: now(), lastActiveAt: now(), firstLogin: false, notifications: true },
    { uid: 'client-1', email: 'owner@acme.com', role: 'client', name: 'Jordan Client', createdAt: now(), lastActiveAt: now(), firstLogin: true, notifications: true },
  ],
  invites: [{ token: 'INVITE-ACME', clientEmail: 'owner@acme.com', expiresAt: addHours(24), used: false }],
  projects: [
    { projectId: 'proj-1', clientId: 'client-1', businessName: 'Acme Bakery', status: 'Mockup', dueDate: dateDays(18), startDate: dateDays(-10), nextStepText: 'Please review homepage concept.', assignedAdminId: 'admin-1', createdAt: now(), updatedAt: now(), lastActivityAt: now(), statusHistory: [{ status: 'Audit', at: dateDays(-8) }, { status: 'Mockup', at: dateDays(-2) }] },
  ],
  deliverables: [{ deliverableId: 'del-1', projectId: 'proj-1', title: 'Homepage Mockup', type: 'mockup', urls: ['https://example.com/mockup'], status: 'pending', createdAt: now() }],
  deliverable_comments: [],
  messages: [{ messageId: 'msg-1', projectId: 'proj-1', authorId: 'admin-1', role: 'admin', text: 'Welcome to your project thread.', createdAt: now() }],
  uploads: [],
  audit_logs: [],
};

const appNode = document.querySelector('#app');

let state = structuredClone(seed);
let route = 'Dashboard';
let selectedProjectId = 'proj-1';
let adminHudFilter = 'all';
let projectFilters = { search: '', status: '', flags: '' };
let auditFilters = { projectId: '', actorId: '', action: '', from: '', to: '' };

let db = null;
let auth = null;
let stateRef = null;
let remoteReady = false;
let isPersisting = false;
let bootstrapError = null;
let bootstrapHint = '';
let authUser = null;
let authReady = false;

await boot();

async function boot() {
  try {
    const app = initializeApp(firebaseConfig);
    db = getFirestore(app);
    auth = getAuth(app);
    stateRef = doc(db, 'portal', 'state');
    await ensureRemoteSeed();

    onSnapshot(stateRef, (snap) => {
      if (!snap.exists()) return;
      state = snap.data();
      selectedProjectId = state.projects[0]?.projectId || selectedProjectId;
      remoteReady = true;
      render();
    });

    onAuthStateChanged(auth, (user) => {
      authUser = user;
      authReady = true;
      route = user ? route : 'Dashboard';
      render();
    });

    remoteReady = true;
  } catch (error) {
    console.error(error);
    bootstrapError = String(error?.message || error);
    bootstrapHint = getFirebaseHint(bootstrapError);
    state = JSON.parse(localStorage.getItem('portal-state') || 'null') || structuredClone(seed);
    authReady = true;
  }
  render();
}

async function ensureRemoteSeed() {
  const snap = await getDoc(stateRef);
  if (!snap.exists()) {
    await setDoc(stateRef, seed);
    state = structuredClone(seed);
    selectedProjectId = state.projects[0]?.projectId || selectedProjectId;
    return;
  }
  state = snap.data();
  selectedProjectId = state.projects[0]?.projectId || selectedProjectId;
}

function render() {
  if (!authReady) {
    appNode.innerHTML = '<div class="auth glass"><h2>Loading…</h2></div>';
    return;
  }

  if (!authUser) return renderAuth();

  const me = getUser(authUser.uid) || state.users.find((u) => u.email.toLowerCase() === authUser.email?.toLowerCase());
  if (!me) {
    appNode.innerHTML = `
      <div class="auth glass">
        <h2>Account not provisioned</h2>
        <p class="small">This auth user exists, but no matching portal profile was found in Firestore state.</p>
        <button id="logoutBtn" class="danger">Logout</button>
      </div>`;
    document.querySelector('#logoutBtn').onclick = logout;
    return;
  }

  if (me.uid !== authUser.uid) {
    me.uid = authUser.uid;
    persist();
  }

  me.lastActiveAt = now();
  persist();

  if (me.role === 'client' && me.firstLogin) return renderFirstLoginReset(me);

  const menu = me.role === 'admin'
    ? ['Projects', 'Project Admin', 'Audit Log', 'Admins']
    : ['Dashboard', 'Project', 'Files', 'Messages', 'Settings'];

  const showHud = me.role === 'admin' && ['Projects', 'Project Admin', 'Audit Log'].includes(route);

  appNode.innerHTML = `
    <div class="shell">
      <nav class="glass">
        <h3 class="nav-title">Client Portal</h3>
        <div class="small">${me.name} (${me.role})</div>
        ${remoteReady ? '<div class="small">Live: Firebase</div>' : '<div class="small">Syncing…</div>'}
        ${bootstrapError ? `<div class="small">Fallback mode: ${bootstrapError}</div>` : ''}
        ${bootstrapHint ? `<div class="small">${bootstrapHint}</div>` : ''}
        <div class="nav-stack">${menu.map((m) => `<button class="menu-btn secondary" data-route="${m}">${m}</button>`).join('')}</div>
        <div class="logout-wrap"><button id="logoutBtn" class="danger">Logout</button></div>
      </nav>
      <main class="glass"><div class="page">${showHud ? renderAdminHud() : ''}${renderRoute(me)}</div></main>
    </div>
  `;

  appNode.querySelectorAll('[data-route]').forEach((btn) => btn.onclick = () => { route = btn.dataset.route; render(); });
  appNode.querySelector('#logoutBtn').onclick = logout;
  appNode.querySelectorAll('[data-hud-filter]').forEach((btn) => {
    btn.onclick = () => {
      adminHudFilter = btn.dataset.hudFilter;
      render();
    };
  });
  bindForms(me);
}

function renderFirstLoginReset(me) {
  appNode.innerHTML = `
    <div class="auth glass">
      <h2>Set your new password</h2>
      <p class="small">This is required on first login.</p>
      <form id="firstResetForm" class="section">
        <div class="form-group"><label>New password</label><input name="newPassword" type="password" required /></div>
        <div class="button-row"><button class="primary">Update password</button></div>
      </form>
      <button id="logoutBtn" class="secondary">Logout</button>
    </div>
  `;
  document.querySelector('#logoutBtn').onclick = logout;
  document.querySelector('#firstResetForm').onsubmit = async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    try {
      await updatePassword(auth.currentUser, String(fd.get('newPassword')));
      me.firstLogin = false;
      await persist();
      render();
    } catch (error) {
      alert(`Password update failed: ${error.message}`);
    }
  };
}

function renderAuth() {
  appNode.innerHTML = `
    <div class="auth glass">
      <h2>Invite-Only Login</h2>
      <p class="small">No public signup. Admin can create client or send invite token.</p>
      ${bootstrapError ? `<p class="small">Firebase unavailable. Running in local fallback mode.</p>` : ''}
      ${bootstrapHint ? `<p class="small">${bootstrapHint}</p>` : ''}
      <form id="loginForm" class="section">
        <div class="form-group"><label>Email</label><input name="email" required /></div>
        <div class="form-group"><label>Password</label><input type="password" name="password" required /></div>
        <div class="button-row"><button class="primary">Login</button></div>
      </form>
      <button id="forgot" class="secondary">Forgot Password</button>
      <hr/>
      <h3>Activate invite</h3>
      <form id="inviteForm" class="section">
        <div class="form-group"><label>Invite token</label><input name="token" required /></div>
        <div class="form-group"><label>Name</label><input name="name" required /></div>
        <div class="form-group"><label>Password</label><input type="password" name="password" required /></div>
        <div class="button-row"><button class="secondary">Use invite</button></div>
      </form>
      <p class="small">Admin users must exist in Firebase Auth and in portal users list.</p>
    </div>
  `;

  document.querySelector('#forgot').onclick = async () => {
    const email = prompt('Enter your account email for reset link');
    if (!email) return;
    try {
      await sendPasswordResetEmail(auth, email);
      alert('Password reset email sent.');
    } catch (error) {
      alert(`Reset failed: ${error.message}`);
    }
  };

  document.querySelector('#loginForm').onsubmit = async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    try {
      await signInWithEmailAndPassword(auth, String(fd.get('email')), String(fd.get('password')));
      route = 'Dashboard';
    } catch (error) {
      alert(`Invalid credentials: ${error.message}`);
    }
  };

  document.querySelector('#inviteForm').onsubmit = async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const token = String(fd.get('token'));
    const invite = state.invites.find((i) => i.token === token);
    if (!invite || invite.used || Date.now() > new Date(invite.expiresAt).getTime()) return alert('Invalid or expired token');

    try {
      const cred = await createUserWithEmailAndPassword(auth, invite.clientEmail, String(fd.get('password')));
      state.users.push({
        uid: cred.user.uid,
        email: invite.clientEmail,
        role: 'client',
        name: String(fd.get('name')),
        createdAt: now(),
        lastActiveAt: now(),
        firstLogin: true,
        notifications: true,
      });
      invite.used = true;
      await persist();
      await signOut(auth);
      alert('Invite activated. Login with your new credentials.');
    } catch (error) {
      alert(`Invite activation failed: ${error.message}`);
    }
  };
}

function renderAdminHud() {
  const activeProjects = state.projects.filter((p) => !['live', 'closed'].includes(String(p.status).toLowerCase())).length;
  const overdueProjects = state.projects.filter((p) => isOverdueProject(p)).length;
  const waitingOnClient = state.projects.filter((p) => projectWaiting(p)).length;
  const thisWeekActivity = state.audit_logs.filter((l) => (Date.now() - new Date(l.timestamp).getTime()) <= 7 * 24 * 3600_000).length;
  const avgTurnaround = avgTurnaroundDays();
  const metrics = [
    { key: 'active', label: 'Active Projects', value: activeProjects },
    { key: 'overdue', label: 'Overdue Projects', value: overdueProjects },
    { key: 'waiting', label: 'Waiting on Client', value: waitingOnClient },
    { key: 'activity', label: 'This Week Activity', value: thisWeekActivity },
    { key: 'turnaround', label: 'Avg Turnaround', value: avgTurnaround == null ? '—' : `${avgTurnaround}d` },
  ];
  return `<section class="analytics-strip" aria-label="Admin analytics summary">${metrics.map((m, i) => `<button class="hud-pill ${i === 0 ? 'primary-metric' : ''} ${adminHudFilter === m.key ? 'active' : ''}" data-hud-filter="${m.key}"><span class="hud-label">${m.label}</span><span class="hud-value">${m.value}</span></button>`).join('')}</section>`;
}

function renderRoute(me) {
  if (me.role === 'client') {
    const project = state.projects.find((p) => p.clientId === me.uid);
    if (!project) return '<h2>No project assigned yet.</h2>';
    selectedProjectId = project.projectId;
    if (route === 'Project') return renderClientProject(project);
    if (route === 'Files') return renderFiles(project, me);
    if (route === 'Messages') return renderMessages(project, me, true);
    if (route === 'Settings') return renderSettings(me);
    return renderDashboard(project);
  }

  if (route === 'Project Admin') return renderProjectAdmin(me);
  if (route === 'Audit Log') return renderAudit();
  if (route === 'Admins') return renderAdmins(me);
  return renderProjectsList();
}

function renderDashboard(project) { return `<section class="section"><h2>Dashboard</h2><div><strong>${project.businessName}</strong> <span class="badge ${project.status.toLowerCase()}">${project.status}</span></div><div><strong>Next step:</strong> ${project.nextStepText}</div><div class="small">Project status is read-only for clients.</div></section>`; }
function renderClientProject(project) { const items = state.deliverables.filter((d) => d.projectId === project.projectId); return `<section class="section"><h2>Project</h2><div class="two-col"><div><h3>Scope summary</h3><div>Website redesign + copy updates</div><div class="small">Start: ${fmt(project.startDate)}</div><div class="small">Target: ${fmt(project.dueDate)}</div></div><div><h3>Status timeline</h3><ul class="timeline">${project.statusHistory.map((s) => `<li>${s.status} <span class="small">${fmt(s.at)}</span></li>`).join('')}</ul></div></div></section><section class="section"><h3>Deliverables</h3>${items.map((d) => `<div class="section"><div><strong>${d.title}</strong> (${d.type}) · <a href="${d.urls[0]}" target="_blank">Preview</a></div><div class="small">Status: ${d.status}</div><form class="deliverable-action" data-id="${d.deliverableId}"><div class="form-group"><label>Comment</label><textarea name="comment" required></textarea></div><div class="button-row"><button class="secondary" name="decision" value="changes">Request changes</button><button class="primary" name="decision" value="approved">Approve</button></div></form>${state.deliverable_comments.filter((c) => c.deliverableId === d.deliverableId).map((c) => `<div class="small">${c.text} — ${fmt(c.createdAt)}</div>`).join('')}</div>`).join('')}</section>`; }
function renderFiles(project, me) { const uploads = state.uploads.filter((u) => u.projectId === project.projectId); return `<section class="section"><h2>Files</h2><form id="uploadForm"><div class="form-grid"><div class="form-group"><label>Label</label><input name="label" required /></div><div class="form-group"><label>File URL</label><input name="fileUrl" required placeholder="https://..."/></div><div class="form-group"><label>Type</label><select name="fileType"><option>logo</option><option>copy</option><option>image</option></select></div></div><div class="button-row"><button class="primary">Upload</button></div></form></section><section class="section"><h3>File list</h3>${uploads.map((u) => `<div>${u.label} (${u.fileType}) · <a href="${u.fileUrl}" target="_blank">Download</a>${canDeleteUpload(me, u) ? ` · <button data-delupload="${u.uploadId}" class="secondary">Delete</button>` : ''}</div>`).join('') || '<div class="small">No uploads yet.</div>'}</section>`; }
function renderMessages(project, me, includePageTitle = false) { const msgs = state.messages.filter((m) => m.projectId === project.projectId).sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt)); return `${includePageTitle ? '<section class="section"><h2>Messages</h2>' : '<section class="section"><h3>Messages</h3>'}<ul class="messages">${msgs.map((m) => `<li class="message"><div>${m.text}</div><div class="small">${m.role} · ${fmt(m.createdAt)}</div></li>`).join('')}</ul></section><section class="section"><form id="messageForm"><div class="form-group"><label>New message</label><textarea name="text" required></textarea></div><div class="button-row"><button class="primary">Send message</button></div></form></section>`; }
function renderSettings(me) {
  return `<section class="section"><h2>Settings</h2><form id="settingsForm"><div class="form-grid"><div class="form-group"><label>Name</label><input name="name" value="${me.name}" required /></div><div class="form-group"><label>Notifications</label><select name="notifications"><option value="on" ${me.notifications ? 'selected' : ''}>On</option><option value="off" ${!me.notifications ? 'selected' : ''}>Off</option></select></div></div><div class="button-row"><button class="primary">Save profile</button></div></form></section>
  <section class="section"><h3>Security</h3><form id="passwordForm"><div class="form-grid"><div class="form-group"><label>Current password</label><input type="password" name="currentPassword" required /></div><div class="form-group"><label>New password</label><input type="password" name="newPassword" required /></div></div><div class="button-row"><button class="secondary">Change password</button></div></form>
  <form id="deleteAccountForm"><div class="form-group"><label>Confirm password to delete account</label><input type="password" name="deletePassword" required /></div><div class="button-row"><button class="danger">Delete account</button></div></form></section>`;
}
function renderProjectsList() { const rows = getVisibleProjects().map(projectRow).join(''); return `<section class="section"><h2>Projects</h2><form id="filterProjects" class="filter-row"><input name="search" value="${escapeAttr(projectFilters.search)}" placeholder="Search business" /><select name="status"><option value="">All statuses</option><option ${projectFilters.status === 'Audit' ? 'selected' : ''}>Audit</option><option ${projectFilters.status === 'Mockup' ? 'selected' : ''}>Mockup</option><option ${projectFilters.status === 'Build' ? 'selected' : ''}>Build</option><option ${projectFilters.status === 'Live' ? 'selected' : ''}>Live</option></select><select name="flags"><option value="" ${projectFilters.flags === '' ? 'selected' : ''}>Any</option><option value="overdue" ${projectFilters.flags === 'overdue' ? 'selected' : ''}>Overdue</option><option value="waiting" ${projectFilters.flags === 'waiting' ? 'selected' : ''}>Waiting on client</option></select><div class="button-row" style="margin-top:0;"><button class="secondary">Apply</button></div></form></section><section class="section table-wrap"><table class="table"><thead><tr><th>Business</th><th>Status</th><th class="meta">Due</th><th class="meta">Overdue</th><th class="meta">Waiting</th></tr></thead><tbody id="projectRows">${rows || '<tr><td colspan="5">No matches</td></tr>'}</tbody></table></section>`; }
function renderProjectAdmin(me) { const candidates = state.projects.filter((p) => matchesHudFilter(p, adminHudFilter)); const source = candidates.length ? candidates : state.projects; const p = source.find((x) => x.projectId === selectedProjectId) || source[0]; if (!p) return '<section class="section"><h2>No projects</h2></section>'; selectedProjectId = p.projectId; const client = getUser(p.clientId); return `<section class="section"><h2>Project Admin View</h2><div class="small">Metric filter: ${adminHudFilter}</div><form id="adminEditProject"><div class="form-grid"><div class="form-group"><label>Status</label><select name="status">${['Audit', 'Mockup', 'Build', 'Live'].map((s) => `<option ${s === p.status ? 'selected' : ''}>${s}</option>`).join('')}</select></div><div class="form-group"><label>Due date</label><input type="date" name="dueDate" value="${p.dueDate.slice(0, 10)}" /></div><div class="form-group"><label>Assigned admin</label><select name="assignedAdminId">${state.users.filter((u) => u.role === 'admin').map((u) => `<option value="${u.uid}" ${u.uid === p.assignedAdminId ? 'selected' : ''}>${u.name}</option>`).join('')}</select></div><div class="form-group"><label>Next step</label><input name="nextStepText" value="${p.nextStepText}"/></div></div><div class="button-row"><button class="primary">Save changes</button></div></form></section><section class="section"><h3>Upload deliverable</h3><form id="addDeliverable"><div class="form-grid"><div class="form-group"><label>Title</label><input name="title" required /></div><div class="form-group"><label>Type</label><select name="type"><option value="mockup">mockup</option><option value="live">live</option></select></div><div class="form-group"><label>URL</label><input name="url" required /></div></div><div class="button-row"><button class="secondary">Add deliverable</button></div></form></section><section class="section"><h3>Client uploads (${client?.name || ''})</h3>${state.uploads.filter((u) => u.projectId === p.projectId).map((u) => `<div>${u.label} · ${u.fileType}</div>`).join('') || '<div class="small">None</div>'}</section>${renderMessages(p, me)}`; }
function renderAudit() { const rows = getVisibleAuditLogs(); return `<section class="section"><h2>Audit Log</h2><details><summary>Filters</summary><form id="filterAudit" class="section"><div class="form-grid"><div class="form-group"><label>Project</label><input name="projectId" value="${escapeAttr(auditFilters.projectId)}" placeholder="proj-..." /></div><div class="form-group"><label>Actor</label><input name="actorId" value="${escapeAttr(auditFilters.actorId)}" placeholder="admin-..." /></div><div class="form-group"><label>Action</label><input name="action" value="${escapeAttr(auditFilters.action)}" placeholder="project.update" /></div><div class="form-group"><label>From</label><input name="from" type="date" value="${escapeAttr(auditFilters.from)}" /></div><div class="form-group"><label>To</label><input name="to" type="date" value="${escapeAttr(auditFilters.to)}" /></div></div><div class="button-row"><button type="button" id="exportCsv" class="secondary">Export CSV</button><button class="secondary">Apply</button></div></form></details></section><section class="section table-wrap"><table class="table"><thead><tr><th>Timestamp</th><th>Actor</th><th>Action</th><th>Target</th><th class="meta">Project</th></tr></thead><tbody id="auditRows">${auditRows(rows)}</tbody></table></section>`; }
function renderAdmins(me) { return `<section class="section"><h2>Admin Management</h2><form id="addAdmin"><div class="form-grid"><div class="form-group"><label>Email</label><input name="email" required /></div><div class="form-group"><label>Name</label><input name="name" required /></div></div><div class="small">This adds role metadata in Firestore state. Auth user must still be created in Firebase Auth.</div><div class="button-row"><button class="primary">Add admin</button></div></form></section><section class="section"><h3>Admins</h3>${state.users.filter((u) => u.role === 'admin').map((u) => `<div>${u.name} (${u.email}) <span class="small">· last active ${fmt(u.lastActiveAt)}</span> ${u.uid !== me.uid ? `<button class="secondary" data-remove-admin="${u.uid}">Remove</button>` : ''}</div>`).join('')}</section>`; }

function bindForms(me) {
  document.querySelectorAll('.deliverable-action').forEach((form) => form.onsubmit = (e) => { e.preventDefault(); const d = state.deliverables.find((x) => x.deliverableId === form.dataset.id); const fd = new FormData(form); d.status = fd.get('decision'); state.deliverable_comments.push({ commentId: uid('dc'), deliverableId: d.deliverableId, authorId: me.uid, text: fd.get('comment'), createdAt: now() }); logEvent(me.uid, me.role, `deliverable.${d.status}`, 'deliverables', d.deliverableId, d.projectId); persist(); render(); });
  const uploadForm = document.querySelector('#uploadForm'); if (uploadForm) uploadForm.onsubmit = (e) => { e.preventDefault(); const fd = new FormData(e.target); state.uploads.push({ uploadId: uid('up'), projectId: selectedProjectId, uploaderId: me.uid, fileUrl: fd.get('fileUrl'), fileType: fd.get('fileType'), label: fd.get('label'), createdAt: now() }); if (me.role === 'admin') logEvent(me.uid, me.role, 'upload.create', 'uploads', '', selectedProjectId); persist(); render(); };
  document.querySelectorAll('[data-delupload]').forEach((btn) => btn.onclick = (e) => { e.preventDefault(); const upload = state.uploads.find((u) => u.uploadId === btn.dataset.delupload); if (!canDeleteUpload(me, upload)) return; state.uploads = state.uploads.filter((u) => u.uploadId !== upload.uploadId); persist(); render(); });
  const messageForm = document.querySelector('#messageForm'); if (messageForm) messageForm.onsubmit = (e) => { e.preventDefault(); const fd = new FormData(e.target); state.messages.push({ messageId: uid('msg'), projectId: selectedProjectId, authorId: me.uid, role: me.role, text: fd.get('text'), createdAt: now() }); if (me.role === 'admin') logEvent(me.uid, me.role, 'message.create', 'messages', '', selectedProjectId); persist(); render(); };
  const settingsForm = document.querySelector('#settingsForm'); if (settingsForm) settingsForm.onsubmit = (e) => { e.preventDefault(); const fd = new FormData(e.target); me.name = fd.get('name'); me.notifications = fd.get('notifications') === 'on'; persist(); render(); };

  const passwordForm = document.querySelector('#passwordForm');
  if (passwordForm) passwordForm.onsubmit = async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    try {
      await reauthWithPassword(String(fd.get('currentPassword')));
      await updatePassword(auth.currentUser, String(fd.get('newPassword')));
      alert('Password updated successfully.');
      passwordForm.reset();
    } catch (error) {
      alert(`Password change failed: ${error.message}`);
    }
  };

  const deleteAccountForm = document.querySelector('#deleteAccountForm');
  if (deleteAccountForm) deleteAccountForm.onsubmit = async (e) => {
    e.preventDefault();
    if (!confirm('Delete your account permanently? This cannot be undone.')) return;
    const fd = new FormData(e.target);
    try {
      await reauthWithPassword(String(fd.get('deletePassword')));
      state.users = state.users.filter((u) => u.uid !== me.uid);
      await persist();
      await deleteUser(auth.currentUser);
      alert('Account deleted.');
    } catch (error) {
      alert(`Account deletion failed: ${error.message}`);
    }
  };

  const filterProjects = document.querySelector('#filterProjects'); if (filterProjects) filterProjects.onsubmit = (e) => { e.preventDefault(); const fd = new FormData(e.target); projectFilters = { search: String(fd.get('search') || ''), status: String(fd.get('status') || ''), flags: String(fd.get('flags') || '') }; render(); };
  const adminEdit = document.querySelector('#adminEditProject'); if (adminEdit) adminEdit.onsubmit = (e) => { e.preventDefault(); const p = state.projects.find((x) => x.projectId === selectedProjectId); const fd = new FormData(e.target); const prevStatus = p.status; p.status = fd.get('status'); p.dueDate = new Date(fd.get('dueDate')).toISOString(); p.assignedAdminId = fd.get('assignedAdminId'); p.nextStepText = fd.get('nextStepText'); p.updatedAt = now(); if (prevStatus !== p.status) p.statusHistory.push({ status: p.status, at: now() }); logEvent(me.uid, me.role, 'project.update', 'projects', p.projectId, p.projectId); persist(); render(); };
  const addDeliverable = document.querySelector('#addDeliverable'); if (addDeliverable) addDeliverable.onsubmit = (e) => { e.preventDefault(); const fd = new FormData(e.target); const d = { deliverableId: uid('del'), projectId: selectedProjectId, title: fd.get('title'), type: fd.get('type'), urls: [fd.get('url')], status: 'pending', createdAt: now() }; state.deliverables.push(d); logEvent(me.uid, me.role, 'deliverable.create', 'deliverables', d.deliverableId, selectedProjectId); persist(); render(); };
  const filterAudit = document.querySelector('#filterAudit'); if (filterAudit) filterAudit.onsubmit = (e) => { e.preventDefault(); const fd = new FormData(e.target); auditFilters = { projectId: String(fd.get('projectId') || ''), actorId: String(fd.get('actorId') || ''), action: String(fd.get('action') || ''), from: String(fd.get('from') || ''), to: String(fd.get('to') || '') }; render(); };
  const exportCsv = document.querySelector('#exportCsv'); if (exportCsv) exportCsv.onclick = () => { const headers = ['timestamp', 'actorId', 'actorRole', 'action', 'targetType', 'targetId', 'projectId']; const rows = getVisibleAuditLogs(); const lines = [headers.join(',')].concat(rows.map((l) => headers.map((h) => `"${String(l[h] ?? '').replaceAll('"', '""')}"`).join(','))); const blob = new Blob([lines.join('\n')], { type: 'text/csv' }); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'audit-log.csv'; a.click(); };
  const addAdmin = document.querySelector('#addAdmin'); if (addAdmin) addAdmin.onsubmit = (e) => { e.preventDefault(); const fd = new FormData(e.target); const admin = { uid: uid('admin'), email: fd.get('email'), role: 'admin', name: fd.get('name'), createdAt: now(), lastActiveAt: now(), notifications: true, firstLogin: true }; state.users.push(admin); logEvent(me.uid, me.role, 'admin.add', 'users', admin.uid, null); persist(); render(); };
  document.querySelectorAll('[data-remove-admin]').forEach((btn) => btn.onclick = (e) => { e.preventDefault(); state.users = state.users.filter((u) => u.uid !== btn.dataset.removeAdmin); logEvent(me.uid, me.role, 'admin.remove', 'users', btn.dataset.removeAdmin, null); persist(); render(); });
}

function getVisibleProjects() { return state.projects.filter((p) => { const search = projectFilters.search.toLowerCase(); const status = projectFilters.status; const flag = projectFilters.flags; const overdue = isOverdueProject(p); const waiting = projectWaiting(p); const passForm = (!search || p.businessName.toLowerCase().includes(search)) && (!status || p.status === status) && (!flag || (flag === 'overdue' ? overdue : waiting)); return passForm && matchesHudFilter(p, adminHudFilter); }); }
function getVisibleAuditLogs() { return state.audit_logs.filter((l) => { if (auditFilters.projectId && !String(l.projectId || '').includes(auditFilters.projectId)) return false; if (auditFilters.actorId && !String(l.actorId).includes(auditFilters.actorId)) return false; if (auditFilters.action && !String(l.action).includes(auditFilters.action)) return false; if (auditFilters.from && new Date(l.timestamp) < new Date(auditFilters.from)) return false; if (auditFilters.to && new Date(l.timestamp) > new Date(`${auditFilters.to}T23:59:59`)) return false; const project = state.projects.find((p) => p.projectId === l.projectId); if (adminHudFilter === 'activity') return (Date.now() - new Date(l.timestamp).getTime()) <= 7 * 24 * 3600_000; if (adminHudFilter === 'turnaround') return l.action === 'project.update'; if (!project) return adminHudFilter === 'all'; return matchesHudFilter(project, adminHudFilter); }); }
function matchesHudFilter(project, filter) { if (filter === 'all') return true; if (filter === 'active') return !['live', 'closed'].includes(String(project.status).toLowerCase()); if (filter === 'overdue') return isOverdueProject(project); if (filter === 'waiting') return projectWaiting(project); if (filter === 'activity' || filter === 'turnaround') return true; return true; }
function isOverdueProject(project) { return new Date(project.dueDate) < Date.now() && String(project.status).toLowerCase() !== 'live'; }
function projectWaiting(project) { return /review|approve|waiting/i.test(project.nextStepText || ''); }
function avgTurnaroundDays() { const intervals = []; state.projects.forEach((project) => { const history = (project.statusHistory || []).slice().sort((a, b) => new Date(a.at) - new Date(b.at)); for (let i = 1; i < history.length; i += 1) { const prev = new Date(history[i - 1].at).getTime(); const curr = new Date(history[i].at).getTime(); const diffDays = (curr - prev) / 86400_000; if (Number.isFinite(diffDays) && diffDays >= 0) intervals.push(diffDays); } }); if (!intervals.length) return null; const avg = intervals.reduce((sum, x) => sum + x, 0) / intervals.length; return Math.round(avg * 10) / 10; }
function projectRow(p) { return `<tr><td>${p.businessName}</td><td>${p.status}</td><td class="meta">${fmt(p.dueDate)}</td><td class="meta">${isOverdueProject(p) ? 'Yes' : 'No'}</td><td class="meta">${projectWaiting(p) ? 'Yes' : 'No'}</td></tr>`; }
function canDeleteUpload(me, upload) { if (!upload) return false; if (me.role === 'admin') return true; return upload.uploaderId === me.uid; }
function logEvent(actorId, actorRole, action, targetType, targetId, projectId) { if (actorRole !== 'admin') return; state.audit_logs.push({ eventId: uid('evt'), timestamp: now(), actorId, actorRole, action, targetType, targetId, projectId, metadata: {} }); }
function auditRows(logs) { return logs.slice().reverse().map((l) => `<tr><td>${fmt(l.timestamp)}</td><td>${l.actorId}</td><td>${l.action}</td><td>${l.targetType}:${l.targetId || '-'}</td><td class="meta">${l.projectId || '-'}</td></tr>`).join('') || '<tr><td colspan="5">No logs yet</td></tr>'; }

async function reauthWithPassword(password) {
  const user = auth.currentUser;
  const credential = EmailAuthProvider.credential(user.email, password);
  await reauthenticateWithCredential(user, credential);
}

async function persist() {
  localStorage.setItem('portal-state', JSON.stringify(state));
  if (!stateRef || isPersisting) return;
  try {
    isPersisting = true;
    await setDoc(stateRef, state);
  } catch (error) {
    console.error('Firestore write failed', error);
  } finally {
    isPersisting = false;
  }
}

function getFirebaseHint(message) {
  const m = String(message || '').toLowerCase();
  if (m.includes('missing or insufficient permissions') || m.includes('permission-denied')) return 'Firestore rules are blocking reads/writes. Deploy rules that allow app access to portal/state for your MVP.';
  if (m.includes('api key') || m.includes('project') || m.includes('app/no-app')) return 'Check firebase-config.js values (apiKey, projectId, appId, authDomain) and ensure Firestore/Auth are enabled.';
  return '';
}

async function logout() { if (auth) await signOut(auth); }
function getUser(uid) { return state.users.find((u) => u.uid === uid); }
function now() { return new Date().toISOString(); }
function addHours(hours) { return new Date(Date.now() + (hours * 3600_000)).toISOString(); }
function dateDays(days) { return new Date(Date.now() + (days * 86400_000)).toISOString(); }
function uid(prefix) { return `${prefix}-${Math.random().toString(36).slice(2, 9)}`; }
function fmt(x) { return new Date(x).toLocaleString(); }
function escapeAttr(x) { return String(x || '').replaceAll('"', '&quot;'); }
