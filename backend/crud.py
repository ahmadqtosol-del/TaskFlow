from sqlalchemy.orm import Session
from typing import Optional
import models
import schemas


def log_activity(db: Session, actor_name: str, action: str, target_type: str, target_id: int, description: str):
    entry = models.ActivityLog(
        actor_name=actor_name,
        action=action,
        target_type=target_type,
        target_id=target_id,
        description=description,
    )
    db.add(entry)
    db.commit()
    return entry


def get_department_emoji(department: Optional[str]) -> str:
    mapping = {
        "Design": "🎨",
        "Engineering": "🛠️",
        "Marketing": "📣",
        "Sales": "💼",
        "Product": "🧩",
        "Operations": "⚙️",
    }
    return mapping.get(department, "🙂")


# ========== FIREBASE AUTHENTICATION FUNCTIONS ==========
def get_user_by_email(db: Session, email: str):
    """Get a user by their email address"""
    return db.query(models.User).filter(models.User.email == email).first()


def get_or_create_user_by_email(
    db: Session,
    email: str,
    name: Optional[str] = None
):
    """Get a user by email, or create one if they don't exist"""
    if not email:
        return None
    
    user = get_user_by_email(db, email)
    if not user:
        # Create a new user
        user_name = name or email.split('@')[0]
        initials = user_name[:2].upper()
        
        # Check if initials already exist, if so add a number
        existing_initials = db.query(models.User).filter(models.User.initials == initials).count()
        if existing_initials > 0:
            initials = f"{initials}{existing_initials + 1}"
        
        user_data = {
            'name': user_name,
            'initials': initials,
            'email': email,
            'department': 'Operations',
            'color': '#6366F1',
            'emoji': '👤'
        }
        user = models.User(**user_data)
        db.add(user)
        db.commit()
        db.refresh(user)
        log_activity(db, "System", "user_created", "user", user.id, f"User '{user.name}' was created via Firebase authentication.")
    return user


def update_user_email(db: Session, user_id: int, new_email: str):
    """Update a user's email address"""
    user = db.query(models.User).filter(models.User.id == user_id).first()
    if user:
        user.email = new_email
        db.commit()
        db.refresh(user)
        log_activity(db, "System", "user_email_updated", "user", user.id, f"User '{user.name}' updated their email.")
    return user


def get_user_by_firebase_uid(db: Session, firebase_uid: str):
    """Get a user by Firebase UID - if you store it"""
    # Note: If you want to store Firebase UID, add it to the User model
    # For now, we use email as the primary identifier
    return None
# ==============================================================


# ---------- USERS ----------
def get_users(db: Session):
    return db.query(models.User).all()


def create_user(db: Session, user: schemas.UserCreate):
    payload = user.model_dump()
    department = payload.get("department") or "Operations"
    payload["department"] = department
    payload["emoji"] = payload.get("emoji") or get_department_emoji(department)
    
    # Ensure email is handled
    if "email" not in payload or payload["email"] is None:
        # Generate a unique email if not provided (for backward compatibility)
        base_name = payload["name"].lower().replace(" ", ".")
        existing = db.query(models.User).filter(models.User.email == f"{base_name}@example.com").first()
        if existing:
            payload["email"] = f"{base_name}{len(db.query(models.User).all()) + 1}@example.com"
        else:
            payload["email"] = f"{base_name}@example.com"
    
    db_user = models.User(**payload)
    db.add(db_user)
    db.commit()
    db.refresh(db_user)
    log_activity(db, "System", "member_added", "user", db_user.id, f"Member '{db_user.name}' was added to the workspace.")
    return db_user


def delete_user(db: Session, user_id: int):
    user = db.query(models.User).filter(models.User.id == user_id).first()
    if user:
        log_activity(db, "System", "member_removed", "user", user.id, f"Member '{user.name}' was removed from the workspace.")
        db.delete(user)
        db.commit()
    return user


# ---------- PROJECTS ----------
def get_projects(db: Session):
    projects = db.query(models.Project).all()
    result = []
    for p in projects:
        p.task_count = len(p.tasks)
        p.completed_count = len([t for t in p.tasks if t.status == "Completed"])
        result.append(p)
    return result


def get_project(db: Session, project_id: int):
    p = db.query(models.Project).filter(models.Project.id == project_id).first()
    if p:
        p.task_count = len(p.tasks)
        p.completed_count = len([t for t in p.tasks if t.status == "Completed"])
    return p


def create_project(db: Session, project: schemas.ProjectCreate):
    db_project = models.Project(**project.model_dump())
    db.add(db_project)
    db.commit()
    db.refresh(db_project)
    log_activity(db, "System", "project_created", "project", db_project.id, f"Project '{db_project.name}' was created.")
    db_project.task_count = 0
    db_project.completed_count = 0
    return db_project


def update_project(db: Session, project_id: int, project: schemas.ProjectUpdate):
    db_project = db.query(models.Project).filter(models.Project.id == project_id).first()
    if not db_project:
        return None
    for field, value in project.model_dump(exclude_unset=True).items():
        setattr(db_project, field, value)
    db.commit()
    db.refresh(db_project)
    log_activity(db, "System", "project_updated", "project", db_project.id, f"Project '{db_project.name}' was updated.")
    db_project.task_count = len(db_project.tasks)
    db_project.completed_count = len([t for t in db_project.tasks if t.status == "Completed"])
    return db_project


def delete_project(db: Session, project_id: int):
    db_project = db.query(models.Project).filter(models.Project.id == project_id).first()
    if db_project:
        log_activity(db, "System", "project_deleted", "project", db_project.id, f"Project '{db_project.name}' was deleted.")
        db.delete(db_project)
        db.commit()
    return db_project


# ---------- TASKS ----------
def get_tasks(db: Session, project_id: int = None, status: str = None,
              priority: str = None, assignee_id: int = None):
    query = db.query(models.Task)
    if project_id is not None:
        query = query.filter(models.Task.project_id == project_id)
    if status is not None:
        query = query.filter(models.Task.status == status)
    if priority is not None:
        query = query.filter(models.Task.priority == priority)
    if assignee_id is not None:
        query = query.filter(models.Task.assignees.any(models.User.id == assignee_id))
    return query.order_by(models.Task.created_at.desc()).all()


def get_tasks_by_date(db: Session, start: str, end: str):
    return db.query(models.Task).filter(models.Task.due_date >= start, models.Task.due_date <= end).order_by(models.Task.due_date.asc()).all()


def get_task(db: Session, task_id: int):
    return db.query(models.Task).filter(models.Task.id == task_id).first()


def create_task(db: Session, task: schemas.TaskCreate):
    data = task.model_dump(exclude={"assignee_ids"})
    db_task = models.Task(**data)
    if task.assignee_ids:
        db_task.assignees = db.query(models.User).filter(
            models.User.id.in_(task.assignee_ids)
        ).all()
    db.add(db_task)
    db.commit()
    db.refresh(db_task)
    log_activity(db, "System", "task_created", "task", db_task.id, f"Task '{db_task.title}' was created.")
    for assignee in db_task.assignees:
        create_notification(db, assignee.id, f"Task '{db_task.title}' was assigned to you.", db_task.id)
    return db_task


# ========== UPDATED: Fixed update_task function ==========
def update_task(db: Session, task_id: int, task: schemas.TaskUpdate):
    db_task = db.query(models.Task).filter(models.Task.id == task_id).first()
    if not db_task:
        return None
    
    previous_status = db_task.status
    previous_assignee_ids = [u.id for u in db_task.assignees]
    
    # Get the data excluding assignee_ids
    data = task.model_dump(exclude_unset=True, exclude={"assignee_ids"})
    
    # Update fields
    for field, value in data.items():
        setattr(db_task, field, value)
    
    # Update assignees if provided
    if task.assignee_ids is not None:
        db_task.assignees = db.query(models.User).filter(
            models.User.id.in_(task.assignee_ids)
        ).all()
    
    db.commit()
    db.refresh(db_task)
    
    # Log status change
    if task.status is not None and previous_status != task.status:
        log_activity(db, "System", "task_status_changed", "task", db_task.id, 
                    f"Task '{db_task.title}' moved from '{previous_status}' to '{db_task.status}'.")
        
        # Notify assignees
        for assignee in db_task.assignees:
            create_notification(db, assignee.id, 
                              f"Task '{db_task.title}' moved from '{previous_status}' to '{db_task.status}'.", 
                              db_task.id)
    
    # Handle assignee changes
    if task.assignee_ids is not None:
        new_assignee_ids = set(task.assignee_ids)
        old_assignee_ids = set(previous_assignee_ids)
        for new_id in new_assignee_ids - old_assignee_ids:
            create_notification(db, new_id, f"Task '{db_task.title}' was assigned to you.", db_task.id)
    
    # Log general updates
    if task.title is not None or task.description is not None or task.priority is not None or \
       task.progress is not None or task.start_date is not None or task.due_date is not None:
        log_activity(db, "System", "task_updated", "task", db_task.id, 
                    f"Task '{db_task.title}' was updated.")
    
    return db_task
# ==============================================================


def delete_task(db: Session, task_id: int):
    db_task = db.query(models.Task).filter(models.Task.id == task_id).first()
    if db_task:
        log_activity(db, "System", "task_deleted", "task", db_task.id, f"Task '{db_task.title}' was deleted.")
        db.delete(db_task)
        db.commit()
    return db_task


# ---------- COMMENTS ----------
def add_comment(db: Session, task_id: int, comment: schemas.CommentCreate):
    db_comment = models.Comment(
        task_id=task_id,
        author_name=comment.author_name,
        content=comment.content,
        user_id=getattr(comment, 'user_id', None)
    )
    db.add(db_comment)
    db.commit()
    db.refresh(db_comment)
    
    task = db.query(models.Task).filter(models.Task.id == task_id).first()
    if task:
        recipients = task.assignees if task.assignees else db.query(models.User).all()
        for recipient in recipients:
            create_notification(db, recipient.id, f"{comment.author_name} commented on '{task.title}'.", task_id)
        log_activity(db, comment.author_name or "System", "comment_added", "task", task_id, f"Comment added to task '{task.title}'.")
    return db_comment


def delete_comment(db: Session, comment_id: int):
    c = db.query(models.Comment).filter(models.Comment.id == comment_id).first()
    if c:
        log_activity(db, "System", "comment_deleted", "task", c.task_id, f"Comment '{c.content[:40]}' was deleted.")
        db.delete(c)
        db.commit()
    return c


# ---------- ATTACHMENTS ----------
def add_attachment(db: Session, task_id: int, filename: str, stored_path: str):
    db_attachment = models.Attachment(
        task_id=task_id, 
        filename=filename, 
        stored_path=stored_path
    )
    db.add(db_attachment)
    db.commit()
    db.refresh(db_attachment)
    
    task = db.query(models.Task).filter(models.Task.id == task_id).first()
    if task:
        log_activity(db, "System", "attachment_added", "task", task_id, f"Attachment '{filename}' was added to task '{task.title}'.")
    return db_attachment


def delete_attachment(db: Session, attachment_id: int):
    a = db.query(models.Attachment).filter(models.Attachment.id == attachment_id).first()
    if a:
        task = db.query(models.Task).filter(models.Task.id == a.task_id).first()
        log_activity(db, "System", "attachment_deleted", "task", a.task_id, f"Attachment '{a.filename}' was removed from task '{task.title if task else a.task_id}'.")
        db.delete(a)
        db.commit()
    return a


# ---------- NOTIFICATIONS ----------
def get_notifications(db: Session, user_id: int):
    return db.query(models.Notification).filter(models.Notification.user_id == user_id).order_by(models.Notification.created_at.desc()).all()


def mark_notification_read(db: Session, notification_id: int):
    notification = db.query(models.Notification).filter(models.Notification.id == notification_id).first()
    if notification:
        notification.is_read = True
        db.commit()
        db.refresh(notification)
    return notification


def create_notification(db: Session, user_id: int, message: str, task_id: Optional[int] = None):
    notification = models.Notification(user_id=user_id, message=message, task_id=task_id)
    db.add(notification)
    db.commit()
    db.refresh(notification)
    return notification


def get_unread_notification_count(db: Session, user_id: int):
    return db.query(models.Notification).filter(models.Notification.user_id == user_id, models.Notification.is_read == False).count()


# ---------- DEPARTMENTS ----------
def get_departments(db: Session):
    return [row[0] for row in db.query(models.User.department).filter(models.User.department.isnot(None)).distinct().all()]


# ---------- ACTIVITY ----------
def get_activity(db: Session, limit: int = 50, project_id: Optional[int] = None, task_id: Optional[int] = None):
    query = db.query(models.ActivityLog)
    if project_id is not None:
        query = query.filter(models.ActivityLog.target_type == "project", models.ActivityLog.target_id == project_id)
    if task_id is not None:
        query = query.filter(models.ActivityLog.target_type == "task", models.ActivityLog.target_id == task_id)
    return query.order_by(models.ActivityLog.created_at.desc()).limit(limit).all()


# ---------- SETTINGS ----------
def get_settings(db: Session):
    setting = db.query(models.Setting).filter(models.Setting.id == 1).first()
    if not setting:
        setting = models.Setting(id=1, workspace_name="TaskFlow", default_view="board", theme="light")
        db.add(setting)
        db.commit()
        db.refresh(setting)
    return setting


def update_settings(db: Session, payload: schemas.SettingsUpdate):
    setting = get_settings(db)
    for field, value in payload.model_dump(exclude_unset=True).items():
        if value is not None:
            setattr(setting, field, value)
    db.commit()
    db.refresh(setting)
    return setting