"""
Run this once to populate tasks.db with sample users, projects and tasks
so the board looks like the reference design immediately.

Usage:  python seed.py
"""
from database import engine, SessionLocal, Base
import models

Base.metadata.create_all(bind=engine)
db = SessionLocal()

if db.query(models.User).count() == 0:
    # ========== ADDED: Email field to users ==========
    users = [
        models.User(
            name="Pulok Paul", 
            initials="PP", 
            color="#7C3AED", 
            department="Design", 
            emoji="🎨",
            email="pulok.paul@example.com"  # Added email
        ),
        models.User(
            name="Jerome Bell", 
            initials="JB", 
            color="#F59E0B", 
            department="Product", 
            emoji="🧩",
            email="jerome.bell@example.com"  # Added email
        ),
        models.User(
            name="Cody Fisher", 
            initials="CF", 
            color="#10B981", 
            department="Engineering", 
            emoji="🛠️",
            email="cody.fisher@example.com"  # Added email
        ),
        models.User(
            name="Savannah Nguyen", 
            initials="SN", 
            color="#EF4444", 
            department="Marketing", 
            emoji="📣",
            email="savannah.nguyen@example.com"  # Added email
        ),
        models.User(
            name="Courtney Henry", 
            initials="CH", 
            color="#3B82F6", 
            department="Sales", 
            emoji="💼",
            email="courtney.henry@example.com"  # Added email
        ),
    ]
    db.add_all(users)
    db.commit()
    for u in users:
        db.refresh(u)

    # ========== ADDED: More users for demonstration ==========
    additional_users = [
        models.User(
            name="Alice Johnson",
            initials="AJ",
            color="#8B5CF6",
            department="Engineering",
            emoji="👩‍💻",
            email="alice.johnson@example.com"
        ),
        models.User(
            name="Bob Smith",
            initials="BS",
            color="#F472B6",
            department="Design",
            emoji="👨‍🎨",
            email="bob.smith@example.com"
        ),
        models.User(
            name="Carol White",
            initials="CW",
            color="#34D399",
            department="Marketing",
            emoji="👩‍💼",
            email="carol.white@example.com"
        ),
    ]
    # Only add if you want more users
    # db.add_all(additional_users)
    # db.commit()
    # all_users = users + additional_users
    all_users = users  # Use this if you don't want additional users

    project = models.Project(
        name="Pulok Paul's Workspace",
        description="Design system, hiring platform and web experience work.",
    )
    db.add(project)
    db.commit()
    db.refresh(project)

    def task(title, desc, status, priority, start, due, assignees):
        t = models.Task(
            project_id=project.id,
            title=title,
            description=desc,
            status=status,
            priority=priority,
            progress={"To Do": 10, "In Progress": 45, "In Review": 75, "Completed": 100}[status],
            start_date=start,
            due_date=due,
        )
        t.assignees = assignees
        db.add(t)
        return t

    u = {x.initials: x for x in users}

    tasks = [
        task("Design System foundation",
             "Define color token, typography, choose visual identity element that reflexible...",
             "To Do", "Urgent", "2026-02-04", "2026-02-11", [u["PP"], u["JB"], u["CF"]]),
        task("Competitor Audit and Visual Research",
             "Review competitors branding and UI to develop working for website collection.",
             "To Do", "Low", "2026-02-04", "2026-02-11", [u["PP"], u["SN"]]),
        task("Collaborate with Developers and Web Team",
             "Develop a feature for recruiters to schedule and manage.",
             "To Do", "Medium", "2026-02-04", "2026-02-11", [u["JB"], u["CH"]]),
        task("Craft Microinteractions and Animations",
             "Develop candidate interview scheduling feature.",
             "To Do", "High", "2026-02-04", "2026-02-11", [u["CF"], u["SN"]]),

        task("Conduct Usability Testing and Gather Feedback",
             "Develop a comprehensive job board platform to facilitate specialist recruitment.",
             "In Progress", "High", "2026-02-14", "2026-02-19", [u["PP"], u["JB"]]),
        task("Define Responsive Design Guidelines",
             "Implement social media integration to enable easy sharing of job posts.",
             "In Progress", "Medium", "2026-02-04", "2026-02-11", [u["CF"], u["SN"]]),
        task("Use daylighting for natural lighting",
             "Integrate geolocation-based job alerts for candidates.",
             "In Progress", "High", "2026-02-04", "2026-02-11", [u["JB"], u["CH"]]),
        task("Design Page Layouts and Grid Systems",
             "Enhance the platform's SEO capabilities to increase visibility.",
             "In Progress", "Urgent", "2026-02-04", "2026-02-11", [u["PP"]]),

        task("Design Wireframes and Prototypes",
             "Implement multilingual support to cater to a global user base.",
             "Completed", "High", "2026-02-24", "2026-02-29", [u["PP"], u["JB"], u["CF"]]),
        task("Define a Color Palette and Visual Style",
             "Enhance the platform's accessibility features to accommodate users.",
             "Completed", "Low", "2026-02-04", "2026-02-11", [u["SN"], u["CH"]]),
        task("Design Icons and Buttons",
             "Implement a system for employers to request and manage candidate references.",
             "Completed", "Medium", "2026-02-04", "2026-02-11", [u["CF"]]),
        task("Create a Color Palette and Visual Style",
             "Create employer access control system.",
             "Completed", "Urgent", "2026-02-04", "2026-02-11", [u["PP"], u["JB"]]),

        task("Select Fonts and Typography",
             "Create a user-friendly interface for employers to post job listings and manage applications.",
             "In Review", "Low", "2026-02-04", "2026-02-11", [u["PP"], u["JB"], u["CF"]]),
        task("Define Website Structure and Navigation",
             "Create user onboarding tutorial content.",
             "In Review", "High", "2026-02-04", "2026-02-11", [u["SN"], u["CH"]]),
        task("Select Fonts and Typography Guide",
             "Develop a comprehensive job board platform for facilitate specialist recruitment.",
             "In Review", "Urgent", "2026-02-04", "2026-02-11", [u["PP"]]),
        task("Design Icons and Buttons System",
             "Develop a comprehensive reporting and analytics module to track recruitment metrics.",
             "In Review", "High", "2026-02-04", "2026-02-11", [u["JB"], u["CF"]]),
    ]
    db.commit()

    # sample comment for demo purposes
    first_task = tasks[0]
    db.add(models.Comment(task_id=first_task.id, author_name="Jerome Bell",
                           content="Looks great, let's move this forward."))
    db.commit()
    
    # ========== ADDED: Activity log entries ==========
    for user in users:
        db.add(models.ActivityLog(
            actor_name="System",
            action="user_created",
            target_type="user",
            target_id=user.id,
            description=f"User '{user.name}' was created during seeding."
        ))
    
    db.add(models.ActivityLog(
        actor_name="System",
        action="project_created",
        target_type="project",
        target_id=project.id,
        description=f"Project '{project.name}' was created during seeding."
    ))
    
    db.commit()
    
    print("[OK] Seeded users, project, and tasks.")
else:
    print("[INFO] Database already has data - skipping seed.")

db.close()