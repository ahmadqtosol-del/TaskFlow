from sqlalchemy.orm import Session
from typing import Optional

import models
import schemas


# ==============================================================
# ACTIVITY
# ==============================================================

def log_activity(
    db: Session,
    actor_name: str,
    action: str,
    target_type: str,
    target_id: int,
    description: str
):
    entry = models.ActivityLog(
        actor_name=actor_name,
        action=action,
        target_type=target_type,
        target_id=target_id,
        description=description,
    )

    db.add(entry)
    db.commit()
    db.refresh(entry)

    return entry


# ==============================================================
# DEPARTMENT HELPERS
# ==============================================================

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


# ==============================================================
# FIREBASE AUTHENTICATION
# ==============================================================

def get_user_by_email(
    db: Session,
    email: str
):
    if not email:
        return None

    return db.query(models.User).filter(
        models.User.email == email
    ).first()


def get_or_create_user_by_email(
    db: Session,
    email: str,
    name: Optional[str] = None,
    workspace_id: Optional[int] = None
):
    """
    Get an existing user by email or create a new user.

    workspace_id is attached when supplied.
    """

    if not email:
        return None

    # ----------------------------------------------------------
    # Find existing user
    # ----------------------------------------------------------

    user = get_user_by_email(db, email)

    if user:

        # If the existing user does not have a workspace yet,
        # attach them to the supplied workspace.
        if (
            workspace_id is not None
            and user.workspace_id is None
        ):
            user.workspace_id = workspace_id

            db.commit()
            db.refresh(user)

        # IMPORTANT:
        # Always return the existing user.
        return user

    # ----------------------------------------------------------
    # Create new user
    # ----------------------------------------------------------

    user_name = name or email.split("@")[0]

    # Generate initials
    initials = user_name[:2].upper()

    existing_initials = db.query(
        models.User
    ).filter(
        models.User.initials == initials
    ).count()

    if existing_initials > 0:
        initials = f"{initials}{existing_initials + 1}"

    user_data = {
        "name": user_name,
        "initials": initials,
        "email": email,
        "department": "Operations",
        "color": "#6366F1",
        "emoji": "👤",
        "workspace_id": workspace_id,
    }

    user = models.User(**user_data)

    db.add(user)
    db.commit()
    db.refresh(user)

    log_activity(
        db,
        "System",
        "user_created",
        "user",
        user.id,
        f"User '{user.name}' was created via Firebase authentication."
    )

    # IMPORTANT:
    # This was missing in your current CRUD.
    return user


def get_user_by_firebase_uid(
    db: Session,
    firebase_uid: str
):
    """
    Firebase UID is currently not stored in the User model.
    Email is currently used as the Firebase identifier.
    """

    return None


# ==============================================================
# WORKSPACES
# ==============================================================

def get_workspaces(db: Session):
    return db.query(
        models.Workspace
    ).order_by(
        models.Workspace.created_at.asc()
    ).all()


def get_workspace(
    db: Session,
    workspace_id: int
):
    return db.query(
        models.Workspace
    ).filter(
        models.Workspace.id == workspace_id
    ).first()


def create_workspace(
    db: Session,
    workspace: schemas.WorkspaceCreate
):
    # ----------------------------------------------------------
    # Create workspace
    # ----------------------------------------------------------

    db_workspace = models.Workspace(
        name=workspace.name,
        description=workspace.description or ""
    )

    db.add(db_workspace)
    db.commit()
    db.refresh(db_workspace)

    # ----------------------------------------------------------
    # Create settings for this workspace
    # ----------------------------------------------------------

    setting = models.Setting(
        workspace_id=db_workspace.id,
        workspace_name=db_workspace.name,
        default_view="board",
        theme="light"
    )

    db.add(setting)

    # ----------------------------------------------------------
    # Every workspace gets a default project
    # ----------------------------------------------------------

    default_project = models.Project(
        workspace_id=db_workspace.id,
        name="Workspace",
        description="Default project for this workspace."
    )

    db.add(default_project)

    db.commit()
    db.refresh(db_workspace)

    return db_workspace


def update_workspace(
    db: Session,
    workspace_id: int,
    workspace: schemas.WorkspaceUpdate
):
    db_workspace = get_workspace(
        db,
        workspace_id
    )

    if not db_workspace:
        return None

    data = workspace.model_dump(
        exclude_unset=True
    )

    # Update workspace fields
    for field, value in data.items():

        if value is not None:
            setattr(
                db_workspace,
                field,
                value
            )

    # Keep settings workspace_name synchronized
    if (
        "name" in data
        and data["name"] is not None
    ):
        setting = db.query(
            models.Setting
        ).filter(
            models.Setting.workspace_id == workspace_id
        ).first()

        if setting:
            setting.workspace_name = data["name"]

    db.commit()
    db.refresh(db_workspace)

    return db_workspace


def delete_workspace(
    db: Session,
    workspace_id: int
):
    workspace = get_workspace(
        db,
        workspace_id
    )

    if not workspace:
        return None

    db.delete(workspace)
    db.commit()

    return workspace


# ==============================================================
# USERS
# ==============================================================

def get_users(
    db: Session,
    workspace_id: Optional[int] = None
):
    query = db.query(models.User)

    if workspace_id is not None:
        query = query.filter(
            models.User.workspace_id == workspace_id
        )

    return query.order_by(
        models.User.created_at.asc()
    ).all()


def create_user(
    db: Session,
    user: schemas.UserCreate
):
    payload = user.model_dump()

    # ----------------------------------------------------------
    # Department defaults
    # ----------------------------------------------------------

    department = (
        payload.get("department")
        or "Operations"
    )

    payload["department"] = department

    payload["emoji"] = (
        payload.get("emoji")
        or get_department_emoji(department)
    )

    # ----------------------------------------------------------
    # Email handling
    # ----------------------------------------------------------

    if (
        "email" not in payload
        or payload["email"] is None
    ):
        base_name = (
            payload["name"]
            .lower()
            .replace(" ", ".")
        )

        base_email = f"{base_name}@example.com"

        existing = db.query(
            models.User
        ).filter(
            models.User.email == base_email
        ).first()

        if existing:
            count = db.query(
                models.User
            ).filter(
                models.User.email.isnot(None)
            ).count()

            payload["email"] = (
                f"{base_name}{count + 1}@example.com"
            )
        else:
            payload["email"] = base_email

    # ----------------------------------------------------------
    # Prevent duplicate Firebase/email user
    # ----------------------------------------------------------

    existing_user = get_user_by_email(
        db,
        payload["email"]
    )

    if existing_user:
        return existing_user

    # ----------------------------------------------------------
    # Create user
    # ----------------------------------------------------------

    db_user = models.User(**payload)

    db.add(db_user)
    db.commit()
    db.refresh(db_user)

    log_activity(
        db,
        "System",
        "member_added",
        "user",
        db_user.id,
        f"Member '{db_user.name}' was added to the workspace."
    )

    return db_user


def delete_user(
    db: Session,
    user_id: int
):
    user = db.query(
        models.User
    ).filter(
        models.User.id == user_id
    ).first()

    if user:

        log_activity(
            db,
            "System",
            "member_removed",
            "user",
            user.id,
            f"Member '{user.name}' was removed from the workspace."
        )

        db.delete(user)
        db.commit()

    return user


# ==============================================================
# PROJECTS
# ==============================================================

def get_projects(
    db: Session,
    workspace_id: Optional[int] = None
):
    query = db.query(models.Project)

    if workspace_id is not None:
        query = query.filter(
            models.Project.workspace_id == workspace_id
        )

    projects = query.order_by(
        models.Project.created_at.asc()
    ).all()

    result = []

    for project in projects:

        project.task_count = len(
            project.tasks
        )

        project.completed_count = len([
            task
            for task in project.tasks
            if task.status == "Completed"
        ])

        result.append(project)

    return result


def get_project(
    db: Session,
    project_id: int
):
    project = db.query(
        models.Project
    ).filter(
        models.Project.id == project_id
    ).first()

    if project:

        project.task_count = len(
            project.tasks
        )

        project.completed_count = len([
            task
            for task in project.tasks
            if task.status == "Completed"
        ])

    return project


def create_project(
    db: Session,
    project: schemas.ProjectCreate
):
    # Verify workspace exists
    workspace = db.query(
        models.Workspace
    ).filter(
        models.Workspace.id == project.workspace_id
    ).first()

    if not workspace:
        return None

    db_project = models.Project(
        name=project.name,
        description=project.description or "",
        workspace_id=project.workspace_id
    )

    db.add(db_project)
    db.commit()
    db.refresh(db_project)

    log_activity(
        db,
        "System",
        "project_created",
        "project",
        db_project.id,
        f"Project '{db_project.name}' was created."
    )

    db_project.task_count = 0
    db_project.completed_count = 0

    return db_project


def update_project(
    db: Session,
    project_id: int,
    project: schemas.ProjectUpdate
):
    db_project = db.query(
        models.Project
    ).filter(
        models.Project.id == project_id
    ).first()

    if not db_project:
        return None

    data = project.model_dump(
        exclude_unset=True
    )

    # If workspace_id is being changed,
    # make sure the new workspace exists.
    if (
        "workspace_id" in data
        and data["workspace_id"] is not None
    ):
        workspace = get_workspace(
            db,
            data["workspace_id"]
        )

        if not workspace:
            return None

    for field, value in data.items():

        if value is not None:
            setattr(
                db_project,
                field,
                value
            )

    db.commit()
    db.refresh(db_project)

    log_activity(
        db,
        "System",
        "project_updated",
        "project",
        db_project.id,
        f"Project '{db_project.name}' was updated."
    )

    db_project.task_count = len(
        db_project.tasks
    )

    db_project.completed_count = len([
        task
        for task in db_project.tasks
        if task.status == "Completed"
    ])

    return db_project


def delete_project(
    db: Session,
    project_id: int
):
    db_project = db.query(
        models.Project
    ).filter(
        models.Project.id == project_id
    ).first()

    if db_project:

        log_activity(
            db,
            "System",
            "project_deleted",
            "project",
            db_project.id,
            f"Project '{db_project.name}' was deleted."
        )

        db.delete(db_project)
        db.commit()

    return db_project


# ==============================================================
# TASKS
# ==============================================================

def get_tasks(
    db: Session,
    project_id: Optional[int] = None,
    status: Optional[str] = None,
    priority: Optional[str] = None,
    assignee_id: Optional[int] = None
):
    query = db.query(models.Task)

    if project_id is not None:
        query = query.filter(
            models.Task.project_id == project_id
        )

    if status is not None:
        query = query.filter(
            models.Task.status == status
        )

    if priority is not None:
        query = query.filter(
            models.Task.priority == priority
        )

    if assignee_id is not None:
        query = query.filter(
            models.Task.assignees.any(
                models.User.id == assignee_id
            )
        )

    return query.order_by(
        models.Task.created_at.desc()
    ).all()


def get_tasks_by_date(
    db: Session,
    start: str,
    end: str
):
    return db.query(
        models.Task
    ).filter(
        models.Task.due_date >= start,
        models.Task.due_date <= end
    ).order_by(
        models.Task.due_date.asc()
    ).all()


def get_task(
    db: Session,
    task_id: int
):
    return db.query(
        models.Task
    ).filter(
        models.Task.id == task_id
    ).first()


def create_task(
    db: Session,
    task: schemas.TaskCreate
):
    data = task.model_dump(
        exclude={"assignee_ids"}
    )

    # Make sure project exists
    project = db.query(
        models.Project
    ).filter(
        models.Project.id == data.get("project_id")
    ).first()

    if not project:
        return None

    db_task = models.Task(**data)

    if task.assignee_ids:

        db_task.assignees = db.query(
            models.User
        ).filter(
            models.User.id.in_(
                task.assignee_ids
            )
        ).all()

    db.add(db_task)
    db.commit()
    db.refresh(db_task)

    log_activity(
        db,
        "System",
        "task_created",
        "task",
        db_task.id,
        f"Task '{db_task.title}' was created."
    )

    for assignee in db_task.assignees:

        create_notification(
            db,
            assignee.id,
            f"Task '{db_task.title}' was assigned to you.",
            db_task.id
        )

    return db_task


def update_task(
    db: Session,
    task_id: int,
    task: schemas.TaskUpdate
):
    db_task = db.query(
        models.Task
    ).filter(
        models.Task.id == task_id
    ).first()

    if not db_task:
        return None

    previous_status = db_task.status

    previous_assignee_ids = [
        user.id
        for user in db_task.assignees
    ]

    data = task.model_dump(
        exclude_unset=True,
        exclude={"assignee_ids"}
    )

    # Update task fields
    for field, value in data.items():

        if value is not None:
            setattr(
                db_task,
                field,
                value
            )

    # Update assignees
    if task.assignee_ids is not None:

        db_task.assignees = db.query(
            models.User
        ).filter(
            models.User.id.in_(
                task.assignee_ids
            )
        ).all()

    db.commit()
    db.refresh(db_task)

    # ----------------------------------------------------------
    # Status change
    # ----------------------------------------------------------

    if (
        task.status is not None
        and previous_status != task.status
    ):

        log_activity(
            db,
            "System",
            "task_status_changed",
            "task",
            db_task.id,
            f"Task '{db_task.title}' moved from "
            f"'{previous_status}' to "
            f"'{db_task.status}'."
        )

        for assignee in db_task.assignees:

            create_notification(
                db,
                assignee.id,
                f"Task '{db_task.title}' moved from "
                f"'{previous_status}' to "
                f"'{db_task.status}'.",
                db_task.id
            )

    # ----------------------------------------------------------
    # Assignee changes
    # ----------------------------------------------------------

    if task.assignee_ids is not None:

        new_assignee_ids = set(
            task.assignee_ids
        )

        old_assignee_ids = set(
            previous_assignee_ids
        )

        for new_id in (
            new_assignee_ids - old_assignee_ids
        ):

            create_notification(
                db,
                new_id,
                f"Task '{db_task.title}' was assigned to you.",
                db_task.id
            )

    # ----------------------------------------------------------
    # General update logging
    # ----------------------------------------------------------

    if any([
        task.title is not None,
        task.description is not None,
        task.priority is not None,
        task.progress is not None,
        task.start_date is not None,
        task.due_date is not None,
    ]):

        log_activity(
            db,
            "System",
            "task_updated",
            "task",
            db_task.id,
            f"Task '{db_task.title}' was updated."
        )

    return db_task


def delete_task(
    db: Session,
    task_id: int
):
    db_task = db.query(
        models.Task
    ).filter(
        models.Task.id == task_id
    ).first()

    if db_task:

        log_activity(
            db,
            "System",
            "task_deleted",
            "task",
            db_task.id,
            f"Task '{db_task.title}' was deleted."
        )

        db.delete(db_task)
        db.commit()

    return db_task


# ==============================================================
# COMMENTS
# ==============================================================

def add_comment(
    db: Session,
    task_id: int,
    comment: schemas.CommentCreate
):
    db_comment = models.Comment(
        task_id=task_id,
        author_name=comment.author_name,
        content=comment.content,
        user_id=getattr(
            comment,
            "user_id",
            None
        )
    )

    db.add(db_comment)
    db.commit()
    db.refresh(db_comment)

    task = db.query(
        models.Task
    ).filter(
        models.Task.id == task_id
    ).first()

    if task:

        recipients = (
            task.assignees
            if task.assignees
            else db.query(models.User).all()
        )

        for recipient in recipients:

            create_notification(
                db,
                recipient.id,
                f"{comment.author_name} commented on '{task.title}'.",
                task_id
            )

        log_activity(
            db,
            comment.author_name or "System",
            "comment_added",
            "task",
            task_id,
            f"Comment added to task '{task.title}'."
        )

    return db_comment


def delete_comment(
    db: Session,
    comment_id: int
):
    comment = db.query(
        models.Comment
    ).filter(
        models.Comment.id == comment_id
    ).first()

    if comment:

        log_activity(
            db,
            "System",
            "comment_deleted",
            "task",
            comment.task_id,
            f"Comment '{comment.content[:40]}' was deleted."
        )

        db.delete(comment)
        db.commit()

    return comment


# ==============================================================
# ATTACHMENTS
# ==============================================================

def add_attachment(
    db: Session,
    task_id: int,
    filename: str,
    stored_path: str
):
    db_attachment = models.Attachment(
        task_id=task_id,
        filename=filename,
        stored_path=stored_path
    )

    db.add(db_attachment)
    db.commit()
    db.refresh(db_attachment)

    task = db.query(
        models.Task
    ).filter(
        models.Task.id == task_id
    ).first()

    if task:

        log_activity(
            db,
            "System",
            "attachment_added",
            "task",
            task_id,
            f"Attachment '{filename}' was added to task '{task.title}'."
        )

    return db_attachment


def delete_attachment(
    db: Session,
    attachment_id: int
):
    attachment = db.query(
        models.Attachment
    ).filter(
        models.Attachment.id == attachment_id
    ).first()

    if attachment:

        task = db.query(
            models.Task
        ).filter(
            models.Task.id == attachment.task_id
        ).first()

        log_activity(
            db,
            "System",
            "attachment_deleted",
            "task",
            attachment.task_id,
            f"Attachment '{attachment.filename}' was removed "
            f"from task '{task.title if task else attachment.task_id}'."
        )

        db.delete(attachment)
        db.commit()

    return attachment


# ==============================================================
# NOTIFICATIONS
# ==============================================================

def get_notifications(
    db: Session,
    user_id: int
):
    return db.query(
        models.Notification
    ).filter(
        models.Notification.user_id == user_id
    ).order_by(
        models.Notification.created_at.desc()
    ).all()


def mark_notification_read(
    db: Session,
    notification_id: int
):
    notification = db.query(
        models.Notification
    ).filter(
        models.Notification.id == notification_id
    ).first()

    if notification:

        notification.is_read = True

        db.commit()
        db.refresh(notification)

    return notification


def create_notification(
    db: Session,
    user_id: int,
    message: str,
    task_id: Optional[int] = None
):
    notification = models.Notification(
        user_id=user_id,
        message=message,
        task_id=task_id
    )

    db.add(notification)
    db.commit()
    db.refresh(notification)

    return notification


def get_unread_notification_count(
    db: Session,
    user_id: int
):
    return db.query(
        models.Notification
    ).filter(
        models.Notification.user_id == user_id,
        models.Notification.is_read == False
    ).count()


# ==============================================================
# DEPARTMENTS
# ==============================================================

def get_departments(
    db: Session,
    workspace_id: Optional[int] = None
):
    query = db.query(
        models.User.department
    ).filter(
        models.User.department.isnot(None)
    )

    if workspace_id is not None:
        query = query.filter(
            models.User.workspace_id == workspace_id
        )

    return [
        row[0]
        for row in query.distinct().all()
    ]


# ==============================================================
# ACTIVITY
# ==============================================================

def get_activity(
    db: Session,
    limit: int = 50,
    project_id: Optional[int] = None,
    task_id: Optional[int] = None
):
    query = db.query(
        models.ActivityLog
    )

    if project_id is not None:

        query = query.filter(
            models.ActivityLog.target_type == "project",
            models.ActivityLog.target_id == project_id
        )

    if task_id is not None:

        query = query.filter(
            models.ActivityLog.target_type == "task",
            models.ActivityLog.target_id == task_id
        )

    return query.order_by(
        models.ActivityLog.created_at.desc()
    ).limit(limit).all()


# ==============================================================
# SETTINGS
# ==============================================================

def get_settings(
    db: Session,
    workspace_id: Optional[int] = None
):
    """
    Get settings for a workspace.

    workspace_id is optional for backwards compatibility with
    the current main.py.

    If no workspace_id is supplied, the first workspace is used.
    """

    # ----------------------------------------------------------
    # If no workspace was supplied, use first workspace
    # ----------------------------------------------------------

    if workspace_id is None:

        workspace = db.query(
            models.Workspace
        ).order_by(
            models.Workspace.id.asc()
        ).first()

        if not workspace:
            return None

        workspace_id = workspace.id

    # ----------------------------------------------------------
    # Find settings
    # ----------------------------------------------------------

    setting = db.query(
        models.Setting
    ).filter(
        models.Setting.workspace_id == workspace_id
    ).first()

    # ----------------------------------------------------------
    # Create settings if missing
    # ----------------------------------------------------------

    if not setting:

        workspace = get_workspace(
            db,
            workspace_id
        )

        if not workspace:
            return None

        setting = models.Setting(
            workspace_id=workspace_id,
            workspace_name=workspace.name,
            default_view="board",
            theme="light"
        )

        db.add(setting)
        db.commit()
        db.refresh(setting)

    return setting


def update_settings(
    db: Session,
    payload: schemas.SettingsUpdate
):
    if payload.workspace_id is None:
        return None

    setting = get_settings(
        db,
        payload.workspace_id
    )

    if not setting:
        return None

    data = payload.model_dump(
        exclude_unset=True,
        exclude={"workspace_id"}
    )

    for field, value in data.items():

        if value is not None:
            setattr(
                setting,
                field,
                value
            )

    db.commit()
    db.refresh(setting)

    return setting