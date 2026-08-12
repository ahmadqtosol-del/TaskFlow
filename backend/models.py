from sqlalchemy import (
    Column,
    Integer,
    String,
    Text,
    DateTime,
    ForeignKey,
    Table,
    Boolean,
)
from sqlalchemy.orm import relationship
from datetime import datetime
from database import Base


# ============================================================
# TASK ASSIGNEES - MANY TO MANY
# ============================================================

task_assignees = Table(
    "task_assignees",
    Base.metadata,
    Column(
        "task_id",
        Integer,
        ForeignKey("tasks.id", ondelete="CASCADE"),
        primary_key=True,
    ),
    Column(
        "user_id",
        Integer,
        ForeignKey("users.id", ondelete="CASCADE"),
        primary_key=True,
    ),
)


# ============================================================
# WORKSPACE
# ============================================================

class Workspace(Base):
    __tablename__ = "workspaces"

    id = Column(Integer, primary_key=True, index=True)

    name = Column(
        String,
        nullable=False,
    )

    description = Column(
        Text,
        default="",
    )

    created_at = Column(
        DateTime,
        default=datetime.utcnow,
    )

    # One workspace -> many projects
    projects = relationship(
        "Project",
        back_populates="workspace",
        cascade="all, delete-orphan",
    )

    # One workspace -> many users
    users = relationship(
        "User",
        back_populates="workspace",
        cascade="all, delete-orphan",
    )

    # One workspace -> one settings record
    settings = relationship(
        "Setting",
        back_populates="workspace",
        uselist=False,
        cascade="all, delete-orphan",
    )


# ============================================================
# USER
# ============================================================

class User(Base):
    __tablename__ = "users"

    id = Column(
        Integer,
        primary_key=True,
        index=True,
    )

    workspace_id = Column(
        Integer,
        ForeignKey(
            "workspaces.id",
            ondelete="CASCADE",
        ),
        nullable=True,
    )

    name = Column(
        String,
        nullable=False,
    )

    initials = Column(
        String,
        nullable=False,
    )

    color = Column(
        String,
        default="#6366F1",
    )

    department = Column(
        String,
        nullable=True,
    )

    emoji = Column(
        String,
        nullable=True,
    )

    email = Column(
        String,
        nullable=True,
        unique=True,
    )

    created_at = Column(
        DateTime,
        default=datetime.utcnow,
    )

    # Workspace relationship
    workspace = relationship(
        "Workspace",
        back_populates="users",
    )

    # Tasks assigned to this user
    tasks = relationship(
        "Task",
        secondary=task_assignees,
        back_populates="assignees",
    )

    # Comments written by this user
    comments = relationship(
        "Comment",
        back_populates="author",
    )

    # Notifications belonging to this user
    notifications = relationship(
        "Notification",
        back_populates="user",
        cascade="all, delete-orphan",
    )


# ============================================================
# PROJECT
# ============================================================

class Project(Base):
    __tablename__ = "projects"

    id = Column(
        Integer,
        primary_key=True,
        index=True,
    )

    workspace_id = Column(
        Integer,
        ForeignKey(
            "workspaces.id",
            ondelete="CASCADE",
        ),
        nullable=True,
    )

    name = Column(
        String,
        nullable=False,
    )

    description = Column(
        Text,
        default="",
    )

    created_at = Column(
        DateTime,
        default=datetime.utcnow,
    )

    # Workspace relationship
    workspace = relationship(
        "Workspace",
        back_populates="projects",
    )

    # Project -> Tasks
    tasks = relationship(
        "Task",
        back_populates="project",
        cascade="all, delete-orphan",
    )


# ============================================================
# TASK
# ============================================================

class Task(Base):
    __tablename__ = "tasks"

    id = Column(
        Integer,
        primary_key=True,
        index=True,
    )

    project_id = Column(
        Integer,
        ForeignKey(
            "projects.id",
            ondelete="CASCADE",
        ),
        nullable=False,
    )

    title = Column(
        String,
        nullable=False,
    )

    description = Column(
        Text,
        default="",
    )

    status = Column(
        String,
        default="To Do",
    )

    priority = Column(
        String,
        default="Medium",
    )

    progress = Column(
        Integer,
        default=0,
    )

    start_date = Column(
        String,
        nullable=True,
    )

    due_date = Column(
        String,
        nullable=True,
    )

    created_at = Column(
        DateTime,
        default=datetime.utcnow,
    )

    # Project relationship
    project = relationship(
        "Project",
        back_populates="tasks",
    )

    # Many-to-many assignees
    assignees = relationship(
        "User",
        secondary=task_assignees,
        back_populates="tasks",
    )

    # Task comments
    comments = relationship(
        "Comment",
        back_populates="task",
        cascade="all, delete-orphan",
    )

    # Task attachments
    attachments = relationship(
        "Attachment",
        back_populates="task",
        cascade="all, delete-orphan",
    )


# ============================================================
# COMMENT
# ============================================================

class Comment(Base):
    __tablename__ = "comments"

    id = Column(
        Integer,
        primary_key=True,
        index=True,
    )

    task_id = Column(
        Integer,
        ForeignKey(
            "tasks.id",
            ondelete="CASCADE",
        ),
        nullable=False,
    )

    user_id = Column(
        Integer,
        ForeignKey(
            "users.id",
        ),
        nullable=True,
    )

    author_name = Column(
        String,
        nullable=False,
    )

    content = Column(
        Text,
        nullable=False,
    )

    created_at = Column(
        DateTime,
        default=datetime.utcnow,
    )

    task = relationship(
        "Task",
        back_populates="comments",
    )

    author = relationship(
        "User",
        back_populates="comments",
    )


# ============================================================
# ATTACHMENT
# ============================================================

class Attachment(Base):
    __tablename__ = "attachments"

    id = Column(
        Integer,
        primary_key=True,
        index=True,
    )

    task_id = Column(
        Integer,
        ForeignKey(
            "tasks.id",
            ondelete="CASCADE",
        ),
        nullable=False,
    )

    filename = Column(
        String,
        nullable=False,
    )

    stored_path = Column(
        String,
        nullable=False,
    )

    uploaded_at = Column(
        DateTime,
        default=datetime.utcnow,
    )

    task = relationship(
        "Task",
        back_populates="attachments",
    )


# ============================================================
# NOTIFICATION
# ============================================================

class Notification(Base):
    __tablename__ = "notifications"

    id = Column(
        Integer,
        primary_key=True,
        index=True,
    )

    user_id = Column(
        Integer,
        ForeignKey(
            "users.id",
            ondelete="CASCADE",
        ),
        nullable=False,
    )

    message = Column(
        Text,
        nullable=False,
    )

    is_read = Column(
        Boolean,
        default=False,
        nullable=False,
    )

    task_id = Column(
        Integer,
        ForeignKey(
            "tasks.id",
            ondelete="SET NULL",
        ),
        nullable=True,
    )

    created_at = Column(
        DateTime,
        default=datetime.utcnow,
    )

    user = relationship(
        "User",
        back_populates="notifications",
    )

    task = relationship(
        "Task",
        foreign_keys=[task_id],
    )


# ============================================================
# ACTIVITY LOG
# ============================================================

class ActivityLog(Base):
    __tablename__ = "activity_log"

    id = Column(
        Integer,
        primary_key=True,
        index=True,
    )

    actor_name = Column(
        String,
        nullable=False,
    )

    action = Column(
        String,
        nullable=False,
    )

    target_type = Column(
        String,
        nullable=False,
    )

    target_id = Column(
        Integer,
        nullable=False,
    )

    description = Column(
        Text,
        nullable=False,
    )

    created_at = Column(
        DateTime,
        default=datetime.utcnow,
    )


# ============================================================
# SETTINGS
# ============================================================

class Setting(Base):
    __tablename__ = "settings"

    id = Column(
        Integer,
        primary_key=True,
        index=True,
    )

    workspace_id = Column(
        Integer,
        ForeignKey(
            "workspaces.id",
            ondelete="CASCADE",
        ),
        nullable=False,
        unique=True,
    )

    workspace_name = Column(
        String,
        nullable=False,
        default="TaskFlow",
    )

    default_view = Column(
        String,
        nullable=False,
        default="board",
    )

    theme = Column(
        String,
        nullable=False,
        default="light",
    )

    workspace = relationship(
        "Workspace",
        back_populates="settings",
    )