import os
from html import escape

import resend
from dotenv import load_dotenv

load_dotenv()

RESEND_API_KEY = os.getenv("RESEND_API_KEY")
RESEND_FROM_EMAIL = os.getenv(
    "RESEND_FROM_EMAIL",
    "onboarding@resend.dev"
)

if RESEND_API_KEY:
    resend.api_key = RESEND_API_KEY


def send_email(
    to_email: str,
    subject: str,
    html_content: str
):
    if not RESEND_API_KEY:
        print("RESEND_API_KEY is missing. Email was not sent.")
        return

    try:
        params = {
            "from": RESEND_FROM_EMAIL,
            "to": [to_email],
            "subject": subject,
            "html": html_content,
        }

        email = resend.Emails.send(params)

        print(
            f"Email sent successfully to {to_email}. "
            f"Resend response: {email}"
        )

    except Exception as e:
        print(
            f"Failed to send email to {to_email}: {e}"
        )


def send_welcome_email(
    user_email: str,
    user_name: str = None
):
    name = escape(user_name or "there")

    html = f"""
    <html>
    <body>

        <h2>Welcome to TaskFlow 👋</h2>

        <p>Hello {name},</p>

        <p>
            Your TaskFlow account has been successfully created.
        </p>

        <p>
            You can now log in and start managing your tasks,
            projects and team activities.
        </p>

        <p>
            Welcome to TaskFlow!
        </p>

        <br>

        <p>
            Regards,<br>
            <strong>TaskFlow Team</strong>
        </p>

    </body>
    </html>
    """

    send_email(
        user_email,
        "Welcome to TaskFlow",
        html
    )


def send_task_assignment_email(
    user_email: str,
    user_name: str,
    task_title: str,
    description: str,
    priority: str,
    task_status: str,
    start_date: str,
    due_date: str,
):
    name = escape(user_name or "there")
    title = escape(task_title or "Untitled Task")
    description = escape(
        description or "No description provided"
    )
    priority = escape(priority or "Medium")
    task_status = escape(task_status or "To Do")
    start_date = escape(start_date or "Not specified")
    due_date = escape(due_date or "Not specified")

    html = f"""
    <html>
    <body>

        <h2>📋 New Task Assigned to You</h2>

        <p>
            Hello {name},
        </p>

        <p>
            A new task has been assigned to you in TaskFlow.
        </p>

        <hr>

        <h3>{title}</h3>

        <p>
            <strong>Description:</strong><br>
            {description}
        </p>

        <p>
            <strong>Priority:</strong> {priority}
        </p>

        <p>
            <strong>Status:</strong> {task_status}
        </p>

        <p>
            <strong>Start Date:</strong> {start_date}
        </p>

        <p>
            <strong>Due Date:</strong> {due_date}
        </p>

        <hr>

        <p>
            Please open TaskFlow to view the complete task details.
        </p>

        <br>

        <p>
            Regards,<br>
            <strong>TaskFlow Team</strong>
        </p>

    </body>
    </html>
    """

    send_email(
        user_email,
        f"New Task Assigned: {title}",
        html
    )