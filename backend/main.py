import os
import shutil
import uuid
import sqlite3
from datetime import datetime
from fastapi import FastAPI, Depends, HTTPException, UploadFile, File, Query, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from sqlalchemy.orm import Session
from typing import List, Optional
from pydantic import BaseModel

import models
import schemas
import crud
from database import engine, get_db, Base

from email_service import send_welcome_email, send_task_assignment_email

DB_PATH = os.path.join(os.path.dirname(__file__), "tasks.db")


def ensure_schema_additions():
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()

    def table_exists(name: str) -> bool:
        r = cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name=?", (name,)).fetchone()
        return r is not None

    def has_column(table: str, column: str) -> bool:
        r = cursor.execute(f"PRAGMA table_info({table})").fetchall()
        return any(row[1] == column for row in r)

    if not table_exists("notifications"):
        cursor.execute(
            """
            CREATE TABLE IF NOT EXISTS notifications (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                message TEXT NOT NULL,
                is_read BOOLEAN NOT NULL DEFAULT 0,
                task_id INTEGER,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
                FOREIGN KEY(task_id) REFERENCES tasks(id) ON DELETE SET NULL
            )
            """
        )
    if not table_exists("activity_log"):
        cursor.execute(
            """
            CREATE TABLE IF NOT EXISTS activity_log (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                actor_name TEXT NOT NULL,
                action TEXT NOT NULL,
                target_type TEXT NOT NULL,
                target_id INTEGER NOT NULL,
                description TEXT NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
            """
        )
    if not table_exists("settings"):
        cursor.execute(
            """
            CREATE TABLE IF NOT EXISTS settings (
                id INTEGER PRIMARY KEY CHECK (id = 1),
                workspace_name TEXT NOT NULL DEFAULT 'TaskFlow',
                default_view TEXT NOT NULL DEFAULT 'board',
                theme TEXT NOT NULL DEFAULT 'light'
            )
            """
        )

    if not has_column("users", "department"):
        cursor.execute("ALTER TABLE users ADD COLUMN department TEXT")
    if not has_column("users", "emoji"):
        cursor.execute("ALTER TABLE users ADD COLUMN emoji TEXT")
    # ========== ADDED: Add email column if it doesn't exist ==========
    if not has_column("users", "email"):
        cursor.execute("ALTER TABLE users ADD COLUMN email TEXT UNIQUE")
    # ==================================================================

    # Backfill existing rows with safe defaults so the new department/team views
    # continue to work even when the database already existed before the schema
    # addition.
    cursor.execute("UPDATE users SET department = COALESCE(department, 'Operations') WHERE department IS NULL")
    cursor.execute("UPDATE users SET emoji = COALESCE(emoji, '🙂') WHERE emoji IS NULL")

    conn.commit()
    conn.close()


def ensure_default_project():
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()

    project_count = cursor.execute("SELECT COUNT(*) FROM projects").fetchone()[0]
    if project_count == 0:
        cursor.execute(
            """
            INSERT INTO projects (name, description, created_at)
            VALUES (?, ?, ?)
            """,
            (
                "Workspace",
                "Default project created automatically for TaskFlow.",
                datetime.utcnow().isoformat(timespec="seconds"),
            ),
        )
        conn.commit()

    conn.close()


# Create all tables in tasks.db on startup and add any missing columns/tables safely
Base.metadata.create_all(bind=engine)
ensure_schema_additions()
ensure_default_project()

UPLOAD_DIR = os.path.join(os.path.dirname(__file__), "uploads")
os.makedirs(UPLOAD_DIR, exist_ok=True)

app = FastAPI(title="TaskFlow API")

app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=r"https://.*\.taskflow-8qm\.pages\.dev",
    allow_origins=[
        "http://localhost:5173",
        "https://taskflow-8qm.pages.dev",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
# ================= FIREBASE SYNC SCHEMA =================

# =========================================================

# ================= USERS =================
@app.get("/api/users", response_model=List[schemas.UserOut])
def list_users(db: Session = Depends(get_db)):
    return crud.get_users(db)


@app.post("/api/users", response_model=schemas.UserOut)
def create_user(user: schemas.UserCreate, db: Session = Depends(get_db)):
    return crud.create_user(db, user)


@app.delete("/api/users/{user_id}")
def delete_user(user_id: int, db: Session = Depends(get_db)):
    user = crud.delete_user(db, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return {"ok": True}


# ========== ADDED: Firebase Authentication Endpoints ==========
@app.get("/api/users/by-email")
def get_user_by_email(email: str, db: Session = Depends(get_db)):
    """Get a user by their email address (for Firebase authentication)"""
    user = crud.get_user_by_email(db, email)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return user

@app.post(
    "/api/tasks",
    response_model=schemas.TaskOut,
    status_code=status.HTTP_201_CREATED
)
def create_task(
    task: schemas.TaskCreate,
    db: Session = Depends(get_db)
):
    # Create the task in the database
    db_task = crud.create_task(db, task)

    # Send email to every assigned user
    for assignee in db_task.assignees:

        # Only send if the user has an email
        if assignee.email:

            send_task_assignment_email(
                user_email=assignee.email,
                user_name=assignee.name,
                task_title=db_task.title,
                description=db_task.description,
                priority=db_task.priority,
                task_status=db_task.status,
                start_date=db_task.start_date,
                due_date=db_task.due_date
            )

    return db_task

# ==============================================================


@app.get("/api/departments")
def list_departments(db: Session = Depends(get_db)):
    return {"departments": crud.get_departments(db)}


# ================= PROJECTS =================
@app.get("/api/projects", response_model=List[schemas.ProjectOut])
def list_projects(db: Session = Depends(get_db)):
    return crud.get_projects(db)


@app.get("/api/projects/{project_id}", response_model=schemas.ProjectDetailOut)
def get_project(project_id: int, db: Session = Depends(get_db)):
    project = crud.get_project(db, project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    return project


@app.post("/api/projects", response_model=schemas.ProjectOut)
def create_project(project: schemas.ProjectCreate, db: Session = Depends(get_db)):
    return crud.create_project(db, project)


@app.put("/api/projects/{project_id}", response_model=schemas.ProjectOut)
def update_project(project_id: int, project: schemas.ProjectUpdate, db: Session = Depends(get_db)):
    updated = crud.update_project(db, project_id, project)
    if not updated:
        raise HTTPException(status_code=404, detail="Project not found")
    return updated


@app.delete("/api/projects/{project_id}")
def delete_project(project_id: int, db: Session = Depends(get_db)):
    deleted = crud.delete_project(db, project_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Project not found")
    return {"ok": True}


# ================= TASKS =================
@app.get("/api/tasks", response_model=List[schemas.TaskOut])
def list_tasks(
    project_id: Optional[int] = None,
    status: Optional[str] = None,
    priority: Optional[str] = None,
    assignee_id: Optional[int] = None,
    db: Session = Depends(get_db),
):
    return crud.get_tasks(db, project_id, status, priority, assignee_id)


@app.get("/api/tasks/by-date", response_model=List[schemas.TaskOut])
def list_tasks_by_date(start: str = Query(...), end: str = Query(...), db: Session = Depends(get_db)):
    return crud.get_tasks_by_date(db, start, end)


@app.get("/api/tasks/{task_id}", response_model=schemas.TaskOut)
def get_task(task_id: int, db: Session = Depends(get_db)):
    task = crud.get_task(db, task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    return task


@app.post("/api/users/sync-firebase")
def sync_firebase_user(
    user_data: schemas.FirebaseUserSync,
    db: Session = Depends(get_db)
):
    """
    Sync a Firebase user with the database.

    Creates the user if they don't exist.
    Sends a welcome email only when the user
    is created for the first time.
    """

    # Check if the user already exists
    existing_user = crud.get_user_by_email(
        db,
        user_data.email
    )

    # Get existing user or create a new one
    user = crud.get_or_create_user_by_email(
        db,
        user_data.email,
        user_data.name
    )

    # Send welcome email only for a newly created user
    if existing_user is None and user is not None:
        send_welcome_email(
            user_email=user_data.email,
            user_name=user_data.name
        )

    return user


@app.put("/api/tasks/{task_id}", response_model=schemas.TaskOut)
def update_task(task_id: int, task: schemas.TaskUpdate, db: Session = Depends(get_db)):
    updated = crud.update_task(db, task_id, task)
    if not updated:
        raise HTTPException(status_code=404, detail="Task not found")
    return updated


@app.delete("/api/tasks/{task_id}")
def delete_task(task_id: int, db: Session = Depends(get_db)):
    deleted = crud.delete_task(db, task_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Task not found")
    return {"ok": True}


# ================= DASHBOARD STATS =================
@app.get("/api/stats")
def get_stats(db: Session = Depends(get_db)):
    all_tasks = db.query(models.Task).all()
    total = len(all_tasks)
    todo = len([t for t in all_tasks if t.status == "To Do"])
    in_progress = len([t for t in all_tasks if t.status == "In Progress"])
    in_review = len([t for t in all_tasks if t.status == "In Review"])
    completed = len([t for t in all_tasks if t.status == "Completed"])
    return {
        "total": total,
        "todo": todo,
        "in_progress": in_progress,
        "in_review": in_review,
        "completed": completed,
        "project_count": db.query(models.Project).count(),
    }


# ================= COMMENTS =================
@app.get("/api/tasks/{task_id}/comments", response_model=List[schemas.CommentOut])
def list_comments(task_id: int, db: Session = Depends(get_db)):
    task = crud.get_task(db, task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    return task.comments


@app.post("/api/tasks/{task_id}/comments", response_model=schemas.CommentOut)
def create_comment(task_id: int, comment: schemas.CommentCreate, db: Session = Depends(get_db)):
    task = crud.get_task(db, task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    return crud.add_comment(db, task_id, comment)


@app.delete("/api/comments/{comment_id}")
def delete_comment(comment_id: int, db: Session = Depends(get_db)):
    deleted = crud.delete_comment(db, comment_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Comment not found")
    return {"ok": True}


# ================= ATTACHMENTS =================
@app.get("/api/tasks/{task_id}/attachments", response_model=List[schemas.AttachmentOut])
def list_attachments(task_id: int, db: Session = Depends(get_db)):
    task = crud.get_task(db, task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    return task.attachments


@app.post("/api/tasks/{task_id}/attachments", response_model=schemas.AttachmentOut)
def upload_attachment(task_id: int, file: UploadFile = File(...), db: Session = Depends(get_db)):
    task = crud.get_task(db, task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")

    ext = os.path.splitext(file.filename)[1]
    stored_name = f"{uuid.uuid4().hex}{ext}"
    stored_path = os.path.join(UPLOAD_DIR, stored_name)

    with open(stored_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)

    return crud.add_attachment(db, task_id, file.filename, stored_name)


@app.get("/api/attachments/{attachment_id}/download")
def download_attachment(attachment_id: int, db: Session = Depends(get_db)):
    attachment = db.query(models.Attachment).filter(models.Attachment.id == attachment_id).first()
    if not attachment:
        raise HTTPException(status_code=404, detail="Attachment not found")
    file_path = os.path.join(UPLOAD_DIR, attachment.stored_path)
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="File missing on disk")
    return FileResponse(file_path, filename=attachment.filename)


@app.delete("/api/attachments/{attachment_id}")
def delete_attachment(attachment_id: int, db: Session = Depends(get_db)):
    attachment = db.query(models.Attachment).filter(models.Attachment.id == attachment_id).first()
    if not attachment:
        raise HTTPException(status_code=404, detail="Attachment not found")
    file_path = os.path.join(UPLOAD_DIR, attachment.stored_path)
    if os.path.exists(file_path):
        os.remove(file_path)
    crud.delete_attachment(db, attachment_id)
    return {"ok": True}


# ================= NOTIFICATIONS =================
@app.get("/api/notifications", response_model=List[schemas.NotificationOut])
def list_notifications(user_id: int, db: Session = Depends(get_db)):
    return crud.get_notifications(db, user_id)


@app.patch("/api/notifications/{notification_id}/read", response_model=schemas.NotificationOut)
def read_notification(notification_id: int, db: Session = Depends(get_db)):
    notification = crud.mark_notification_read(db, notification_id)
    if not notification:
        raise HTTPException(status_code=404, detail="Notification not found")
    return notification


@app.get("/api/notifications/unread-count")
def unread_notification_count(user_id: int, db: Session = Depends(get_db)):
    return {"count": crud.get_unread_notification_count(db, user_id)}


# ================= ACTIVITY =================
@app.get("/api/activity", response_model=List[schemas.ActivityOut])
def list_activity(limit: int = 50, project_id: Optional[int] = None, task_id: Optional[int] = None, db: Session = Depends(get_db)):
    return crud.get_activity(db, limit=limit, project_id=project_id, task_id=task_id)


# ================= SETTINGS =================
@app.get("/api/settings", response_model=schemas.SettingsOut)
def get_settings(db: Session = Depends(get_db)):
    return crud.get_settings(db)


@app.put("/api/settings", response_model=schemas.SettingsOut)
def update_settings(settings: schemas.SettingsUpdate, db: Session = Depends(get_db)):
    return crud.update_settings(db, settings)


# ================= SERVE FRONTEND =================
FRONTEND_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "frontend")
if os.path.isdir(FRONTEND_DIR):
    app.mount("/", StaticFiles(directory=FRONTEND_DIR, html=True), name="frontend")


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=4050
    )