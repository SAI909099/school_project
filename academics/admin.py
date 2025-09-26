# academics/admin.py
from django.contrib import admin
from .models import (
    Subject, Teacher, SchoolClass, Student,
    StudentGuardian, ScheduleEntry, Attendance,
    Grade, GradeScale, GPAConfig
)

# -----------------------------
# Core models
# -----------------------------

@admin.register(Subject)
class SubjectAdmin(admin.ModelAdmin):
    list_display  = ("id", "name", "code")
    search_fields = ("name", "code")


@admin.register(Teacher)
class TeacherAdmin(admin.ModelAdmin):
    list_display  = ("id", "user", "specialty", "is_class_teacher")
    list_filter   = ("is_class_teacher", "specialty")
    search_fields = ("user__phone", "user__first_name", "user__last_name")


@admin.register(SchoolClass)
class SchoolClassAdmin(admin.ModelAdmin):
    list_display  = ("id", "name", "level", "class_teacher", "capacity")
    list_filter   = ("level",)
    search_fields = ("name",)


@admin.register(Student)
class StudentAdmin(admin.ModelAdmin):
    list_display  = ("id", "last_name", "first_name", "clazz", "status")
    list_filter   = ("status", "clazz")
    search_fields = ("last_name", "first_name", "parent_phone")


# -----------------------------
# Scheduling / attendance
# -----------------------------

@admin.register(ScheduleEntry)
class ScheduleEntryAdmin(admin.ModelAdmin):
    list_display  = ("id", "clazz", "subject", "teacher", "weekday", "start_time", "end_time", "room")
    list_filter   = ("clazz", "teacher", "subject", "weekday")
    search_fields = ("clazz__name", "subject__name", "teacher__user__first_name", "teacher__user__last_name")


@admin.register(Attendance)
class AttendanceAdmin(admin.ModelAdmin):
    list_display  = ("id", "date", "student", "clazz", "subject", "status", "teacher", "note")
    list_filter   = ("status", "date", "clazz", "subject")
    search_fields = ("student__first_name", "student__last_name", "clazz__name", "subject__name")


# -----------------------------
# Grades & config
# -----------------------------

@admin.register(Grade)
class GradeAdmin(admin.ModelAdmin):
    list_display  = ("id", "student", "subject", "type", "score", "date", "term")
    list_filter   = ("type", "subject", "date", "term")
    search_fields = ("student__first_name", "student__last_name", "subject__name")


@admin.register(GradeScale)
class GradeScaleAdmin(admin.ModelAdmin):
    list_display  = ("id", "name", "p2", "p3", "p4", "p5", "active")
    list_filter   = ("active",)
    search_fields = ("name",)


@admin.register(GPAConfig)
class GPAConfigAdmin(admin.ModelAdmin):
    list_display  = ("id", "name", "weight_exam", "weight_final", "active")
    list_filter   = ("active",)
    search_fields = ("name",)


# -----------------------------
# Links
# -----------------------------

@admin.register(StudentGuardian)
class StudentGuardianAdmin(admin.ModelAdmin):
    list_display  = ("id", "student", "guardian")
    search_fields = ("student__first_name", "student__last_name", "guardian__phone")
