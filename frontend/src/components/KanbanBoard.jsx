import React, { useState, useEffect } from 'react';
import {
  DndContext,
  closestCenter,
  pointerWithin,
  rectIntersection,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragOverlay,
  defaultDropAnimationSideEffects,
  useDroppable,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

const STATUS_ORDER = ['To Do', 'In Progress', 'In Review', 'Completed'];

const STATUS_CONFIG = {
  'To Do': { icon: '📝', color: '#6366F1', border: '#818CF8' },
  'In Progress': { icon: '⚡', color: '#3B82F6', border: '#60A5FA' },
  'In Review': { icon: '🔍', color: '#F59E0B', border: '#FBBF24' },
  'Completed': { icon: '✅', color: '#10B981', border: '#34D399' },
};

// Sortable Task Card Component
function SortableTask({ task, onTaskClick, renderDate, priorityClass }) {
  const taskIdStr = String(task.id);
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: taskIdStr });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition: transition || 'transform 200ms cubic-bezier(0.2, 0, 0, 1), box-shadow 200ms ease',
    opacity: isDragging ? 0.3 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className={`task-card glass-card ${isDragging ? 'dragging' : ''}`}
      onClick={(e) => {
        // Prevent click when dragging
        if (!isDragging) {
          onTaskClick(task.id);
        }
      }}
    >
      <div className="task-card-header">
        <span className={`badge ${priorityClass[task.priority] || 'badge-medium'}`}>
          {task.priority}
        </span>
        <span className="task-id-tag">#{task.id}</span>
      </div>

      <h4 className="task-card-title">{task.title}</h4>
      {task.description && <p className="task-card-desc">{task.description}</p>}

      <div className="task-meta">
        <span className="meta-item">📅 {renderDate(task.start_date)} – {renderDate(task.due_date)}</span>
      </div>

      <div className="task-footer">
        <div className="avatar-stack">
          {(task.assignees || []).slice(0, 3).map((u) => (
            <span key={u.id} className="avatar" style={{ background: u.color || '#6366F1' }} title={u.name}>
              {u.initials}
            </span>
          ))}
          {(task.assignees || []).length > 3 && (
            <span className="avatar more">+{task.assignees.length - 3}</span>
          )}
        </div>
        <div className="task-progress-wrap">
          <div className="task-progress-mini-bar">
            <div style={{ width: `${task.progress || 0}%` }} />
          </div>
          <span className="progress-pill">{task.progress || 0}%</span>
        </div>
      </div>
    </div>
  );
}

// Kanban Column Component with useDroppable
function KanbanColumn({ status, tasks, onTaskClick, renderDate, priorityClass }) {
  const { setNodeRef, isOver } = useDroppable({
    id: status,
  });

  const config = STATUS_CONFIG[status] || { icon: '📋', color: '#6B7280', border: '#9CA3AF' };
  const taskIds = tasks.map((t) => String(t.id));

  return (
    <div
      ref={setNodeRef}
      className={`kanban-column glass-card ${isOver ? 'column-highlight' : ''}`}
      style={{
        borderTop: `3px solid ${config.color}`,
      }}
    >
      <div className="board-column-header">
        <div className="column-header-title">
          <span className="column-icon">{config.icon}</span>
          <span>{status}</span>
        </div>
        <span className="count-pill" style={{ background: `${config.color}20`, color: config.color }}>
          {tasks.length}
        </span>
      </div>

      <SortableContext id={status} items={taskIds} strategy={verticalListSortingStrategy}>
        <div className={`kanban-tasks-container ${isOver ? 'drop-zone-active' : ''}`}>
          {tasks.map((task) => (
            <SortableTask
              key={task.id}
              task={task}
              onTaskClick={onTaskClick}
              renderDate={renderDate}
              priorityClass={priorityClass}
            />
          ))}
          {tasks.length === 0 && (
            <div className={`empty-kanban-column ${isOver ? 'active-drop-target' : ''}`}>
              <div className="empty-column-icon">{isOver ? '✨' : '📌'}</div>
              <span>{isOver ? 'Drop to update status' : `No ${status.toLowerCase()} tasks`}</span>
            </div>
          )}
        </div>
      </SortableContext>
    </div>
  );
}

// Custom Collision Detection strategy
function customCollisionDetection(args) {
  // First check if pointer is within a column or task
  const pointerCollisions = pointerWithin(args);
  if (pointerCollisions.length > 0) {
    return pointerCollisions;
  }
  // Fallback to rect intersection
  const rectCollisions = rectIntersection(args);
  if (rectCollisions.length > 0) {
    return rectCollisions;
  }
  // Final fallback to closest center
  return closestCenter(args);
}

// Main Kanban Board Component
function KanbanBoard({ tasks, onTaskClick, renderDate, priorityClass, onStatusChange }) {
  const [items, setItems] = useState(tasks);
  const [activeId, setActiveId] = useState(null);

  // Synchronize local items when tasks prop changes
  useEffect(() => {
    setItems(tasks);
  }, [tasks]);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 5, // Smooth activation threshold
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragStart = (event) => {
    setActiveId(String(event.active.id));
  };

  const handleDragEnd = async (event) => {
    const { active, over } = event;
    setActiveId(null);

    if (!over) return;

    const activeTaskIdStr = String(active.id);
    const overIdStr = String(over.id);

    const activeTask = items.find((task) => String(task.id) === activeTaskIdStr);
    if (!activeTask) return;

    // Determine target column status
    let targetStatus = null;
    if (STATUS_ORDER.includes(overIdStr)) {
      targetStatus = overIdStr;
    } else {
      const overTask = items.find((task) => String(task.id) === overIdStr);
      if (overTask) {
        targetStatus = overTask.status;
      }
    }

    if (!targetStatus || !STATUS_ORDER.includes(targetStatus)) return;

    // Only update if status actually changed
    if (activeTask.status !== targetStatus) {
      const previousItems = [...items];

      // Optimistically update local state immediately
      setItems((prevItems) =>
        prevItems.map((task) =>
          String(task.id) === activeTaskIdStr
            ? { ...task, status: targetStatus }
            : task
        )
      );

      try {
        await onStatusChange(activeTask.id, targetStatus);
      } catch (error) {
        console.error('Error updating task status via API:', error);
        // Rollback state if API fails
        setItems(previousItems);
      }
    }
  };

  const handleDragCancel = () => {
    setActiveId(null);
  };

  // Group tasks by status
  const tasksByStatus = STATUS_ORDER.map((status) => ({
    status,
    tasks: items.filter((task) => task.status === status),
  }));

  const activeTask = items.find((task) => String(task.id) === activeId);

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={customCollisionDetection}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragCancel}
    >
      <div className="kanban-board">
        {tasksByStatus.map(({ status, tasks: columnTasks }) => (
          <KanbanColumn
            key={status}
            status={status}
            tasks={columnTasks}
            onTaskClick={onTaskClick}
            renderDate={renderDate}
            priorityClass={priorityClass}
          />
        ))}
      </div>

      {/* Drag Overlay - Shows card floating under cursor */}
      <DragOverlay
        dropAnimation={{
          sideEffects: defaultDropAnimationSideEffects({
            styles: {
              active: {
                opacity: '0.5',
              },
            },
          }),
        }}
      >
        {activeTask ? (
          <div className="task-card glass-card dragging-overlay">
            <div className="task-card-header">
              <span className={`badge ${priorityClass[activeTask.priority] || 'badge-medium'}`}>
                {activeTask.priority}
              </span>
              <span className="task-id-tag">#{activeTask.id}</span>
            </div>
            <h4 className="task-card-title">{activeTask.title}</h4>
            {activeTask.description && <p className="task-card-desc">{activeTask.description}</p>}
            <div className="task-meta">
              <span>📅 {renderDate(activeTask.start_date)} – {renderDate(activeTask.due_date)}</span>
            </div>
            <div className="task-footer">
              <div className="avatar-stack">
                {(activeTask.assignees || []).slice(0, 3).map((u) => (
                  <span key={u.id} className="avatar" style={{ background: u.color || '#6366F1' }}>
                    {u.initials}
                  </span>
                ))}
              </div>
              <span className="progress-pill">{activeTask.progress || 0}%</span>
            </div>
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}

export default KanbanBoard;