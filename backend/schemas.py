from pydantic import BaseModel, Field, EmailStr, validator
from typing import List, Optional
from datetime import datetime


# ---------- User ----------
class UserBase(BaseModel):
    name: str
    initials: str
    color: Optional[str] = "#6366F1"
    department: Optional[str] = None
    emoji: Optional[str] = None
    # ========== ADDED: Email field ==========
    email: Optional[EmailStr] = None  # EmailStr validates email format
    # ========================================


class UserCreate(UserBase):
    pass


class UserOut(UserBase):
    id: int
    model_config = {"from_attributes": True}


# ========== ADDED: Firebase User Sync Schema ==========
class FirebaseUserSync(BaseModel):
    email: EmailStr
    name: Optional[str] = None
    firebase_uid: Optional[str] = None  # For future use


class UserEmailUpdate(BaseModel):
    email: EmailStr
# ======================================================


# ---------- Comment ----------
class CommentCreate(BaseModel):
    author_name: str
    content: str
    user_id: Optional[int] = None


class CommentOut(BaseModel):
    id: int
    task_id: int
    author_name: str
    content: str
    created_at: datetime
    model_config = {"from_attributes": True}


# ---------- Attachment ----------
class AttachmentOut(BaseModel):
    id: int
    task_id: int
    filename: str
    uploaded_at: datetime
    model_config = {"from_attributes": True}


# ---------- Task ----------
class TaskBase(BaseModel):
    title: str
    description: Optional[str] = ""
    status: str = "To Do"
    priority: str = "Medium"
    progress: int = Field(default=0, ge=0, le=100)
    start_date: Optional[str] = None
    due_date: Optional[str] = None
    
    # ========== ADDED: Date validation ==========
    @validator('start_date', 'due_date', pre=True, always=True)
    def validate_date(cls, v):
        if v is None or v == "":
            return None
        # If it's already in YYYY-MM-DD format
        try:
            datetime.strptime(v, '%Y-%m-%d')
            return v
        except (ValueError, TypeError):
            try:
                # Try MM/DD/YYYY format
                parsed = datetime.strptime(v, '%m/%d/%Y')
                return parsed.strftime('%Y-%m-%d')
            except (ValueError, TypeError):
                try:
                    # Try DD/MM/YYYY format
                    parsed = datetime.strptime(v, '%d/%m/%Y')
                    return parsed.strftime('%Y-%m-%d')
                except (ValueError, TypeError):
                    raise ValueError(f"Invalid date format: '{v}'. Use YYYY-MM-DD")
    # =============================================


class TaskCreate(TaskBase):
    project_id: int
    assignee_ids: List[int] = Field(default_factory=list)


class TaskUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    status: Optional[str] = None
    priority: Optional[str] = None
    progress: Optional[int] = Field(default=None, ge=0, le=100)
    start_date: Optional[str] = None
    due_date: Optional[str] = None
    assignee_ids: Optional[List[int]] = None
    
    # ========== ADDED: Date validation for updates ==========
    @validator('start_date', 'due_date', pre=True, always=True)
    def validate_date(cls, v):
        if v is None or v == "":
            return None
        try:
            datetime.strptime(v, '%Y-%m-%d')
            return v
        except (ValueError, TypeError):
            try:
                parsed = datetime.strptime(v, '%m/%d/%Y')
                return parsed.strftime('%Y-%m-%d')
            except (ValueError, TypeError):
                try:
                    parsed = datetime.strptime(v, '%d/%m/%Y')
                    return parsed.strftime('%Y-%m-%d')
                except (ValueError, TypeError):
                    raise ValueError(f"Invalid date format: '{v}'. Use YYYY-MM-DD")
    # =======================================================


class TaskOut(TaskBase):
    id: int
    project_id: int
    created_at: datetime
    assignees: List[UserOut] = []
    comments: List[CommentOut] = []
    attachments: List[AttachmentOut] = []
    model_config = {"from_attributes": True}


# ---------- Project ----------
class ProjectBase(BaseModel):
    name: str
    description: Optional[str] = ""


class ProjectCreate(ProjectBase):
    pass


class ProjectUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None


class ProjectOut(ProjectBase):
    id: int
    created_at: datetime
    task_count: int = 0
    completed_count: int = 0
    model_config = {"from_attributes": True}


class ProjectDetailOut(ProjectOut):
    tasks: List[TaskOut] = []


# ---------- Notifications ----------
class NotificationOut(BaseModel):
    id: int
    user_id: int
    message: str
    is_read: bool
    task_id: Optional[int] = None
    created_at: datetime
    model_config = {"from_attributes": True}


# ---------- Activity ----------
class ActivityOut(BaseModel):
    id: int
    actor_name: str
    action: str
    target_type: str
    target_id: int
    description: str
    created_at: datetime
    model_config = {"from_attributes": True}


# ---------- Settings ----------
class SettingsOut(BaseModel):
    id: int
    workspace_name: str
    default_view: str
    theme: str
    model_config = {"from_attributes": True}


class SettingsUpdate(BaseModel):
    workspace_name: Optional[str] = None
    default_view: Optional[str] = None
    theme: Optional[str] = None


# ========== ADDED: Auth Response Schemas ==========
class AuthResponse(BaseModel):
    success: bool
    message: str
    user: Optional[UserOut] = None
    token: Optional[str] = None


class PasswordResetRequest(BaseModel):
    email: EmailStr


class PasswordResetResponse(BaseModel):
    success: bool
    message: str


class TokenRefreshResponse(BaseModel):
    success: bool
    token: Optional[str] = None
    message: Optional[str] = None
# ===================================================