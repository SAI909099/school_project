# academics/urls.py
from django.urls import path, include
from rest_framework.routers import DefaultRouter

from .views import (
    SubjectViewSet, TeacherViewSet, SchoolClassViewSet, StudentViewSet,
    ScheduleEntryViewSet, AttendanceViewSet, GradeViewSet,
    GradeScaleViewSet, GPAConfigViewSet,
    TeacherDashViewSet, ParentViewSet
)

router = DefaultRouter()
router.register(r'subjects', SubjectViewSet, basename='subjects')
router.register(r'teachers', TeacherViewSet, basename='teachers')
router.register(r'classes', SchoolClassViewSet, basename='classes')
router.register(r'students', StudentViewSet, basename='students')
router.register(r'schedule', ScheduleEntryViewSet, basename='schedule')
router.register(r'attendance', AttendanceViewSet, basename='attendance')
router.register(r'grades', GradeViewSet, basename='grades')
router.register(r'grade-scale', GradeScaleViewSet, basename='grade-scale')
router.register(r'gpa-config', GPAConfigViewSet, basename='gpa-config')
router.register(r'teacher', TeacherDashViewSet, basename='teacher-dash')
router.register(r'parent', ParentViewSet, basename='parent')

urlpatterns = [
    path('', include(router.urls)),
]
