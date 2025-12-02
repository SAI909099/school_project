# 🏫 School Management System

The **School Management System** is a complete backend platform built with **Django** and **Django REST Framework**, designed for real schools.  
It manages students, classrooms, attendance, grades, schedules, teachers, finance, and parent access.

This system is currently used in production and supports multi-role access with secure JWT authentication.

---

## 🚀 Features

### 👩‍🏫 **Teachers**
- Take daily, subject-based, and lesson-based attendance  
- Add, update, and view student grades  
- Access schedules and assigned classrooms  
- Manage homework and class materials  

### 👨‍👩‍👧 **Parents**
- Log in via phone number  
- View attendance, grades, and homework  
- Monitor child performance  

### 🧑‍🎓 **Students**
- Assigned to classes automatically  
- Attendance & grades updated in real time  

### 🏫 **School Administration**
- Create/manage classrooms  
- Add students, parents, teachers  
- Generate schedules  
- Finance dashboards (income / expenses)  
- Track active students per class  

### 📊 **Analytics**
- Monthly registration statistics  
- Class population distribution  
- Daily/weekly attendance reports  
- Yearly academic progress overview  

### 🔐 **Authentication**
- JWT access/refresh tokens  
- Phone-number based login for parents  
- Role-based permissions (Admin, Teacher, Parent, Operator)

---

## 🛠️ Tech Stack

**Backend:**  
- Python  
- Django  
- Django REST Framework  

**Database:**  
- PostgreSQL  

**Authentication:**  
- JWT (SimpleJWT)

**DevOps:**  
- Docker  
- Docker Compose  
- Linux Deployment  
- Nginx + Gunicorn (optional)

**Other:**  
- JavaScript frontend  
- Swagger documentation  

---

## 📦 Installation & Setup

### 1️⃣ Clone the repository
```bash
git clone https://github.com/SAI909099/school_project.git
cd school_project

2️⃣ Create .env file
SECRET_KEY=your-secret-key
DB_NAME=school_db
DB_USER=postgres
DB_PASSWORD=yourpassword
DB_HOST=db
DB_PORT=5432

3️⃣ Build and run the project
docker-compose up --build

4️⃣ Apply migrations
docker-compose exec web python manage.py migrate

5️⃣ Create superuser
docker-compose exec web python manage.py createsuperuser
```

👨‍💻 Author
Abdulazizxon Sulaymonov
Python Backend Developer
📧 Email: sulaymonovabdulaziz1@gmail.com
GitHub: https://github.com/SAI909099

