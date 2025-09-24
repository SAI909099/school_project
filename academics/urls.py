# academics/urls.py
from django.urls import path, include
from rest_framework.routers import DefaultRouter

from .views import (
    # CRUD ViewSets
    SubjectViewSet, TeacherViewSet, SchoolClassViewSet, StudentViewSet,
    ScheduleEntryViewSet, AttendanceViewSet, GradeViewSet,
    GradeScaleViewSet, GPAConfigViewSet,

    # Read-only directory/search
    ClassDirectoryViewSet, StudentDirectoryViewSet,

    # Utility / dashboards
    TeacherDashViewSet, ParentViewSet,

    # Operator one-shot enroll
    OperatorEnrollView, SchoolStatsView,
)

router = DefaultRouter()

# --- Core CRUD APIs ---
router.register(r'subjects', SubjectViewSet, basename='subjects')
router.register(r'teachers', TeacherViewSet, basename='teachers')
router.register(r'classes', SchoolClassViewSet, basename='classes')
router.register(r'students', StudentViewSet, basename='students')
router.register(r'schedule', ScheduleEntryViewSet, basename='schedule')
router.register(r'attendance', AttendanceViewSet, basename='attendance')
router.register(r'grades', GradeViewSet, basename='grades')
router.register(r'grade-scales', GradeScaleViewSet, basename='grade-scales')
router.register(r'gpa-config', GPAConfigViewSet, basename='gpa-config')

# --- Read-only directory/search (for UI lists) ---
router.register(r'dir/classes', ClassDirectoryViewSet, basename='dir-classes')
router.register(r'dir/students', StudentDirectoryViewSet, basename='dir-students')

# --- Non-Model endpoints from ViewSets (map actions) ---
teacher_classes_me = TeacherDashViewSet.as_view({'get': 'my_classes'})
parent_children = ParentViewSet.as_view({'get': 'children'})
parent_child_overview = ParentViewSet.as_view({'get': 'child_overview'})

urlpatterns = [
    # Router endpoints
    path('', include(router.urls)),

    # Teacher dashboard helpers
    path('teacher/classes/me/', teacher_classes_me, name='teacher-classes-me'),

    # Parent helpers
    path('parent/children/', parent_children, name='parent-children'),
    path('parent/child/<int:student_id>/overview/', parent_child_overview, name='parent-child-overview'),

    # Operator: single-shot enroll (creates parent if needed, adds student, links guardian)
    path('operator/enroll/', OperatorEnrollView.as_view(), name='operator-enroll'),
    path('stats/school/', SchoolStatsView.as_view(), name='school-stats'),  # <-- add
]
