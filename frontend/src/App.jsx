import React, { useEffect, useMemo, useState, useRef } from 'react';
import KanbanBoard from './components/KanbanBoard';


const STATUS_ORDER = ['To Do', 'In Progress', 'In Review', 'Completed'];
const NAV_ITEMS = [
  { id: 'dashboard', label: 'Dashboard', icon: '📊' },
  { id: 'project', label: 'Project Board', icon: '📋' },
  { id: 'inbox', label: 'Inbox', icon: '📥' },
  { id: 'mytasks', label: 'My Tasks', icon: '🗂️' },
  { id: 'team', label: 'Team Members', icon: '👥' },
  { id: 'departments', label: 'Departments', icon: '🏢' },
  { id: 'schedule', label: 'Schedule', icon: '🗓️' },
  { id: 'activities', label: 'Activities', icon: '⚡' },
  { id: 'settings', label: 'Settings', icon: '⚙️' },
];

const priorityClass = {
  Urgent: 'badge-urgent',
  High: 'badge-high',
  Medium: 'badge-medium',
  Low: 'badge-low',
};

const departmentColors = {
  'Engineering': '#4F46E5',
  'Design': '#EC4899',
  'Marketing': '#F59E0B',
  'Sales': '#10B981',
  'Product': '#8B5CF6',
  'Operations': '#6B7280',
  'HR': '#EF4444',
  'Finance': '#14B8A6',
};

const departmentEmojis = {
  'Engineering': '🛠️',
  'Design': '🎨',
  'Marketing': '📣',
  'Sales': '💼',
  'Product': '🧩',
  'Operations': '⚙️',
  'HR': '👥',
  'Finance': '💰',
};

async function api(path, options = {}) {
  const headers = new Headers(options.headers || {});
  if (options.body && !(options.body instanceof FormData) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  const res = await fetch(`/api${path}`, { ...options, headers });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Request failed' }));
    throw new Error(err.detail || 'Request failed');
  }
  if (res.status === 204) return null;
  return res.json();
}

function App({ user, onLogout }) {
  const [activeView, setActiveView] = useState('dashboard');
  const [projects, setProjects] = useState([]);
  const [users, setUsers] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [stats, setStats] = useState({ total: 0, todo: 0, in_progress: 0, in_review: 0, completed: 0, project_count: 0 });
  const [notifications, setNotifications] = useState([]);
  const [activity, setActivity] = useState([]);
  const [settings, setSettings] = useState({ workspace_name: 'TaskFlow', default_view: null, theme: 'light' });
  const [activeUserId, setActiveUserId] = useState(null);
  const [selectedProjectId, setSelectedProjectId] = useState(null);
  const [dialogState, setDialogState] = useState({ type: null, payload: null });
  const [filterPriority, setFilterPriority] = useState('');
  const [filterAssignee, setFilterAssignee] = useState('');
  const [filterDepartment, setFilterDepartment] = useState('');
  const [searchText, setSearchText] = useState('');
  const [departmentList, setDepartmentList] = useState([]);
  const [scheduleRange, setScheduleRange] = useState({ start: '', end: '' });
  const [scheduleTasks, setScheduleTasks] = useState([]);
  const [toast, setToast] = useState('');
  const [editingDepartment, setEditingDepartment] = useState(null);
  const [viewMode, setViewMode] = useState('board'); // 'board' or 'kanban'

  const scheduleLoadedRef = useRef(false);
  const initialLoadDone = useRef(false);

  const activeUser = users.find((u) => u.id === activeUserId) || users[0] || null;

  const boardTasks = useMemo(() => tasks.filter((task) => {
    if (filterPriority && task.priority !== filterPriority) return false;
    if (filterAssignee && !task.assignees.some((a) => String(a.id) === String(filterAssignee))) return false;
    if (filterDepartment && !task.assignees.some((a) => a.department === filterDepartment)) return false;
    if (searchText) {
      const q = searchText.toLowerCase();
      return (task.title || '').toLowerCase().includes(q) || (task.description || '').toLowerCase().includes(q);
    }
    return true;
  }), [tasks, filterPriority, filterAssignee, filterDepartment, searchText]);

  const myTasks = useMemo(() => {
    if (!activeUserId) return [];
    return tasks.filter((task) => task.assignees.some((assignee) => assignee.id === activeUserId));
  }, [tasks, activeUserId]);

  const departmentStats = useMemo(() => {
    const statsObj = {};
    departmentList.forEach(dept => {
      const deptUsers = users.filter(u => u.department === dept);
      const deptTasks = tasks.filter(t => t.assignees.some(a => deptUsers.some(u => u.id === a.id)));
      statsObj[dept] = {
        users: deptUsers.length,
        tasks: deptTasks.length,
        completed: deptTasks.filter(t => t.status === 'Completed').length,
        progress: deptTasks.length > 0 ? Math.round((deptTasks.filter(t => t.status === 'Completed').length / deptTasks.length) * 100) : 0,
      };
    });
    return statsObj;
  }, [departmentList, users, tasks]);

  // Sync Firebase user with database
  useEffect(() => {
    if (user && users.length > 0) {
      const dbUser = users.find(u => u.email === user.email);
      if (dbUser) {
        setActiveUserId(dbUser.id);
      } else {
        handleAutoCreateUser(user);
      }
    }
  }, [user, users]);

  const handleAutoCreateUser = async (firebaseUser) => {
    try {
      const newUser = {
        name: firebaseUser.displayName || firebaseUser.email.split('@')[0],
        initials: (firebaseUser.displayName || firebaseUser.email.split('@')[0])
          .substring(0, 2).toUpperCase(),
        email: firebaseUser.email,
        department: 'Operations',
        color: '#6366F1',
        emoji: '👤'
      };

      await api('/users', {
        method: 'POST',
        body: JSON.stringify(newUser)
      });

      await loadAll();
      showToast('Welcome to TaskFlow! 🎉');
    } catch (error) {
      console.error('Error creating user:', error);
      showToast('Error setting up account.');
    }
  };

  useEffect(() => {
    if (!initialLoadDone.current) {
      initialLoadDone.current = true;
      loadAll();
    }
  }, []);

  useEffect(() => {
    if (projects.length > 0 && !selectedProjectId) {
      const project = projects.find((p) => p.id === selectedProjectId) || projects[0];
      if (project) {
        setSelectedProjectId(project.id);
        loadTasks(project.id);
      }
    }
  }, [projects]);

  useEffect(() => {
    if (users.length && !activeUserId) {
      setActiveUserId(users[0].id);
    }
  }, [users, activeUserId]);

  useEffect(() => {
    if (activeUserId) {
      loadNotifications(activeUserId);
    }
  }, [activeUserId]);

  useEffect(() => {
    if (scheduleRange.start && scheduleRange.end && !scheduleLoadedRef.current) {
      scheduleLoadedRef.current = true;
      loadSchedule();
    }
  }, [scheduleRange]);

  async function loadAll() {
    try {
      const [allUsers, allProjects, statsData, settingsData, deptData] = await Promise.all([
        api('/users'),
        api('/projects'),
        api('/stats'),
        api('/settings'),
        api('/departments'),
      ]);
      setUsers(allUsers);
      setProjects(allProjects);
      setStats(statsData);
      setSettings(settingsData);

      setDepartmentList(deptData.departments || []);

      if (allProjects[0]) {
        setSelectedProjectId(allProjects[0].id);
        await loadTasks(allProjects[0].id);
      }
      if (allUsers[0]) setActiveUserId(allUsers[0].id);

      await loadActivities();

      const today = new Date();
      const start = formatDateISO(new Date(today.setDate(today.getDate() - today.getDay())));
      const end = formatDateISO(new Date(new Date(start).setDate(new Date(start).getDate() + 6)));
      setScheduleRange({ start, end });
    } catch (error) {
      console.error('Error loading initial data:', error);
      showToast('Error loading workspace data');
    }
  }

  async function loadTasks(projectId) {
    if (!projectId) return;
    try {
      const data = await api(`/tasks?project_id=${projectId}`);
      setTasks(data);
    } catch (error) {
      console.error('Error loading tasks:', error);
    }
  }

  async function loadNotifications(userId) {
    if (!userId) return;
    try {
      const data = await api(`/notifications?user_id=${userId}`);
      setNotifications(data);
    } catch (error) {
      console.error('Error loading notifications:', error);
    }
  }

  async function loadActivities() {
    try {
      const data = await api('/activity?limit=50');
      setActivity(data);
    } catch (error) {
      console.error('Error loading activities:', error);
    }
  }

  async function loadSchedule() {
    if (!scheduleRange.start || !scheduleRange.end) return;
    try {
      const data = await api(`/tasks/by-date?start=${scheduleRange.start}&end=${scheduleRange.end}`);
      setScheduleTasks(data);
    } catch (error) {
      console.error('Error loading schedule:', error);
    }
  }

  async function saveSettings(payload) {
    try {
      const data = await api('/settings', { method: 'PUT', body: JSON.stringify(payload) });
      setSettings(data);
      showToast('Settings saved successfully! ✨');
    } catch (error) {
      showToast('Error saving settings');
    }
  }

  function showToast(message) {
    setToast(message);
    window.clearTimeout(showToast.timer);
    showToast.timer = window.setTimeout(() => setToast(''), 2500);
  }

  function closeAllDialogs() {
    setDialogState({ type: null, payload: null });
    setEditingDepartment(null);
  }

  function formatDateISO(date) {
    const d = new Date(date);
    return d.toISOString().split('T')[0];
  }

  function renderDate(dateInput) {
    if (!dateInput) return '—';
    return new Date(dateInput).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  }

  async function openTask(taskId) {
    closeAllDialogs();
    try {
      const task = await api(`/tasks/${taskId}`);
      setDialogState({ type: 'task', payload: task });
    } catch (error) {
      showToast('Error loading task details');
    }
  }

  

  useEffect(() => {
    if (activeView === 'dashboard') {
      Promise.all([api('/stats'), api('/projects')]).then(([statsData, projectsData]) => {
        setStats(statsData);
        setProjects(projectsData);
      }).catch(console.error);
    }
  }, [activeView]);


  useEffect(() => {
  if (activeView === 'dashboard') {
    Promise.all([api('/stats'), api('/projects')]).then(([statsData, projectsData]) => {
      setStats(statsData);
      setProjects(projectsData);
    }).catch(console.error);
  }
}, [activeView]);

// 👇 Theme effect
useEffect(() => {
  document.documentElement.classList.toggle(
    "dark",
    settings.theme === "dark"
  );
}, [settings.theme]);

// 👇 Default view effect - applies only when settings change
useEffect(() => {
  if (!settings.default_view) return;

  switch (settings.default_view) {
    case "board":
      setActiveView("project");
      setViewMode("board");
      break;

    case "list":
      setActiveView("mytasks");
      break;

    case "calendar":
      setActiveView("schedule");
      break;

    default:
      setActiveView("dashboard");
  }
}, [settings.default_view]);

  // Handle status change for Kanban with API persistence & state sync
  const handleStatusChange = async (taskId, newStatus) => {
    try {
      const validStatuses = ['To Do', 'In Progress', 'In Review', 'Completed'];
      if (!validStatuses.includes(newStatus)) {
        showToast('Invalid status: ' + newStatus);
        return;
      }

      await api(`/tasks/${taskId}`, {
        method: 'PUT',
        body: JSON.stringify({ status: newStatus }),
      });

      showToast(`Task moved to ${newStatus}! ✅`);
      if (selectedProjectId) {
        await loadTasks(selectedProjectId);
      }
      const [statsData, allProjects] = await Promise.all([
        api('/stats'),
        api('/projects'),
      ]);
      setStats(statsData);
      setProjects(allProjects);
      if (activeUserId) await loadNotifications(activeUserId);
      await loadActivities();
    } catch (error) {
      console.error('Error moving task:', error);
      showToast('Error moving task: ' + (error.message || 'Please try again.'));
      throw error; // Re-throw to allow component rollback
    }
  };

  async function openAssignTask() {
    closeAllDialogs();

    const defaultProjectId = selectedProjectId ?? projects[0]?.id ?? null;
    if (!defaultProjectId) {
      showToast('Create a project before assigning a task');
      return;
    }

    setSelectedProjectId(defaultProjectId);
    setDialogState({
      type: 'assign',
      payload: {
        projectId: defaultProjectId,
        title: '',
        description: '',
        priority: 'Medium',
        status: 'To Do',
        start_date: '',
        due_date: '',
        assignee_ids: []
      }
    });
  }

  async function handleAssignTask(event) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const projectId = Number(form.get('project_id'));
    const assigneeIds = [...new Set(
      form.getAll('assignees')
        .map((id) => Number(id))
        .filter((id) => Number.isInteger(id) && id > 0)
    )];

    if (!Number.isInteger(projectId) || projectId <= 0) {
      showToast('Please select a valid project before creating the task');
      return;
    }

    const taskData = {
      project_id: projectId,
      title: form.get('title')?.toString().trim(),
      description: form.get('description')?.toString().trim() || '',
      priority: form.get('priority'),
      status: form.get('status') || 'To Do',
      start_date: form.get('start_date') || null,
      due_date: form.get('due_date') || null,
      assignee_ids: assigneeIds
    };

    if (!taskData.title) {
      showToast('Please enter a task title');
      return;
    }

    if (taskData.assignee_ids.length === 0) {
      showToast('Please assign at least one person');
      return;
    }

    try {
      await api('/tasks', {
        method: 'POST',
        body: JSON.stringify(taskData)
      });
      showToast('Task assigned successfully! 🎉');
      closeAllDialogs();
      await loadTasks(selectedProjectId);
      if (activeUserId) await loadNotifications(activeUserId);
      await loadActivities();
      const statsData = await api('/stats');
      setStats(statsData);
    } catch (error) {
      showToast('Error creating task: ' + error.message);
    }
  }

  async function handleAddDepartment(event) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const name = form.get('name')?.toString().trim();

    if (!name) {
      showToast('Please enter a department name');
      return;
    }

    try {
      const newUser = {
        name: `${name} Lead`,
        initials: name.substring(0, 2).toUpperCase(),
        department: name,
        color: departmentColors[name] || '#6B7280',
        emoji: departmentEmojis[name] || '🏢'
      };

      await api('/users', {
        method: 'POST',
        body: JSON.stringify(newUser)
      });

      showToast(`Department "${name}" created successfully! 🎉`);
      closeAllDialogs();
      await loadAll();
    } catch (error) {
      showToast('Error creating department: ' + error.message);
    }
  }

  async function handleDeleteDepartment(deptName) {
    if (!window.confirm(`Are you sure you want to delete the "${deptName}" department? This will remove all users in this department.`)) {
      return;
    }

    try {
      const usersToDelete = users.filter(u => u.department === deptName);
      for (const userItem of usersToDelete) {
        await api(`/users/${userItem.id}`, { method: 'DELETE' });
      }
      showToast(`Department "${deptName}" deleted successfully`);
      await loadAll();
    } catch (error) {
      showToast('Error deleting department: ' + error.message);
    }
  }

  async function handleAddMember(event) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const name = form.get('name')?.toString().trim();
    const department = form.get('department')?.toString().trim();
    const initials = form.get('initials')?.toString().trim().toUpperCase() || (name ? name.substring(0, 2).toUpperCase() : 'U');
    const color = form.get('color') || '#6366F1';
    const emoji = form.get('emoji') || '👤';

    if (!name) {
      showToast('Please enter a member name');
      return;
    }

    if (!department) {
      showToast('Please select a department');
      return;
    }

    try {
      const newUser = {
        name: name,
        initials: initials,
        department: department,
        color: color,
        emoji: emoji
      };

      await api('/users', {
        method: 'POST',
        body: JSON.stringify(newUser)
      });

      showToast(`Member "${name}" added successfully! 🎉`);
      closeAllDialogs();
      await loadAll();
    } catch (error) {
      showToast('Error adding member: ' + error.message);
    }
  }

  async function handleDeleteMember(userId, userName) {
    if (!window.confirm(`Are you sure you want to remove "${userName}" from the team?`)) {
      return;
    }

    try {
      await api(`/users/${userId}`, { method: 'DELETE' });
      showToast(`Member "${userName}" removed successfully`);
      await loadAll();
    } catch (error) {
      showToast('Error removing member: ' + error.message);
    }
  }

  async function addComment(event) {
    event.preventDefault();
    if (!dialogState.payload || dialogState.type !== 'task') return;
    const form = new FormData(event.currentTarget);
    const author = form.get('author')?.toString().trim() || activeUser?.name || 'Anonymous';
    const content = form.get('content')?.toString().trim();
    if (!content) {
      showToast('Please enter a comment');
      return;
    }
    try {
      await api(`/tasks/${dialogState.payload.id}/comments`, {
        method: 'POST',
        body: JSON.stringify({ author_name: author, content, user_id: activeUserId }),
      });
      event.currentTarget.reset();
      showToast('Comment added! 💬');
      await openTask(dialogState.payload.id);
      if (activeUserId) await loadNotifications(activeUserId);
      await loadActivities();
    } catch (error) {
      console.error('Error adding comment:', error);
      showToast('Error adding comment');
    }
  }

  async function uploadAttachment(event) {
    event.preventDefault();
    if (!dialogState.payload || dialogState.type !== 'task') return;
    const fileInput = event.currentTarget.querySelector('input[name="file"]');
    const file = fileInput?.files?.[0];
    if (!file) {
      showToast('Please select a file');
      return;
    }
    const fd = new FormData();
    fd.append('file', file);
    try {
      await api(`/tasks/${dialogState.payload.id}/attachments`, { method: 'POST', body: fd });
      event.currentTarget.reset();
      showToast('Attachment uploaded! 📎');
      await openTask(dialogState.payload.id);
      await loadActivities();
    } catch (error) {
      console.error('Error uploading attachment:', error);
      showToast('Error uploading attachment');
    }
  }

  async function deleteAttachment(attachmentId) {
    if (!dialogState.payload || dialogState.type !== 'task') return;
    try {
      await api(`/attachments/${attachmentId}`, { method: 'DELETE' });
      showToast('Attachment removed');
      await openTask(dialogState.payload.id);
    } catch (error) {
      console.error('Error deleting attachment:', error);
      showToast('Error deleting attachment');
    }
  }

  async function markRead(id) {
    try {
      await api(`/notifications/${id}/read`, { method: 'PATCH' });
      if (activeUserId) await loadNotifications(activeUserId);
    } catch (error) {
      console.error('Error marking notification as read:', error);
    }
  }

  function currentBoardProject() {
    return projects.find((project) => project.id === selectedProjectId) || projects[0] || null;
  }

  const unreadNotificationCount = useMemo(() => {
    return notifications.filter(n => !n.is_read).length;
  }, [notifications]);

  return (
    <div className="app-shell">
      {/* Sidebar Shell */}
      <aside className="sidebar">
        <div className="brand-row">
          <div className="brand-icon">◫</div>
          <div className="brand-word">TaskFlow</div>
          <span className="brand-badge">Pro</span>
        </div>

        <div className="active-user-wrap">
          <label className="field-label">👤 Active Workspace User</label>
          <select value={activeUserId ?? ''} onChange={(e) => setActiveUserId(Number(e.target.value))}>
            {users.map((u) => <option key={u.id} value={u.id}>{u.emoji || '👤'} {u.name}</option>)}
          </select>
        </div>

        <nav className="nav-list">
          {NAV_ITEMS.map((item) => (
            <button
              key={item.id}
              className={`nav-item ${activeView === item.id ? 'active' : ''}`}
              onClick={() => setActiveView(item.id)}
            >
              <span className="nav-icon">{item.icon}</span>
              <span>{item.label}</span>
              {item.id === 'mytasks' && myTasks.length > 0 && (
                <span className="nav-badge">{myTasks.length}</span>
              )}
              {item.id === 'inbox' && unreadNotificationCount > 0 && (
                <span className="nav-badge">{unreadNotificationCount}</span>
              )}
            </button>
          ))}
        </nav>

        <button className="secondary-btn" onClick={onLogout} style={{ marginTop: 'auto', width: '100%', justifyContent: 'center' }}>
          🚪 Sign Out
        </button>

        
      </aside>

      {/* Main Workspace Area */}
      <main className="main-content">
        {/* Dashboard View */}
        {activeView === 'dashboard' && (
          <section className="view-section">
            <div className="topbar">
              <div>
                <h1>📊 Executive Dashboard</h1>
                <p>Real-time metrics and project breakdown</p>
              </div>
              <div className="topbar-actions">
                <button className="primary-btn assign-btn" onClick={openAssignTask}>
                  ➕ Assign Task
                </button>
                <button className="secondary-btn" onClick={() => setActiveView('departments')}>
                  🏢 Departments
                </button>
              </div>
            </div>

            <div className="stats-grid">
              <StatCard icon="📋" label="Total Tasks" value={stats.total} />
              <StatCard icon="⏳" label="To Do" value={stats.todo} accent="todo" />
              <StatCard icon="⚡" label="In Progress" value={stats.in_progress} accent="progress" />
              <StatCard icon="🔍" label="In Review" value={stats.in_review} accent="review" />
              <StatCard icon="✅" label="Completed" value={stats.completed} accent="done" />
            </div>

            <div className="department-grid">
              {projects.map((project) => {
                const completePct = project.task_count ? Math.round((project.completed_count / project.task_count) * 100) : 0;
                return (
                  <article key={project.id} className="department-card glass-card" style={{ cursor: 'pointer' }} onClick={() => { setSelectedProjectId(project.id); setActiveView('project'); }}>
                    <div className="department-header">
                      <div className="department-icon" style={{ background: 'linear-gradient(135deg, #6366f1, #4f46e5)' }}>
                        📋
                      </div>
                      <div className="department-info">
                        <h3>{project.name}</h3>
                        <span className="department-meta">{project.completed_count} of {project.task_count} tasks completed</span>
                      </div>
                    </div>

                    <p style={{ fontSize: '13px', color: 'var(--ink-secondary)', margin: '4px 0 10px 0' }}>
                      {project.description || 'No description provided.'}
                    </p>

                    <div className="department-progress">
                      <div className="progress-row">
                        <div className="progress-bar">
                          <div style={{ width: `${completePct}%` }} />
                        </div>
                        <span style={{ fontSize: '12px', fontWeight: 700 }}>{completePct}%</span>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          </section>
        )}

        {/* Project View (Board & Kanban) */}
        {activeView === 'project' && (
          <section className="view-section">
            <div className="topbar">
              <div>
                <h1>📋 {currentBoardProject()?.name || 'Project Board'}</h1>
                <p>{currentBoardProject()?.description || 'Manage tasks, assignees, and progress'}</p>
              </div>
              <div className="topbar-actions">
                <div className="view-toggle">
                  <button
                    className={`view-btn ${viewMode === 'board' ? 'active' : ''}`}
                    onClick={() => setViewMode('board')}
                    title="Board View"
                  >
                    📊 Grid Board
                  </button>
                  <button
                    className={`view-btn ${viewMode === 'kanban' ? 'active' : ''}`}
                    onClick={() => setViewMode('kanban')}
                    title="Kanban Drag & Drop View"
                  >
                    🎯 Drag & Drop Kanban
                  </button>
                </div>
                <button className="primary-btn assign-btn" onClick={openAssignTask}>
                  ➕ Assign Task
                </button>
              </div>
            </div>

            <div className="filter-row">
              <select value={filterAssignee} onChange={(e) => setFilterAssignee(e.target.value)}>
                <option value="">👤 All Assignees</option>
                {users.map((userItem) => <option key={userItem.id} value={userItem.id}>{userItem.emoji || '👤'} {userItem.name}</option>)}
              </select>
              <select value={filterPriority} onChange={(e) => setFilterPriority(e.target.value)}>
                <option value="">⚡ All Priorities</option>
                <option value="Urgent">🔴 Urgent</option>
                <option value="High">🟠 High</option>
                <option value="Medium">🔵 Medium</option>
                <option value="Low">🟢 Low</option>
              </select>
              <select value={filterDepartment} onChange={(e) => setFilterDepartment(e.target.value)}>
                <option value="">🏢 All Departments</option>
                {departmentList.map((dept) => <option key={dept} value={dept}>{dept}</option>)}
              </select>
              <input value={searchText} onChange={(e) => setSearchText(e.target.value)} placeholder="🔍 Search tasks..." />
            </div>

            {/* Board Grid View */}
            {viewMode === 'board' && (
              <div className="board-grid">
                {STATUS_ORDER.map((status) => (
                  <div key={status} className="board-column glass-card">
                    <div className="board-column-header">
                      <span>{status}</span>
                      <span className="count-pill">{boardTasks.filter((t) => t.status === status).length}</span>
                    </div>
                    {boardTasks.filter((t) => t.status === status).map((task) => (
                      <article key={task.id} className="task-card glass-card" onClick={() => openTask(task.id)}>
                        <div className="task-card-header">
                          <span className={`badge ${priorityClass[task.priority] || 'badge-medium'}`}>{task.priority}</span>
                          <span className="task-id-tag">#{task.id}</span>
                        </div>
                        <h4 className="task-card-title">{task.title}</h4>
                        <p className="task-card-desc">{task.description || 'No description'}</p>
                        <div className="task-meta">📅 {renderDate(task.start_date)} – {renderDate(task.due_date)}</div>
                        <div className="task-footer">
                          <div className="avatar-stack">
                            {(task.assignees || []).slice(0, 3).map((u) => (
                              <span key={u.id} className="avatar" style={{ background: u.color || '#6366F1' }}>{u.initials}</span>
                            ))}
                          </div>
                          <span className="progress-pill">{task.progress}%</span>
                        </div>
                      </article>
                    ))}
                  </div>
                ))}
              </div>
            )}

            {/* Kanban Drag & Drop View */}
            {viewMode === 'kanban' && (
              <KanbanBoard
                tasks={boardTasks}
                onTaskClick={openTask}
                renderDate={renderDate}
                priorityClass={priorityClass}
                onStatusChange={handleStatusChange}
              />
            )}
          </section>
        )}

        {/* Inbox / Notifications View */}
        {activeView === 'inbox' && (
          <section className="view-section">
            <div className="topbar">
              <div>
                <h1>📥 Workspace Inbox</h1>
                <p>Notifications and updates for {activeUser?.name || 'User'}</p>
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {notifications.map((item) => (
                <article key={item.id} className="task-card glass-card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <span className="badge badge-medium" style={{ marginBottom: '6px' }}>
                      {item.is_read ? '✓ Read' : '🔔 Unread'}
                    </span>
                    <p style={{ margin: '4px 0', fontWeight: 600, color: 'var(--ink-primary)' }}>{item.message}</p>
                    <small style={{ color: 'var(--ink-muted)' }}>{new Date(item.created_at).toLocaleString()}</small>
                  </div>
                  <button className="secondary-btn" onClick={() => { markRead(item.id); if (item.task_id) openTask(item.task_id); }}>
                    Mark as Read
                  </button>
                </article>
              ))}
              {notifications.length === 0 && (
                <div className="empty-kanban-column">
                  <div className="empty-column-icon">📥</div>
                  <span>No notifications right now.</span>
                </div>
              )}
            </div>
          </section>
        )}

        {/* My Tasks View */}
        {activeView === 'mytasks' && (
          <section className="view-section">
            <div className="topbar">
              <div>
                <h1>🗂️ My Assigned Tasks</h1>
                <p>Tasks assigned to {activeUser?.emoji || '👤'} {activeUser?.name || 'selected user'}</p>
              </div>
            </div>
            <div className="board-grid">
              {STATUS_ORDER.map((status) => (
                <div key={status} className="board-column glass-card">
                  <div className="board-column-header">
                    <span>{status}</span>
                    <span className="count-pill">{myTasks.filter((t) => t.status === status).length}</span>
                  </div>
                  {myTasks.filter((t) => t.status === status).map((task) => (
                    <article key={task.id} className="task-card glass-card" onClick={() => openTask(task.id)}>
                      <div className="task-card-header">
                        <span className={`badge ${priorityClass[task.priority] || 'badge-medium'}`}>{task.priority}</span>
                        <span className="task-id-tag">#{task.id}</span>
                      </div>
                      <h4 className="task-card-title">{task.title}</h4>
                      <p className="task-card-desc">{task.description || 'No description'}</p>
                      <div className="task-meta">📅 {renderDate(task.start_date)} – {renderDate(task.due_date)}</div>
                      <div className="task-footer">
                        <div className="avatar-stack">
                          {(task.assignees || []).slice(0, 3).map((u) => (
                            <span key={u.id} className="avatar" style={{ background: u.color || '#6366F1' }}>{u.initials}</span>
                          ))}
                        </div>
                        <span className="progress-pill">{task.progress}%</span>
                      </div>
                    </article>
                  ))}
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Team Members View */}
        {activeView === 'team' && (
          <section className="view-section">
            <div className="topbar">
              <div>
                <h1>👥 Team Members</h1>
                <p>Workspace organization by department</p>
              </div>
              <button className="primary-btn assign-btn" onClick={() => setDialogState({ type: 'addMember', payload: null })}>
                ➕ Add Member
              </button>
            </div>
            <div className="department-grid">
              {departmentList.map((dept) => (
                <div key={dept} className="department-card glass-card" style={{ borderTop: `4px solid ${departmentColors[dept] || '#6B7280'}` }}>
                  <div className="department-header">
                    <div className="department-icon" style={{ background: departmentColors[dept] || '#6B7280' }}>
                      {departmentEmojis[dept] || '🏢'}
                    </div>
                    <div className="department-info">
                      <h3>{dept}</h3>
                      <span className="department-meta">{users.filter((u) => u.department === dept).length} members</span>
                    </div>
                  </div>
                  <div className="department-members-list">
                    {users.filter((u) => u.department === dept).map((userItem) => (
                      <div key={userItem.id} className="member-row">
                        <div className="member-info">
                          <span className="avatar small" style={{ background: userItem.color || '#6366F1' }}>{userItem.initials}</span>
                          <span className="member-name">{userItem.name}</span>
                        </div>
                        <button className="icon-btn danger" onClick={() => handleDeleteMember(userItem.id, userItem.name)} title="Remove member">✕</button>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Departments View */}
        {activeView === 'departments' && (
          <section className="view-section">
            <div className="topbar">
              <div>
                <h1>🏢 Workspace Departments</h1>
                <p>Manage teams and overall progress</p>
              </div>
              <button className="primary-btn assign-btn" onClick={() => setDialogState({ type: 'addDepartment', payload: null })}>
                ➕ Add Department
              </button>
            </div>
            <div className="department-grid">
              {departmentList.map((dept) => {
                const deptUsers = users.filter(u => u.department === dept);
                const deptTasks = tasks.filter(t => t.assignees.some(a => deptUsers.some(u => u.id === a.id)));
                const completed = deptTasks.filter(t => t.status === 'Completed').length;
                const progress = deptTasks.length > 0 ? Math.round((completed / deptTasks.length) * 100) : 0;
                const color = departmentColors[dept] || '#6B7280';
                const emoji = departmentEmojis[dept] || '🏢';

                return (
                  <div key={dept} className="department-card glass-card" style={{ borderTop: `4px solid ${color}` }}>
                    <div className="department-header">
                      <div className="department-icon" style={{ background: color }}>{emoji}</div>
                      <div className="department-info">
                        <h3>{dept}</h3>
                        <span className="department-meta">{deptUsers.length} members • {deptTasks.length} tasks</span>
                      </div>
                      <div className="department-actions">
                        <button className="icon-btn" onClick={() => setDialogState({ type: 'addMember', payload: { department: dept } })} title="Add member">➕</button>
                        <button className="icon-btn danger" onClick={() => handleDeleteDepartment(dept)} title="Delete department">🗑️</button>
                      </div>
                    </div>
                    <div className="department-progress">
                      <div className="progress-row">
                        <div className="progress-bar"><div style={{ width: `${progress}%`, background: color }} /></div>
                        <span style={{ fontSize: '12px', fontWeight: 700 }}>{progress}%</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* Schedule View */}
        {activeView === 'schedule' && (
          <section className="view-section">
            <div className="topbar">
              <div>
                <h1>🗓️ Calendar & Schedule</h1>
                <p>Task timelines and due dates</p>
              </div>
            </div>
            <div className="filter-row" style={{ gridTemplateColumns: '1fr 1fr auto' }}>
              <input type="date" value={scheduleRange.start} onChange={(e) => {
                setScheduleRange((prev) => ({ ...prev, start: e.target.value }));
                scheduleLoadedRef.current = false;
              }} />
              <input type="date" value={scheduleRange.end} onChange={(e) => {
                setScheduleRange((prev) => ({ ...prev, end: e.target.value }));
                scheduleLoadedRef.current = false;
              }} />
              <button className="secondary-btn" onClick={() => {
                scheduleLoadedRef.current = false;
                loadSchedule();
              }}>🔄 Refresh Schedule</button>
            </div>
            <div className="department-grid">
              {scheduleTasks.map((task) => (
                <article key={task.id} className="task-card glass-card" onClick={() => openTask(task.id)}>
                  <div className="task-card-header">
                    <span className={`badge ${priorityClass[task.priority] || 'badge-medium'}`}>{task.priority}</span>
                    <span className="task-id-tag">Due: {renderDate(task.due_date)}</span>
                  </div>
                  <h4 className="task-card-title">{task.title}</h4>
                  <p className="task-card-desc">{task.description || 'No description'}</p>
                </article>
              ))}
            </div>
          </section>
        )}

        {/* Activity Log View */}
        {activeView === 'activities' && (
          <section className="view-section">
            <div className="topbar">
              <div>
                <h1>⚡ Workspace Activities</h1>
                <p>Audit log of system events</p>
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {activity.map((item) => (
                <article key={item.id} className="task-card glass-card">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <strong style={{ color: 'var(--accent-primary)' }}>{item.actor_name}</strong>
                    <small style={{ color: 'var(--ink-muted)' }}>{new Date(item.created_at).toLocaleString()}</small>
                  </div>
                  <p style={{ margin: '4px 0 0 0', color: 'var(--ink-secondary)' }}>{item.description}</p>
                </article>
              ))}
            </div>
          </section>
        )}

        {/* Workspace Settings View */}
        {activeView === 'settings' && (
          <section className="view-section">
            <div className="topbar">
              <div>
                <h1>⚙️ Workspace Settings</h1>
                <p>Preferences and system configuration</p>
              </div>
            </div>
            <form className="dialog-card glass-card" style={{ maxWidth: '600px', margin: '0' }} onSubmit={(e) => { e.preventDefault(); saveSettings({ workspace_name: settings.workspace_name, default_view: settings.default_view, theme: settings.theme }); }}>
              <div className="form-group">
                <label>Workspace Name</label>
                <input value={settings.workspace_name} onChange={(e) => setSettings({ ...settings, workspace_name: e.target.value })} />
              </div>
              <div className="form-group">
                <label>Default Landing View</label>
                <select value={settings.default_view} onChange={(e) => setSettings({ ...settings, default_view: e.target.value })}>
                  <option value="board">board</option>
                  <option value="list">list</option>
                  <option value="calendar">calendar</option>
                </select>
              </div>
              <div className="form-group">
                <label>Theme</label>
                <select 
                  value={settings.theme} 
                  onChange={(e) => {
                    const newTheme = e.target.value;
                    setSettings({
                      ...settings,
                      theme: newTheme
                    });
                    document.documentElement.classList.toggle(
                      "dark",
                      newTheme === "dark"
                    );
                  }}
                >
                  <option value="light">☀️ Light Theme</option>
                  <option value="dark">🌙 Dark Theme</option>
                </select>
              </div>
              <button className="primary-btn assign-btn" type="submit" style={{ width: 'fit-content' }}>
                💾 Save Preferences
              </button>
            </form>
          </section>
        )}
      </main>

      {/* Dialog Modals */}
      {dialogState.type === 'addDepartment' && (
        <div className="dialog-overlay">
          <div className="dialog-card">
            <div className="dialog-header">
              <h2>🏢 Add New Department</h2>
              <button className="icon-btn" onClick={closeAllDialogs}>✕</button>
            </div>
            <form onSubmit={handleAddDepartment} className="form-grid">
              <div className="form-group full">
                <label>Department Name *</label>
                <input name="name" placeholder="e.g. Engineering, Design" required />
              </div>
              <div className="dialog-actions full" style={{ gridColumn: 'span 2' }}>
                <button type="button" className="secondary-btn" onClick={closeAllDialogs}>Cancel</button>
                <button type="submit" className="primary-btn assign-btn">Create Department</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {dialogState.type === 'addMember' && (
        <div className="dialog-overlay">
          <div className="dialog-card">
            <div className="dialog-header">
              <h2>👤 Add Team Member</h2>
              <button className="icon-btn" onClick={closeAllDialogs}>✕</button>
            </div>
            <form onSubmit={handleAddMember} className="form-grid">
              <div className="form-group full">
                <label>Full Name *</label>
                <input name="name" placeholder="e.g. Alex Morgan" required />
              </div>
              <div className="form-group">
                <label>Initials</label>
                <input name="initials" placeholder="e.g. AM" maxLength={3} />
              </div>
              <div className="form-group">
                <label>Department *</label>
                <select name="department" required defaultValue={dialogState.payload?.department || ''}>
                  <option value="">Select department</option>
                  {departmentList.map((dept) => <option key={dept} value={dept}>{dept}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label>Avatar Color</label>
                <input name="color" type="color" defaultValue="#6366F1" />
              </div>
              <div className="form-group">
                <label>Emoji</label>
                <input name="emoji" defaultValue="👤" maxLength={2} />
              </div>
              <div className="dialog-actions" style={{ gridColumn: 'span 2' }}>
                <button type="button" className="secondary-btn" onClick={closeAllDialogs}>Cancel</button>
                <button type="submit" className="primary-btn assign-btn">Add Member</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {dialogState.type === 'assign' && dialogState.payload && (
        <div className="dialog-overlay">
          <div className="dialog-card">
            <div className="dialog-header">
              <h2>📋 Assign New Task</h2>
              <button className="icon-btn" onClick={closeAllDialogs}>✕</button>
            </div>
            <form onSubmit={handleAssignTask} className="form-grid">
              <input type="hidden" name="project_id" value={dialogState.payload.projectId} />
              <div className="form-group full">
                <label>Task Title *</label>
                <input name="title" placeholder="Task title" required defaultValue={dialogState.payload.title} />
              </div>
              <div className="form-group full">
                <label>Description</label>
                <textarea name="description" placeholder="Task details" rows={3} defaultValue={dialogState.payload.description} />
              </div>
              <div className="form-group">
                <label>Priority</label>
                <select name="priority" defaultValue={dialogState.payload.priority}>
                  <option value="Low">🟢 Low</option>
                  <option value="Medium">🔵 Medium</option>
                  <option value="High">🟠 High</option>
                  <option value="Urgent">🔴 Urgent</option>
                </select>
              </div>
              <div className="form-group">
                <label>Status</label>
                <select name="status" defaultValue={dialogState.payload.status}>
                  <option value="To Do">⏳ To Do</option>
                  <option value="In Progress">⚡ In Progress</option>
                  <option value="In Review">🔍 In Review</option>
                  <option value="Completed">✅ Completed</option>
                </select>
              </div>
              <div className="form-group">
                <label>Start Date</label>
                <input type="date" name="start_date" defaultValue={dialogState.payload.start_date} />
              </div>
              <div className="form-group">
                <label>Due Date</label>
                <input type="date" name="due_date" defaultValue={dialogState.payload.due_date} />
              </div>
              <div className="form-group full">
                <label>Assign To * (Hold Ctrl/Cmd for multiple)</label>
                <select name="assignees" multiple required style={{ minHeight: '90px' }}>
                  {users.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.emoji || '👤'} {u.name} ({u.department || 'General'})
                    </option>
                  ))}
                </select>
              </div>
              <div className="dialog-actions" style={{ gridColumn: 'span 2' }}>
                <button type="button" className="secondary-btn" onClick={closeAllDialogs}>Cancel</button>
                <button type="submit" className="primary-btn assign-btn">Create & Assign Task</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Task Details Dialog */}
      {dialogState.type === 'task' && dialogState.payload && (
        <div className="dialog-overlay">
          <div className="dialog-card" style={{ maxWidth: '680px' }}>
            <div className="dialog-header">
              <div>
                <h2>{dialogState.payload.title}</h2>
                <span className="task-id-tag">Task #{dialogState.payload.id}</span>
              </div>
              <button className="icon-btn" onClick={closeAllDialogs}>✕</button>
            </div>

            <div className="task-detail-meta">
              <div className="meta-block">
                <label>Priority</label>
                <span className={`badge ${priorityClass[dialogState.payload.priority] || 'badge-medium'}`}>{dialogState.payload.priority}</span>
              </div>
              <div className="meta-block">
                <label>Status</label>
                <span className="progress-pill">{dialogState.payload.status}</span>
              </div>
              <div className="meta-block">
                <label>Due Date</label>
                <span style={{ fontSize: '13px', fontWeight: 600 }}>{renderDate(dialogState.payload.due_date)}</span>
              </div>
              <div className="meta-block">
                <label>Assignees</label>
                <div className="avatar-stack">
                  {(dialogState.payload.assignees || []).map((u) => (
                    <span key={u.id} className="avatar small" style={{ background: u.color || '#6366F1' }} title={u.name}>{u.initials}</span>
                  ))}
                </div>
              </div>
            </div>

            <p style={{ color: 'var(--ink-secondary)', lineHeight: 1.5, margin: 0 }}>
              {dialogState.payload.description || 'No description provided.'}
            </p>

            {/* Comments Section */}
            <div className="comments-section">
              <h4 style={{ fontSize: '15px', fontWeight: 700 }}>💬 Activity & Comments</h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '200px', overflowY: 'auto' }}>
                {dialogState.payload.comments?.map((comment) => (
                  <div key={comment.id} className="comment-card">
                    <div className="comment-header">
                      <span className="comment-author">{comment.author_name}</span>
                      <span className="comment-date">{new Date(comment.created_at).toLocaleString()}</span>
                    </div>
                    <div className="comment-body">{comment.content}</div>
                  </div>
                ))}
                {(!dialogState.payload.comments || dialogState.payload.comments.length === 0) && (
                  <small style={{ color: 'var(--ink-muted)' }}>No comments yet. Start the conversation!</small>
                )}
              </div>

              <form onSubmit={addComment} style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
                <input name="content" placeholder="Write a comment..." required style={{ flex: 1, padding: '8px 12px', border: '1px solid var(--border-light)', borderRadius: 'var(--radius-md)' }} />
                <button type="submit" className="primary-btn" style={{ padding: '8px 16px' }}>Comment</button>
              </form>
            </div>

            {/* Attachments Section */}
            <div className="comments-section" style={{ borderTop: '1px solid #f1f5f9', paddingTop: '16px' }}>
              <h4 style={{ fontSize: '15px', fontWeight: 700 }}>📎 Attachments</h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {dialogState.payload.attachments?.map((attachment) => (
                  <div key={attachment.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#f8fafc', padding: '8px 12px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-light)' }}>
                    <a href={`/api/attachments/${attachment.id}/download`} target="_blank" rel="noreferrer" download style={{ color: 'var(--accent-primary)', fontWeight: 600, fontSize: '13px', textDecoration: 'none' }}>
                      📄 {attachment.filename}
                    </a>
                    <button type="button" className="icon-btn danger" onClick={() => deleteAttachment(attachment.id)}>✕</button>
                  </div>
                ))}
                {(!dialogState.payload.attachments || dialogState.payload.attachments.length === 0) && (
                  <small style={{ color: 'var(--ink-muted)' }}>No files attached to this task.</small>
                )}
              </div>

              <form onSubmit={uploadAttachment} style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
                <input name="file" type="file" required style={{ flex: 1 }} />
                <button type="submit" className="secondary-btn" style={{ padding: '6px 12px' }}>Upload File</button>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Floating Toast Notification */}
      {toast && <div className="toast-notification">✨ {toast}</div>}
    </div>
  );
}

function StatCard({ icon, label, value, accent = '' }) {
  return (
    <div className={`stat-card glass-card ${accent ? `accent-${accent}` : ''}`}>
      <span>{icon} {label}</span>
      <strong>{value}</strong>
    </div>
  );
}

export default App;