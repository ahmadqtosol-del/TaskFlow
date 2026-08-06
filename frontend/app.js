const API = "/api";

let state = {
  projects: [],
  users: [],
  tasks: [],
  currentProjectId: null,
  currentTaskId: null,
  editingProjectId: null,
  editingTaskId: null,
  filters: { assignee: "", priority: "", search: "" },
  pendingDelete: null, // { type, id }
  activeOverlay: null,
};

const STATUSES = ["To Do", "In Progress", "In Review", "Completed"];
const STATUS_CLASS = {
  "To Do": "col-todo",
  "In Progress": "col-progress",
  "In Review": "col-review",
  "Completed": "col-done",
};
const PRIORITY_CLASS = {
  Urgent: "badge-urgent",
  High: "badge-high",
  Medium: "badge-medium",
  Low: "badge-low",
};

// ---------------- helpers ----------------
async function api(path, options = {}) {
  const res = await fetch(API + path, {
    headers: options.body && !(options.body instanceof FormData) ? { "Content-Type": "application/json" } : {},
    ...options,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: "Request failed" }));
    throw new Error(err.detail || "Request failed");
  }
  if (res.status === 204) return null;
  return res.json();
}

function toast(msg) {
  const t = document.getElementById("toast");
  t.textContent = msg;
  t.classList.add("show");
  setTimeout(() => t.classList.remove("show"), 2200);
}

function closeAllOverlays() {
  document.querySelectorAll(".modal-overlay").forEach(overlay => overlay.classList.remove("open"));
  state.activeOverlay = null;
}

function openModal(id) {
  closeAllOverlays();
  const overlay = document.getElementById(id);
  if (!overlay) return;
  overlay.classList.add("open");
  state.activeOverlay = id;
}

function closeModal(id) {
  const overlay = document.getElementById(id);
  if (overlay) overlay.classList.remove("open");
  if (state.activeOverlay === id) state.activeOverlay = null;
}

function fmtDate(d) {
  if (!d) return "—";
  const date = new Date(d);
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

// ---------------- data loading ----------------
async function loadAll() {
  state.users = await api("/users");
  state.projects = await api("/projects");
  if (!state.currentProjectId && state.projects.length) {
    state.currentProjectId = state.projects[0].id;
  }
  await refreshStats();
  renderProjectSelect();
  renderProjectGrid();
  renderTeam();
  if (state.currentProjectId) await loadTasksForCurrentProject();
}

async function refreshStats() {
  const s = await api("/stats");
  document.getElementById("stat-total").textContent = s.total;
  document.getElementById("stat-todo").textContent = s.todo;
  document.getElementById("stat-inprogress").textContent = s.in_progress;
  document.getElementById("stat-inreview").textContent = s.in_review;
  document.getElementById("stat-completed").textContent = s.completed;
}

async function loadTasksForCurrentProject() {
  if (!state.currentProjectId) { state.tasks = []; renderBoard(); return; }
  state.tasks = await api(`/tasks?project_id=${state.currentProjectId}`);
  const project = state.projects.find(p => p.id === state.currentProjectId);
  if (project) {
    document.getElementById("boardProjectName").textContent = project.name;
    document.getElementById("boardProjectDesc").textContent = project.description || "Track every task from start to finish";
  }
  renderBoard();
}

// ---------------- rendering: sidebar / project select ----------------
function renderProjectSelect() {
  const sel = document.getElementById("projectSelect");
  sel.innerHTML = state.projects.map(p =>
    `<option value="${p.id}" ${p.id === state.currentProjectId ? "selected" : ""}>${escapeHtml(p.name)}</option>`
  ).join("");
}

function renderProjectGrid() {
  const grid = document.getElementById("projectGrid");
  if (!state.projects.length) {
    grid.innerHTML = `<p style="color:var(--gray-400);font-size:13px;">No projects yet — create one from the sidebar.</p>`;
    return;
  }
  grid.innerHTML = state.projects.map(p => {
    const pct = p.task_count ? Math.round((p.completed_count / p.task_count) * 100) : 0;
    return `
      <div class="project-card" data-project="${p.id}">
        <h3>${escapeHtml(p.name)}</h3>
        <p>${escapeHtml(p.description || "No description")}</p>
        <div class="project-progress-row">
          <div class="progress-bar"><div class="progress-fill" style="width:${pct}%"></div></div>
          <span class="count">${pct}%</span>
        </div>
        <span class="count">${p.completed_count}/${p.task_count} tasks completed</span>
      </div>`;
  }).join("");

  grid.querySelectorAll(".project-card").forEach(card => {
    card.addEventListener("click", () => {
      state.currentProjectId = Number(card.dataset.project);
      switchView("board");
      renderProjectSelect();
      loadTasksForCurrentProject();
    });
  });
}

function renderTeam() {
  const grid = document.getElementById("teamGrid");
  if (!state.users.length) {
    grid.innerHTML = `<p style="color:var(--gray-400);font-size:13px;">No team members yet.</p>`;
    return;
  }
  grid.innerHTML = state.users.map(u => `
    <div class="team-card">
      <div class="avatar" style="background:${u.color}">${u.initials}</div>
      <h4>${escapeHtml(u.name)}</h4>
      <button data-user="${u.id}" title="Remove">✕</button>
    </div>
  `).join("");

  grid.querySelectorAll("button[data-user]").forEach(btn => {
    btn.addEventListener("click", () => confirmDelete("user", Number(btn.dataset.user), u => u.name));
  });

  const assigneeFilter = document.getElementById("filterAssignee");
  const current = assigneeFilter.value;
  assigneeFilter.innerHTML = `<option value="">All assignees</option>` +
    state.users.map(u => `<option value="${u.id}">${escapeHtml(u.name)}</option>`).join("");
  assigneeFilter.value = current;

  const assigneesSelect = document.getElementById("taskAssigneesInput");
  assigneesSelect.innerHTML = state.users.map(u => `<option value="${u.id}">${escapeHtml(u.name)}</option>`).join("");
}

// ---------------- rendering: board ----------------
function filteredTasks() {
  return state.tasks.filter(t => {
    if (state.filters.priority && t.priority !== state.filters.priority) return false;
    if (state.filters.assignee && !t.assignees.some(a => a.id === Number(state.filters.assignee))) return false;
    if (state.filters.search) {
      const q = state.filters.search.toLowerCase();
      if (!t.title.toLowerCase().includes(q) && !(t.description || "").toLowerCase().includes(q)) return false;
    }
    return true;
  });
}

function renderBoard() {
  const board = document.getElementById("board");
  const tasks = filteredTasks();
  board.innerHTML = STATUSES.map(status => {
    const colTasks = tasks.filter(t => t.status === status);
    return `
      <div class="column ${STATUS_CLASS[status]}">
        <div class="column-header">
          <div class="column-title-group">
            <span class="column-dot"></span>
            ${status}
            <span class="column-count">${colTasks.length}</span>
          </div>
          <button class="column-add" data-newstatus="${status}">+</button>
        </div>
        <div class="column-body">
          ${colTasks.map(taskCardHtml).join("") || `<p style="font-size:12px;color:var(--gray-400);padding:6px;">No tasks</p>`}
        </div>
      </div>
    `;
  }).join("");

  board.querySelectorAll(".task-card").forEach(card => {
    card.addEventListener("click", () => openTaskDetail(Number(card.dataset.task)));
  });
  board.querySelectorAll("[data-newstatus]").forEach(btn => {
    btn.addEventListener("click", () => openTaskModal(null, btn.dataset.newstatus));
  });
}

function taskCardHtml(t) {
  const avatars = t.assignees.slice(0, 3).map(a =>
    `<div class="avatar" style="background:${a.color}">${a.initials}</div>`
  ).join("");
  return `
    <div class="task-card" data-task="${t.id}">
      <span class="badge ${PRIORITY_CLASS[t.priority] || "badge-medium"}">${t.priority}</span>
      <h4 style="margin-top:8px;">${escapeHtml(t.title)}</h4>
      <p class="desc">${escapeHtml(t.description || "")}</p>
      <div class="meta-row">
        <span class="date">📅 ${fmtDate(t.start_date)} – ${fmtDate(t.due_date)}</span>
      </div>
      <div class="footer-row">
        <div class="avatar-stack">${avatars}</div>
        <span style="font-size:11px;color:var(--gray-600);font-weight:600;">${t.progress}%</span>
      </div>
    </div>
  `;
}

// ---------------- task detail ----------------
async function openTaskDetail(taskId) {
  const t = await api(`/tasks/${taskId}`);
  state.currentTaskId = t.id;

  document.getElementById("detailPriority").textContent = t.priority;
  document.getElementById("detailPriority").className = "badge " + (PRIORITY_CLASS[t.priority] || "badge-medium");
  document.getElementById("detailTitle").textContent = t.title;
  document.getElementById("detailProgressFill").style.width = t.progress + "%";
  document.getElementById("detailProgressLabel").textContent = t.progress + "%";
  document.getElementById("detailStatus").textContent = t.status;
  document.getElementById("detailDue").textContent = fmtDate(t.due_date);
  document.getElementById("detailAssignees").textContent = t.assignees.map(a => a.name).join(", ") || "Unassigned";
  document.getElementById("detailDescription").textContent = t.description || "No description provided.";

  document.getElementById("detailAttachments").innerHTML = t.attachments.length
    ? t.attachments.map(a => `
        <div class="attachment-row" data-attachment="${a.id}">
          <a href="${API}/attachments/${a.id}/download" target="_blank">📎 ${escapeHtml(a.filename)}</a>
          <button data-remove-attachment="${a.id}">Remove</button>
        </div>`).join("")
    : `<p style="font-size:13px;color:var(--gray-400);">No attachments yet.</p>`;

  document.getElementById("detailComments").innerHTML = t.comments.length
    ? t.comments.map(c => `
        <div class="comment-row" data-comment="${c.id}">
          <div class="comment-head">
            <span class="author">${escapeHtml(c.author_name)}</span>
            <span class="time">${new Date(c.created_at).toLocaleString()}</span>
          </div>
          <span>${escapeHtml(c.content)}</span>
          <button class="remove" data-remove-comment="${c.id}">Delete</button>
        </div>`).join("")
    : `<p style="font-size:13px;color:var(--gray-400);">No comments yet.</p>`;

  document.querySelectorAll("[data-remove-attachment]").forEach(btn => {
    btn.addEventListener("click", async () => {
      await api(`/attachments/${btn.dataset.removeAttachment}`, { method: "DELETE" });
      openTaskDetail(taskId);
    });
  });
  document.querySelectorAll("[data-remove-comment]").forEach(btn => {
    btn.addEventListener("click", async () => {
      await api(`/comments/${btn.dataset.removeComment}`, { method: "DELETE" });
      openTaskDetail(taskId);
    });
  });

  openModal("detailOverlay");
}

document.getElementById("detailClose").addEventListener("click", () => closeModal("detailOverlay"));
document.getElementById("detailEditBtn").addEventListener("click", async () => {
  const t = await api(`/tasks/${state.currentTaskId}`);
  closeModal("detailOverlay");
  openTaskModal(t);
});
document.getElementById("detailDeleteBtn").addEventListener("click", () => {
  confirmDelete("task", state.currentTaskId, () => "this task");
});

document.getElementById("commentForm").addEventListener("submit", async e => {
  e.preventDefault();
  const author = document.getElementById("commentAuthorInput").value.trim();
  const content = document.getElementById("commentContentInput").value.trim();
  if (!author || !content) return;
  await api(`/tasks/${state.currentTaskId}/comments`, {
    method: "POST",
    body: JSON.stringify({ author_name: author, content }),
  });
  document.getElementById("commentContentInput").value = "";
  openTaskDetail(state.currentTaskId);
});

document.getElementById("attachmentForm").addEventListener("submit", async e => {
  e.preventDefault();
  const fileInput = document.getElementById("attachmentInput");
  if (!fileInput.files.length) return;
  const fd = new FormData();
  fd.append("file", fileInput.files[0]);
  await api(`/tasks/${state.currentTaskId}/attachments`, { method: "POST", body: fd });
  fileInput.value = "";
  openTaskDetail(state.currentTaskId);
});

// ---------------- task create/edit modal ----------------
function openTaskModal(task, defaultStatus) {
  state.editingTaskId = task ? task.id : null;
  document.getElementById("taskModalTitle").textContent = task ? "Edit task" : "New task";
  document.getElementById("taskTitleInput").value = task ? task.title : "";
  document.getElementById("taskDescInput").value = task ? task.description : "";
  document.getElementById("taskStatusInput").value = task ? task.status : (defaultStatus || "To Do");
  document.getElementById("taskPriorityInput").value = task ? task.priority : "Medium";
  document.getElementById("taskStartInput").value = task ? (task.start_date || "") : "";
  document.getElementById("taskDueInput").value = task ? (task.due_date || "") : "";
  document.getElementById("taskProgressInput").value = task ? task.progress : 0;
  document.getElementById("taskProgressValue").textContent = (task ? task.progress : 0) + "%";

  const assigneesSelect = document.getElementById("taskAssigneesInput");
  const assignedIds = task ? task.assignees.map(a => a.id) : [];
  [...assigneesSelect.options].forEach(opt => {
    opt.selected = assignedIds.includes(Number(opt.value));
  });

  openModal("taskModalOverlay");
}

document.getElementById("newTaskBtn").addEventListener("click", () => openTaskModal(null));
document.getElementById("taskProgressInput").addEventListener("input", e => {
  document.getElementById("taskProgressValue").textContent = e.target.value + "%";
});

document.getElementById("taskForm").addEventListener("submit", async e => {
  e.preventDefault();
  if (!state.currentProjectId) { toast("Create a project first"); return; }

  const assigneeIds = [...document.getElementById("taskAssigneesInput").selectedOptions].map(o => Number(o.value));
  const payload = {
    title: document.getElementById("taskTitleInput").value.trim(),
    description: document.getElementById("taskDescInput").value.trim(),
    status: document.getElementById("taskStatusInput").value,
    priority: document.getElementById("taskPriorityInput").value,
    progress: Number(document.getElementById("taskProgressInput").value),
    start_date: document.getElementById("taskStartInput").value || null,
    due_date: document.getElementById("taskDueInput").value || null,
    assignee_ids: assigneeIds,
  };

  if (state.editingTaskId) {
    await api(`/tasks/${state.editingTaskId}`, { method: "PUT", body: JSON.stringify(payload) });
    toast("Task updated");
  } else {
    payload.project_id = state.currentProjectId;
    await api(`/tasks`, { method: "POST", body: JSON.stringify(payload) });
    toast("Task created");
  }
  closeModal("taskModalOverlay");
  await loadTasksForCurrentProject();
  await refreshStats();
  renderProjectGrid();
});

// ---------------- project create/edit ----------------
document.getElementById("newProjectBtn").addEventListener("click", () => {
  state.editingProjectId = null;
  document.getElementById("projectModalTitle").textContent = "New project";
  document.getElementById("projectNameInput").value = "";
  document.getElementById("projectDescInput").value = "";
  openModal("projectModalOverlay");
});

document.getElementById("projectForm").addEventListener("submit", async e => {
  e.preventDefault();
  const payload = {
    name: document.getElementById("projectNameInput").value.trim(),
    description: document.getElementById("projectDescInput").value.trim(),
  };
  if (state.editingProjectId) {
    await api(`/projects/${state.editingProjectId}`, { method: "PUT", body: JSON.stringify(payload) });
  } else {
    const created = await api(`/projects`, { method: "POST", body: JSON.stringify(payload) });
    state.currentProjectId = created.id;
  }
  closeModal("projectModalOverlay");
  toast("Project saved");
  await loadAll();
});

document.getElementById("deleteProjectBtn").addEventListener("click", () => {
  if (!state.currentProjectId) return;
  const p = state.projects.find(p => p.id === state.currentProjectId);
  confirmDelete("project", state.currentProjectId, () => p ? p.name : "this project");
});

document.getElementById("projectSelect").addEventListener("change", e => {
  state.currentProjectId = Number(e.target.value);
  loadTasksForCurrentProject();
});

// ---------------- user create/delete ----------------
document.getElementById("newUserBtn").addEventListener("click", () => {
  document.getElementById("userNameInput").value = "";
  document.getElementById("userColorInput").value = "#6366F1";
  openModal("userModalOverlay");
});

document.getElementById("userForm").addEventListener("submit", async e => {
  e.preventDefault();
  const name = document.getElementById("userNameInput").value.trim();
  const initials = name.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase();
  await api(`/users`, {
    method: "POST",
    body: JSON.stringify({ name, initials, color: document.getElementById("userColorInput").value }),
  });
  closeModal("userModalOverlay");
  toast("Member added");
  state.users = await api("/users");
  renderTeam();
});

// ---------------- delete confirmation (generic) ----------------
function confirmDelete(type, id, labelFn) {
  state.pendingDelete = { type, id };
  const labels = { project: "project", task: "task", user: "team member" };
  document.getElementById("confirmTitle").textContent = `Delete this ${labels[type]}?`;
  document.getElementById("confirmMessage").textContent =
    `This will permanently remove it${type !== "user" ? " and everything inside it" : ""}. This cannot be undone.`;
  openModal("confirmOverlay");
}

document.getElementById("confirmCancel").addEventListener("click", () => closeModal("confirmOverlay"));
document.getElementById("confirmOk").addEventListener("click", async () => {
  const { type, id } = state.pendingDelete;
  if (type === "project") {
    await api(`/projects/${id}`, { method: "DELETE" });
    state.currentProjectId = null;
    closeModal("confirmOverlay");
    toast("Project deleted");
    await loadAll();
    switchView("dashboard");
  } else if (type === "task") {
    await api(`/tasks/${id}`, { method: "DELETE" });
    closeModal("confirmOverlay");
    closeModal("detailOverlay");
    toast("Task deleted");
    await loadTasksForCurrentProject();
    await refreshStats();
    renderProjectGrid();
  } else if (type === "user") {
    await api(`/users/${id}`, { method: "DELETE" });
    closeModal("confirmOverlay");
    toast("Member removed");
    state.users = await api("/users");
    renderTeam();
    await loadTasksForCurrentProject();
  }
});

// ---------------- generic modal close handlers ----------------
document.querySelectorAll("[data-close]").forEach(btn => {
  btn.addEventListener("click", () => {
    const overlay = btn.closest(".modal-overlay");
    if (overlay) closeModal(overlay.id);
  });
});
document.querySelectorAll(".modal-overlay").forEach(overlay => {
  overlay.addEventListener("click", e => {
    if (e.target === overlay) closeModal(overlay.id);
  });
});

// ---------------- filters ----------------
document.getElementById("filterAssignee").addEventListener("change", e => {
  state.filters.assignee = e.target.value; renderBoard();
});
document.getElementById("filterPriority").addEventListener("change", e => {
  state.filters.priority = e.target.value; renderBoard();
});
document.getElementById("searchInput").addEventListener("input", e => {
  state.filters.search = e.target.value; renderBoard();
});

// ---------------- view switching ----------------
function switchView(view) {
  document.querySelectorAll(".view").forEach(v => v.classList.remove("active"));
  document.getElementById(`view-${view}`).classList.add("active");
  document.querySelectorAll(".nav-item").forEach(n => n.classList.toggle("active", n.dataset.view === view));
}
document.querySelectorAll(".nav-item").forEach(item => {
  item.addEventListener("click", () => switchView(item.dataset.view));
});

// ---------------- utils ----------------
function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str ?? "";
  return div.innerHTML;
}

// ---------------- init ----------------
loadAll().catch(err => toast("Failed to load: " + err.message));
