from database import SessionLocal
import models

db = SessionLocal()

def delete_all_activity_logs():
    try:
        count = db.query(models.ActivityLog).count()
        db.query(models.ActivityLog).delete()
        db.commit()
        print(f"✅ Deleted {count} activity logs")
    except Exception as e:
        db.rollback()
        print(f"❌ Error: {e}")
    finally:
        db.close()

def delete_all_data():
    try:
        print("Deleting all data...")
        
        print("Deleting comments...")
        db.query(models.Comment).delete()
        
        print("Deleting attachments...")
        db.query(models.Attachment).delete()
        
        print("Deleting notifications...")
        db.query(models.Notification).delete()
        
        print("Deleting activity logs...")
        db.query(models.ActivityLog).delete()
        
        print("Deleting task assignees...")
        db.execute("DELETE FROM task_assignees")
        
        print("Deleting tasks...")
        db.query(models.Task).delete()
        
        print("Deleting users...")
        db.query(models.User).delete()
        
        print("Deleting projects...")
        db.query(models.Project).delete()
        
        db.commit()
        print("✅ All data deleted successfully!")
        
    except Exception as e:
        db.rollback()
        print(f"❌ Error: {e}")
    finally:
        db.close()

def delete_logs_by_id_range():
    try:
        start_id = int(input("Enter starting ID: "))
        end_id = int(input("Enter ending ID: "))
        count = db.query(models.ActivityLog).filter(
            models.ActivityLog.id >= start_id, 
            models.ActivityLog.id <= end_id
        ).count()
        db.query(models.ActivityLog).filter(
            models.ActivityLog.id >= start_id, 
            models.ActivityLog.id <= end_id
        ).delete()
        db.commit()
        print(f"✅ Deleted {count} activity logs with IDs from {start_id} to {end_id}")
    except Exception as e:
        db.rollback()
        print(f"❌ Error: {e}")
    finally:
        db.close()

def delete_log_by_id():
    try:
        log_id = int(input("Enter activity log ID to delete: "))
        log = db.query(models.ActivityLog).filter(models.ActivityLog.id == log_id).first()
        if log:
            db.delete(log)
            db.commit()
            print(f"✅ Deleted activity log with ID {log_id}")
        else:
            print(f"❌ No activity log found with ID {log_id}")
        db.close()
    except Exception as e:
        print(f"❌ Error: {e}")

def delete_tasks_by_status():
    try:
        status = input("Enter status (To Do, In Progress, In Review, Completed): ")
        count = db.query(models.Task).filter(models.Task.status == status).count()
        db.query(models.Task).filter(models.Task.status == status).delete()
        db.commit()
        print(f"✅ Deleted {count} tasks with status '{status}'")
    except Exception as e:
        db.rollback()
        print(f"❌ Error: {e}")
    finally:
        db.close()

def delete_users_by_department():
    try:
        department = input("Enter department name: ")
        count = db.query(models.User).filter(models.User.department == department).count()
        db.query(models.User).filter(models.User.department == department).delete()
        db.commit()
        print(f"✅ Deleted {count} users in department '{department}'")
    except Exception as e:
        db.rollback()
        print(f"❌ Error: {e}")
    finally:
        db.close()

if __name__ == "__main__":
    print("=" * 50)
    print("🗑️ DELETE DATA MENU")
    print("=" * 50)
    print("1. Delete ALL activity logs")
    print("2. Delete activity logs by ID range")
    print("3. Delete specific activity log by ID")
    print("4. Delete tasks by status")
    print("5. Delete users by department")
    print("6. Delete ALL data (everything!)")
    print("7. Delete specific task by ID")
    print("8. Delete specific user by ID")
    print("=" * 50)
    
    choice = input("Enter choice (1-8): ")
    
    if choice == "1":
        confirm = input("⚠️ Delete ALL activity logs? (yes/no): ")
        if confirm.lower() == "yes":
            delete_all_activity_logs()
    
    elif choice == "2":
        confirm = input("⚠️ Delete activity logs by ID range? (yes/no): ")
        if confirm.lower() == "yes":
            delete_logs_by_id_range()
    
    elif choice == "3":
        delete_log_by_id()
    
    elif choice == "4":
        delete_tasks_by_status()
    
    elif choice == "5":
        delete_users_by_department()
    
    elif choice == "6":
        confirm = input("⚠️⚠️⚠️ Delete ALL DATA? This is permanent! (yes/no): ")
        if confirm.lower() == "yes":
            delete_all_data()
    
    elif choice == "7":
        try:
            task_id = int(input("Enter task ID to delete: "))
            db = SessionLocal()
            task = db.query(models.Task).filter(models.Task.id == task_id).first()
            if task:
                db.delete(task)
                db.commit()
                print(f"✅ Deleted task with ID {task_id}")
            else:
                print(f"❌ No task found with ID {task_id}")
            db.close()
        except Exception as e:
            print(f"❌ Error: {e}")
    
    elif choice == "8":
        try:
            user_id = int(input("Enter user ID to delete: "))
            db = SessionLocal()
            user = db.query(models.User).filter(models.User.id == user_id).first()
            if user:
                db.delete(user)
                db.commit()
                print(f"✅ Deleted user with ID {user_id}")
            else:
                print(f"❌ No user found with ID {user_id}")
            db.close()
        except Exception as e:
            print(f"❌ Error: {e}")
    
    else:
        print("❌ Invalid choice")