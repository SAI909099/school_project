# academics/views.py
import traceback
from collections import defaultdict
from datetime import date, timedelta

from django.contrib.auth import get_user_model
from django.db import models
from django.db.models import Count, Q, Min
from django.db.models.functions import TruncMonth
from rest_framework import viewsets, permissions
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import (
    StudentGuardian, ScheduleEntry, Attendance, Grade, GradeScale, GPAConfig,
    Subject, Teacher, SchoolClass, Student
)
from .permissions import IsAdminOrRegistrarWrite, IsAdminOrTeacherWrite
from .serializers import (
    ScheduleEntrySerializer, AttendanceSerializer, GradeSerializer,
    GradeScaleSerializer, GPAConfigSerializer,
    SubjectSerializer, TeacherSerializer, SchoolClassSerializer, StudentSerializer,
    ClassMiniSerializer, StudentLiteSerializer
)

User = get_user_model()

# =========================
# Helpers (AVERAGE system)
# =========================

def _subjects_for_class(class_id: int) -> list[int]:
    """
    Distinct subject IDs taught to the class (based on schedule).
    Falls back to all Subjects if the class has no schedule yet.
    """
    if not class_id:
        return list(Subject.objects.values_list('id', flat=True))
    ids = (ScheduleEntry.objects
           .filter(clazz_id=class_id)
           .values_list('subject_id', flat=True)
           .distinct())
    ids = list(ids)
    if not ids:
        ids = list(Subject.objects.values_list('id', flat=True))
    return ids


def _subject_breakdown(student_id: int, subject_id: int, term: str | None = None):
    """
    Returns (exam_avg, final_avg, subject_avg) for one student/subject.
    subject_avg is a simple mean of ALL available exam+final scores,
    with the convention: if there is a FINAL, it naturally contributes to the mean.
    """
    qs = Grade.objects.filter(student_id=student_id, subject_id=subject_id)
    if term:
        qs = qs.filter(term=term)

    exams  = list(qs.filter(type='exam').values_list('score', flat=True))
    finals = list(qs.filter(type='final').values_list('score', flat=True))

    def avg(arr):
        return round(sum(arr) / len(arr), 2) if arr else None

    exam_avg  = avg(exams)
    final_avg = avg(finals)
    all_scores = exams + finals
    subject_avg = avg(all_scores)
    return exam_avg, final_avg, subject_avg


def _subject_score_for_student(student_id: int, subject_id: int, term: str | None = None):
    """
    Representative single score for a subject used in overall average:
    - Latest FINAL score if available
    - Else average of EXAM scores
    - Else None
    """
    qs = Grade.objects.filter(student_id=student_id, subject_id=subject_id)
    if term:
        qs = qs.filter(term=term)

    final = qs.filter(type='final').order_by('-date', '-id').first()
    if final and final.score is not None:
        return float(final.score)

    exam_scores = list(qs.filter(type='exam').values_list('score', flat=True))
    if exam_scores:
        return float(sum(exam_scores) / len(exam_scores))

    return None


# =========================
# CRUD ViewSets
# =========================

class SubjectViewSet(viewsets.ModelViewSet):
    queryset = Subject.objects.all().order_by('name')
    serializer_class = SubjectSerializer
    permission_classes = [permissions.IsAuthenticated, IsAdminOrRegistrarWrite]


class TeacherViewSet(viewsets.ModelViewSet):
    queryset = Teacher.objects.select_related('user', 'specialty').all()
    serializer_class = TeacherSerializer
    permission_classes = [permissions.IsAuthenticated, IsAdminOrRegistrarWrite]

    # ---- Directory (safe: only admin/registrar/operator) ----
    @action(detail=False, methods=['get'], url_path='directory',
            permission_classes=[permissions.IsAuthenticated])
    def directory(self, request):
        role = getattr(request.user, 'role', '')
        if role not in ('admin', 'registrar', 'operator'):
            return Response({'detail': 'Forbidden'}, status=403)

        qs = Teacher.objects.select_related('user').all().order_by('user__last_name', 'user__first_name')
        rows = []
        for t in qs:
            u = t.user
            rows.append({
                'id': t.id,
                'user_id': getattr(u, 'id', None),
                'first_name': (getattr(u, 'first_name', '') or getattr(t, 'first_name', '')).strip(),
                'last_name':  (getattr(u, 'last_name', '')  or getattr(t, 'last_name', '')).strip(),
                'phone': getattr(u, 'phone', '') or getattr(u, 'username', ''),
            })
        return Response(rows)

    # ---- Set password (safe: only admin/registrar/operator) ----
    @action(detail=True, methods=['post'], url_path='set-password',
            permission_classes=[permissions.IsAuthenticated])
    def set_password(self, request, pk=None):
        role = getattr(request.user, 'role', '')
        if role not in ('admin', 'registrar', 'operator'):
            return Response({'detail': 'Forbidden'}, status=403)

        pw = (request.data.get('password') or '').strip()
        if len(pw) < 6:
            return Response({'detail': 'Parol uzunligi kamida 6 belgi bo‘lishi kerak'}, status=400)

        try:
            teacher = Teacher.objects.select_related('user').get(pk=pk)
        except Teacher.DoesNotExist:
            return Response({'detail': 'Teacher not found'}, status=404)

        if not teacher.user:
            return Response({'detail': 'User account missing for this teacher'}, status=400)

        teacher.user.set_password(pw)
        teacher.user.save()
        return Response({'ok': True})


class SchoolClassViewSet(viewsets.ModelViewSet):
    """
    Full CRUD for classes + rich class actions (attendance/gradebooks/averages).
    """
    queryset = (SchoolClass.objects
                .select_related('class_teacher')
                .all()
                .order_by('name'))
    serializer_class = SchoolClassSerializer
    permission_classes = [permissions.IsAuthenticated, IsAdminOrRegistrarWrite]

    @action(detail=True, methods=['get'])
    def students_az(self, request, pk=None):
        students = Student.objects.filter(clazz_id=pk).order_by('last_name', 'first_name')
        return Response(StudentSerializer(students, many=True).data)

    # ---- Weekly helpers ----
    def _week_range(self, anchor: date):
        # Monday..Saturday (6 days)
        start = anchor - timedelta(days=anchor.weekday())  # Monday
        end = start + timedelta(days=5)
        return start, end

    # ---- Attendance grid for a class (Mon..Sat) ----
    @action(detail=True, methods=['get'])
    def attendance_grid(self, request, pk=None):
        # ?week_of=YYYY-MM-DD (any day within the week)
        d = request.query_params.get('week_of')
        anchor = date.fromisoformat(d) if d else date.today()
        start, end = self._week_range(anchor)

        students = list(
            Student.objects.filter(clazz_id=pk)
            .order_by('last_name', 'first_name')
            .values('id', 'first_name', 'last_name')
        )
        att = Attendance.objects.filter(clazz_id=pk, date__range=(start, end))
        grid = defaultdict(dict)
        for a in att:
            grid[a.student_id][a.date.isoformat()] = a.status
        days = [(start + timedelta(days=i)).isoformat() for i in range(6)]
        return Response({'students': students, 'days': days, 'grid': grid})

    # ---- Exam gradebook ----
    @action(detail=True, methods=['get'])
    def gradebook_exams(self, request, pk=None):
        term = request.query_params.get('term', '')
        grades = Grade.objects.filter(student__clazz_id=pk, type='exam')
        if term:
            grades = grades.filter(term=term)
        data = defaultdict(list)
        for g in grades.order_by('date'):
            data[g.student_id].append({'subject': g.subject_id, 'date': g.date, 'score': g.score})
        return Response(data)

    # ---- Final gradebook ----
    @action(detail=True, methods=['get'])
    def gradebook_final(self, request, pk=None):
        term = request.query_params.get('term', '')
        grades = Grade.objects.filter(student__clazz_id=pk, type='final')
        if term:
            grades = grades.filter(term=term)
        data = defaultdict(list)
        for g in grades.order_by('date'):
            data[g.student_id].append({'subject': g.subject_id, 'date': g.date, 'score': g.score})
        return Response(data)

    # ---- Average ranking for a class ----
    @action(detail=True, methods=['get'])
    def average_ranking(self, request, pk=None):
        """
        GET /api/classes/{id}/average_ranking/?term=2025-1 (optional)
        Ranking by simple arithmetic average across the class's subjects.
        Subject score = latest FINAL else average of EXAMs.
        """
        term = request.query_params.get('term') or None

        students = Student.objects.filter(clazz_id=pk).order_by('last_name', 'first_name')
        subject_ids = _subjects_for_class(pk)

        ranking = []
        for s in students:
            scores = []
            for sid in subject_ids:
                sc = _subject_score_for_student(s.id, sid, term=term)
                if sc is not None:
                    scores.append(sc)
            avg = (sum(scores) / len(scores)) if scores else 0.0
            ranking.append({
                'student_id': s.id,
                'name': f"{s.last_name} {s.first_name}",
                'avg': round(avg, 2),
                'count_subjects': len(scores)
            })

        ranking.sort(key=lambda x: x['avg'], reverse=True)
        for i, row in enumerate(ranking, start=1):
            row['rank'] = i

        return Response({'class_id': pk, 'ranking': ranking})


class StudentViewSet(viewsets.ModelViewSet):
    """
    Full CRUD for students, scoped by teacher for GET list.
    """
    queryset = Student.objects.select_related('clazz').all()
    serializer_class = StudentSerializer
    permission_classes = [permissions.IsAuthenticated, IsAdminOrRegistrarWrite]

    def get_queryset(self):
        qs = super().get_queryset()
        user = self.request.user
        if getattr(user, 'role', None) == 'teacher':
            try:
                teacher = user.teacher_profile
                qs = qs.filter(clazz__class_teacher=teacher)
            except Teacher.DoesNotExist:
                qs = qs.none()
        return qs

    @action(detail=False, methods=['get'], permission_classes=[permissions.IsAuthenticated])
    def me_class(self, request):
        """For teachers: list my class students (if I am class teacher)."""
        user = request.user
        if getattr(user, 'role', None) != 'teacher':
            return Response([])
        try:
            teacher = user.teacher_profile
        except Teacher.DoesNotExist:
            return Response([])
        students = Student.objects.filter(clazz__class_teacher=teacher)
        return Response(StudentSerializer(students, many=True).data)


class ScheduleEntryViewSet(viewsets.ModelViewSet):
    queryset = ScheduleEntry.objects.select_related('clazz', 'teacher', 'subject').all()
    serializer_class = ScheduleEntrySerializer
    permission_classes = [permissions.IsAuthenticated, IsAdminOrRegistrarWrite]

    @action(detail=False, methods=['get'], url_path='class/(?P<class_id>[^/.]+)')
    def by_class(self, request, class_id=None):
        qs = self.queryset.filter(clazz_id=class_id).order_by('weekday', 'start_time')
        return Response(self.serializer_class(qs, many=True).data)

    @action(detail=False, methods=['get'], url_path='teacher/me')
    def my_schedule(self, request):
        user = request.user
        if getattr(user, 'role', None) != 'teacher':
            return Response([])
        try:
            t = user.teacher_profile
        except Teacher.DoesNotExist:
            return Response([])
        qs = self.queryset.filter(teacher=t)
        return Response(self.serializer_class(qs, many=True).data)

    @action(detail=False, methods=['get'], url_path='teacher/(?P<teacher_id>[^/.]+)')
    def by_teacher_id(self, request, teacher_id=None):
        qs = self.queryset.filter(teacher_id=teacher_id).order_by('weekday', 'start_time')
        return Response(self.serializer_class(qs, many=True).data)

    def get_queryset(self):
        qs = super().get_queryset()
        teacher_id = self.request.query_params.get('teacher')
        class_id = self.request.query_params.get('clazz') or self.request.query_params.get('class')
        if teacher_id:
            qs = qs.filter(teacher_id=teacher_id)
        if class_id:
            qs = qs.filter(clazz_id=class_id)
        return qs.order_by('weekday', 'start_time')


# =========================
# Attendance
# =========================

# =========================
# Attendance (per-lesson safe)
# =========================

class AttendanceViewSet(viewsets.ModelViewSet):
    """
    CRUD + utilities for attendance.

    Backward compatible:
      - If `schedule` is provided in write/read calls, it is used to
        uniquely identify the lesson on that day.
      - Otherwise we fall back to `subject` (legacy behavior).
    """
    queryset = (
        Attendance.objects
        .select_related('student', 'clazz', 'subject', 'teacher', 'schedule', 'schedule__subject', 'schedule__clazz')
        .all()
    )
    serializer_class = AttendanceSerializer
    permission_classes = [permissions.IsAuthenticated, IsAdminOrTeacherWrite]

    # ---- base scoping for list/retrieve ----
    def get_queryset(self):
        qs = super().get_queryset().distinct()
        u = self.request.user
        role = getattr(u, 'role', None)

        if role == 'teacher':
            try:
                t = u.teacher_profile
                qs = qs.filter(
                    Q(clazz__class_teacher=t) |
                    Q(teacher=t) |
                    Q(student__clazz__schedule__teacher=t)
                )
            except Teacher.DoesNotExist:
                return Attendance.objects.none()

        elif role == 'parent':
            child_ids = StudentGuardian.objects.filter(guardian=u).values_list('student_id', flat=True)
            qs = qs.filter(student_id__in=child_ids)

        return qs

    # ---- bulk mark: used by teacher page (present/absent/late/excused) ----
    @action(detail=False, methods=['post'], url_path='bulk-mark')
    def bulk_mark(self, request):
        """
        Payload:
        {
          "class": <id>, "date": "YYYY-MM-DD",
          "schedule": <id or null>,   # NEW (preferred)
          "subject":  <id or null>,   # legacy fallback
          "entries": [{"student":id, "status":"present|absent|late|excused", "note":""}]
        }
        """
        u = request.user
        if getattr(u, 'role', None) not in ('admin', 'teacher', 'registrar', 'operator'):
            return Response({'detail': 'Forbidden'}, status=403)

        clazz = request.data.get('class')
        dt = request.data.get('date')
        schedule_id = request.data.get('schedule')
        subject = request.data.get('subject')
        entries = request.data.get('entries', [])

        if not clazz or not dt or not isinstance(entries, list):
            return Response({'detail': 'class, date and entries are required'}, status=400)
        try:
            d_obj = date.fromisoformat(dt)
        except Exception:
            return Response({'detail': 'invalid date (YYYY-MM-DD)'}, status=400)

        # Validate/resolve schedule if provided
        sch = None
        if schedule_id:
            try:
                sch = ScheduleEntry.objects.select_related('clazz', 'subject').get(id=schedule_id)
            except ScheduleEntry.DoesNotExist:
                return Response({'detail': 'schedule not found'}, status=404)
            if int(sch.clazz_id) != int(clazz):
                return Response({'detail': 'schedule does not belong to provided class'}, status=400)
            # Optional sanity: weekday check (do not hard-fail)
            # wd = (d_obj.weekday() + 1)  # Mon..Sat => 1..6
            # if sch.weekday != wd: pass

        try:
            t = u.teacher_profile if getattr(u, 'role', None) == 'teacher' else None
        except Teacher.DoesNotExist:
            t = None

        ids = []
        for e in entries:
            sid = e.get('student')
            st  = e.get('status')
            if not sid or st not in ('present', 'absent', 'late', 'excused'):
                continue

            # Unique key prefers schedule; else legacy subject
            key = {'student_id': sid, 'date': dt}
            if sch is not None:
                key['schedule_id'] = sch.id
            else:
                key['subject_id'] = subject

            defaults = {
                'status': st,
                'note': e.get('note', ''),
                'clazz_id': clazz,
                'teacher': t,
            }
            # help queries / analytics even when schedule used
            if sch is not None:
                defaults.setdefault('subject_id', getattr(sch, 'subject_id', None))

            obj, _ = Attendance.objects.update_or_create(**key, defaults=defaults)
            ids.append(obj.id)

        return Response({'ok': True, 'ids': ids})

    # ---- simple mark: used by operator page (boolean present) ----
    @action(detail=False, methods=['post'], url_path='mark')
    def mark(self, request):
        """
        Payload:
        {
          "class_id": <id>,
          "date": "YYYY-MM-DD",
          "schedule": <id or null>,   # NEW (preferred)
          "subject":  <id or null>,   # legacy fallback
          "items": [{"student": id, "present": true|false}]
        }
        """
        u = request.user
        if getattr(u, 'role', None) not in ('admin', 'registrar', 'operator', 'teacher'):
            return Response({'detail': 'Forbidden'}, status=403)

        clazz = request.data.get('class_id')
        dt = request.data.get('date')
        schedule_id = request.data.get('schedule')
        subject = request.data.get('subject')
        items = request.data.get('items', [])

        if not clazz or not dt or not isinstance(items, list):
            return Response({'detail': 'class_id, date and items are required'}, status=400)
        try:
            d_obj = date.fromisoformat(dt)
        except Exception:
            return Response({'detail': 'invalid date (YYYY-MM-DD)'}, status=400)

        sch = None
        if schedule_id:
            try:
                sch = ScheduleEntry.objects.select_related('clazz', 'subject').get(id=schedule_id)
            except ScheduleEntry.DoesNotExist:
                return Response({'detail': 'schedule not found'}, status=404)
            if int(sch.clazz_id) != int(clazz):
                return Response({'detail': 'schedule does not belong to provided class'}, status=400)

        try:
            t = u.teacher_profile if getattr(u, 'role', None) == 'teacher' else None
        except Teacher.DoesNotExist:
            t = None

        ids = []
        for it in items:
            sid = it.get('student')
            if not sid:
                continue
            status_val = 'present' if bool(it.get('present')) else 'absent'

            key = {'student_id': sid, 'date': dt}
            if sch is not None:
                key['schedule_id'] = sch.id
            else:
                key['subject_id'] = subject

            defaults = {'status': status_val, 'note': '', 'clazz_id': clazz, 'teacher': t}
            if sch is not None:
                defaults.setdefault('subject_id', getattr(sch, 'subject_id', None))

            obj, _ = Attendance.objects.update_or_create(**key, defaults=defaults)
            ids.append(obj.id)

        return Response({'ok': True, 'ids': ids})

    # ---- read back saved marks for a class/day (+ optional schedule/subject) ----
    @action(detail=False, methods=['get'], url_path='by-class-day')
    def by_class_day(self, request):
        """
        GET /api/attendance/by-class-day/?class=<id>&date=YYYY-MM-DD&schedule=<id?>&subject=<id?>
        Returns: [{"student_id":..., "status":"present|absent|late|excused", "note": "..."}]
        """
        clazz = request.query_params.get('class')
        dt = request.query_params.get('date')
        schedule_id = request.query_params.get('schedule')
        subject = request.query_params.get('subject')

        if not clazz or not dt:
            return Response({'detail': 'class and date are required'}, status=400)
        try:
            date.fromisoformat(dt)
        except Exception:
            return Response({'detail': 'invalid date (YYYY-MM-DD)'}, status=400)

        qs = self.get_queryset().filter(clazz_id=clazz, date=dt)
        if schedule_id:
            qs = qs.filter(schedule_id=schedule_id)
        elif subject:
            qs = qs.filter(subject_id=subject)

        data = qs.values('student_id', 'status', 'note')
        return Response(list(data))

    # ---- "Kelmaganlar" list (1 row per student for the day) ----
    @action(detail=False, methods=['get'], url_path='absent')
    def absent(self, request):
        date_str = request.query_params.get('date')
        if not date_str:
            return Response({'detail': 'date is required (YYYY-MM-DD)'}, status=400)
        try:
            date.fromisoformat(date_str)
        except Exception:
            return Response({'detail': 'invalid date (YYYY-MM-DD)'}, status=400)

        class_id = request.query_params.get('class')
        base_qs = self.get_queryset().filter(date=date_str, status='absent')
        if class_id:
            base_qs = base_qs.filter(clazz_id=class_id)

        ids_qs = (
            base_qs.values('student_id')
            .annotate(first_id=Min('id'))
            .values_list('first_id', flat=True)
        )
        qs = Attendance.objects.filter(id__in=ids_qs).select_related('student', 'clazz')

        rows = []
        for a in qs:
            s = a.student
            full_name = (
                f"{getattr(s, 'last_name', '')} {getattr(s, 'first_name', '')}".strip()
                or getattr(s, 'full_name', '')
                or f"#{s.id}"
            )
            class_name = a.clazz.name if a.clazz else (getattr(s.clazz, 'name', '') if getattr(s, 'clazz', None) else '')
            rows.append({
                'student_id': s.id,
                'full_name': full_name,
                'class_name': class_name,
                'parent_phone': getattr(s, 'parent_phone', '') or '',
            })
        return Response(rows)



class GradeViewSet(viewsets.ModelViewSet):
    queryset = Grade.objects.select_related('student', 'subject', 'teacher').all()
    serializer_class = GradeSerializer
    permission_classes = [permissions.IsAuthenticated, IsAdminOrTeacherWrite]

    def get_queryset(self):
        qs = super().get_queryset()
        u = self.request.user
        role = getattr(u, 'role', None)
        if role == 'teacher':
            try:
                t = u.teacher_profile
                qs = qs.filter(Q(student__clazz__class_teacher=t) | Q(teacher=t))
            except Teacher.DoesNotExist:
                return Grade.objects.none()
        elif role == 'parent':
            child_ids = StudentGuardian.objects.filter(guardian=u).values_list('student_id', flat=True)
            qs = qs.filter(student_id__in=child_ids)
        return qs

    @action(detail=False, methods=['post'], url_path='bulk-set')
    def bulk_set(self, request):
        """
        Payload:
        {
          "class": id, "date":"YYYY-MM-DD", "subject": id,
          "type":"exam|final", "term":"2025-1",
          "entries":[{"student":id, "score":2..5, "comment":""}]
        }
        """
        u = request.user
        if getattr(u, 'role', None) not in ('admin', 'teacher'):
            return Response({'detail': 'Forbidden'}, status=403)

        data = request.data
        gtype = (data.get('type') or '').strip()
        if gtype not in ('exam', 'final'):
            return Response({'detail': 'type must be "exam" or "final"'}, status=400)

        t = None
        if getattr(u, 'role', None) == 'teacher':
            try:
                t = u.teacher_profile
            except Teacher.DoesNotExist:
                pass

        ids = []
        for e in data.get('entries', []):
            obj, _ = Grade.objects.update_or_create(
                student_id=e['student'],
                subject_id=data['subject'],
                date=data['date'],
                type=gtype,
                defaults={
                    'score': e['score'],
                    'comment': e.get('comment', ''),
                    'teacher': t,
                    'term': data.get('term', '')
                }
            )
            ids.append(obj.id)
        return Response({'ok': True, 'ids': ids})

    @action(detail=False, methods=['get'], url_path='by-class')
    def by_class(self, request):
        """
        Read-only filter:
        GET /api/grades/by-class/?class=<id>&subject=<id>&type=exam|final&date=YYYY-MM-DD&term=2025-1
        Returns: list of grades for the class that match the filters.
        Role rules are applied (teacher sees own domain, parent sees own kids, etc).
        """
        qs = self.get_queryset()
        clazz = request.query_params.get('class')
        subject = request.query_params.get('subject')
        gtype = request.query_params.get('type')
        dt = request.query_params.get('date')
        term = request.query_params.get('term', '')

        if clazz:
            qs = qs.filter(student__clazz_id=clazz)
        if subject:
            qs = qs.filter(subject_id=subject)
        if gtype:
            if gtype not in ('exam', 'final'):
                return Response({'detail': 'type must be "exam" or "final"'}, status=400)
            qs = qs.filter(type=gtype)
        if dt:
            qs = qs.filter(date=dt)
        if term:
            qs = qs.filter(term=term)

        data = qs.values('student_id', 'score', 'comment')
        return Response(list(data))


# =========================
# Dashboards / Parent
# =========================

class TeacherDashViewSet(viewsets.ViewSet):
    permission_classes = [permissions.IsAuthenticated]

    @action(detail=False, methods=['get'], url_path='classes/me')
    def my_classes(self, request):
        u = request.user
        if getattr(u, 'role', None) != 'teacher':
            return Response([])
        try:
            t = u.teacher_profile
        except Teacher.DoesNotExist:
            return Response([])
        classes = (SchoolClass.objects
                   .filter(Q(class_teacher=t) | Q(schedule__teacher=t))
                   .distinct()
                   .order_by('name'))
        return Response(SchoolClassSerializer(classes, many=True).data)


class ParentViewSet(viewsets.ViewSet):
    permission_classes = [permissions.IsAuthenticated]

    @action(detail=False, methods=['get'], url_path='children')
    def children(self, request):
        u = request.user
        if getattr(u, 'role', None) != 'parent':
            return Response([])
        child_ids = StudentGuardian.objects.filter(guardian=u).values_list('student_id', flat=True)
        kids = Student.objects.filter(id__in=child_ids).order_by('last_name', 'first_name')
        return Response(StudentSerializer(kids, many=True).data)

    @action(detail=False, methods=['get'], url_path='child/(?P<student_id>[^/.]+)/overview')
    def child_overview(self, request, student_id=None):
        u = request.user
        if getattr(u, 'role', None) != 'parent':
            return Response({'detail': 'Forbidden'}, status=403)
        if not StudentGuardian.objects.filter(guardian=u, student_id=student_id).exists():
            return Response({'detail': 'Forbidden'}, status=403)

        s = Student.objects.select_related('clazz').get(id=student_id)
        timetable = ScheduleEntry.objects.filter(clazz=s.clazz).order_by('weekday', 'start_time')

        # latest week Mon..Sat
        today = date.today()
        start = today - timedelta(days=today.weekday())
        end = start + timedelta(days=5)
        latest_att = Attendance.objects.filter(student=s, date__range=(start, end))

        # ---- Average-based summary (no legacy GPA) ----
        subject_ids = _subjects_for_class(s.clazz_id) if s.clazz_id else list(Subject.objects.values_list('id', flat=True))
        names = {sub.id: sub.name for sub in Subject.objects.filter(id__in=subject_ids)}

        grades_summary = {}   # for the current JS
        subject_scores = {}   # simpler mapping (optional)
        scores_for_overall = []

        for sid in subject_ids:
            exam_avg, final_avg, subject_avg = _subject_breakdown(s.id, sid, term=None)
            # show only if there is at least one score
            if exam_avg is not None or final_avg is not None:
                nm = names.get(sid, f"Subject #{sid}")
                grades_summary[nm] = {
                    "exam_avg": exam_avg,
                    "final_avg": final_avg,
                    "subject_avg": subject_avg,
                    # keep UI-compatible key:
                    "gpa_subject": subject_avg,
                }
            # representative score for overall
            rep = _subject_score_for_student(s.id, sid, term=None)
            if rep is not None:
                subject_scores[nm] = round(rep, 2)
                scores_for_overall.append(rep)

        avg_overall = round(sum(scores_for_overall) / len(scores_for_overall), 2) if scores_for_overall else 0.0

        # Rank inside the class using the same averaging rule
        ranking = SchoolClassViewSet().average_ranking(request, pk=s.clazz_id).data['ranking'] if s.clazz_id else []
        my_row = next((r for r in ranking if r['student_id'] == s.id), None)
        my_rank = my_row['rank'] if my_row else None
        class_size = s.clazz.students.count() if s.clazz else 0

        payload = {
            'student': StudentSerializer(s).data,
            'class_name': s.clazz.name if s.clazz else '',
            'timetable': ScheduleEntrySerializer(timetable, many=True).data,
            'latest_week_attendance': AttendanceSerializer(latest_att, many=True).data,

            # Average-centric fields (new + backward compatible):
            'subject_scores': subject_scores,   # { "Matematika": 4.25, ... }
            'avg_overall': avg_overall,         # e.g., 4.37
            'grades_summary': grades_summary,   # used by current JS to build the table
            'gpa_overall': avg_overall,         # keep old key so the badge shows a number

            'class_rank': my_rank,
            'class_size': class_size
        }
        return Response(payload)


class GradeScaleViewSet(viewsets.ModelViewSet):
    """
    Retained for compatibility with existing routes; not used by average logic.
    """
    queryset = GradeScale.objects.all()
    serializer_class = GradeScaleSerializer
    permission_classes = [permissions.IsAuthenticated, IsAdminOrRegistrarWrite]


class GPAConfigViewSet(viewsets.ModelViewSet):
    """
    Retained for compatibility with existing routes; not used by average logic.
    """
    queryset = GPAConfig.objects.all()
    serializer_class = GPAConfigSerializer
    permission_classes = [permissions.IsAuthenticated, IsAdminOrRegistrarWrite]


# =========================
# READ-ONLY "Directory" APIs
# =========================

class ClassDirectoryViewSet(viewsets.ReadOnlyModelViewSet):
    """
    Lightweight classes list with student counts & teacher name
    (safe for directory page).
    """
    queryset = (SchoolClass.objects
                .all()
                .annotate(students_count=Count("students"))
                .order_by('name'))
    serializer_class = ClassMiniSerializer
    permission_classes = [permissions.IsAuthenticated]

    @action(detail=True, methods=["get"])
    def students(self, request, pk=None):
        qs = Student.objects.filter(clazz_id=pk).select_related("clazz")
        return Response(StudentLiteSerializer(qs, many=True).data)


class StudentDirectoryViewSet(viewsets.ReadOnlyModelViewSet):
    """
    Global student search across the school.
    """
    queryset = Student.objects.select_related("clazz").all()
    serializer_class = StudentLiteSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        qs = super().get_queryset()
        q = self.request.query_params.get("q")
        if q:
            qs = qs.filter(
                Q(first_name__icontains=q) |
                Q(last_name__icontains=q) |
                Q(clazz__name__icontains=q) |
                Q(parent_name__icontains=q) |
                Q(parent_phone__icontains=q)
            )
        return qs.order_by("last_name", "first_name")


# =========================
# OPERATOR one-shot enroll endpoint
# =========================

def _clean_phone(p: str) -> str:
    """Normalize to +998… (digits only) with leading +."""
    if not p:
        return ''
    digits = ''.join(ch for ch in p if ch.isdigit() or ch == '+')
    digits = ''.join(ch for ch in digits if ch.isdigit())  # keep only digits
    if not digits:
        return ''
    if digits.startswith('998'):
        return '+' + digits
    return '+' + digits


class OperatorEnrollView(APIView):
    """
    POST /api/operator/enroll/
    {
      "first_name": "Ali", "last_name": "Karimov",
      "gender": "m|f",             (optional)
      "dob": "YYYY-MM-DD",         (optional)
      "class_id": 12,              (required)
      "parent_name": "Karim aka",  (optional)
      "phone1": "+998901112233",   (required) -> parent login (User.phone)
      "phone2": "+998907778899"    (optional)
    }
    """
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        role = getattr(request.user, 'role', '')
        if role not in ('admin', 'registrar', 'operator'):
            return Response({'detail': 'Forbidden'}, status=403)

        d = request.data
        first_name = (d.get('first_name') or '').strip()
        last_name  = (d.get('last_name')  or '').strip()
        class_id   = d.get('class_id')
        parent_name= (d.get('parent_name') or '').strip()
        phone1     = _clean_phone(d.get('phone1') or '')
        phone2     = _clean_phone(d.get('phone2') or '')
        dob        = d.get('dob') or None
        gender     = d.get('gender') or 'm'

        if not first_name or not last_name or not class_id or not phone1:
            return Response({'detail': 'first_name, last_name, class_id, phone1 are required'}, status=400)

        try:
            clazz = SchoolClass.objects.get(id=class_id)
        except SchoolClass.DoesNotExist:
            return Response({'detail':'Class not found'}, status=404)

        temp_password = None
        parent_user, created = User.objects.get_or_create(
            phone=phone1,
            defaults={
                'first_name': parent_name or 'Ota-ona',
                'last_name': '',
            }
        )

        if getattr(parent_user, 'role', '') != 'parent':
            parent_user.role = 'parent'
        if created:
            import secrets
            temp_password = secrets.token_urlsafe(6)
            parent_user.set_password(temp_password)
        parent_user.save()

        s = Student.objects.create(
            first_name=first_name,
            last_name=last_name,
            dob=dob,
            gender=gender,
            clazz=clazz,
            parent_name=parent_name,
            parent_phone=phone1,
            address='',
            status='active',
        )

        StudentGuardian.objects.get_or_create(student=s, guardian=parent_user)

        return Response({
            'student_id': s.id,
            'class_name': clazz.name,
            'parent_username': phone1,
            'temp_password': temp_password,
        }, status=201)


# =========================
# School statistics API (for analytics page)
# =========================

class SchoolStatsView(APIView):
    """
    GET /api/stats/school/
    Returns:
    {
      "totals": {"students": int, "classes": int, "teachers": int, "active_students": int},
      "classes": [{"id": int, "name": str, "students_count": int}],
      "registrations": {
        "year": <int>,
        "available": true|false,
        "monthly": [{"month": "YYYY-MM", "count": int}],
        "total": int
      }
    }
    """
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        role = getattr(request.user, "role", "")
        if role not in ("admin", "registrar", "operator", "teacher"):
            return Response({"detail": "Forbidden"}, status=403)

        # Totals
        field_names = {f.name for f in Student._meta.get_fields()}
        has_status = "status" in field_names
        students_q = Student.objects.all()
        active_q = Student.objects.filter(status="active") if has_status else students_q

        totals = {
            "students": students_q.count(),
            "active_students": active_q.count(),
            "classes": SchoolClass.objects.count(),
            "teachers": Teacher.objects.count(),
        }

        # Classes with student counts
        classes = (
            SchoolClass.objects
            .annotate(students_count=Count("students"))
            .order_by("name")
            .values("id", "name", "students_count")
        )

        # Registrations this year — best-effort auto date field
        year = date.today().year
        date_candidates = [
            "enrolled_at", "enrolled_date", "admission_date",
            "registered_at", "created_at", "created", "date_joined",
        ]
        date_fields = {
            f.name for f in Student._meta.get_fields()
            if isinstance(f, (models.DateField, models.DateTimeField))
        }
        date_field = next((d for d in date_candidates if d in date_fields), None)

        registrations = {"year": year, "available": bool(date_field), "monthly": [], "total": 0}
        if date_field:
            qs = (Student.objects
                  .filter(**{f"{date_field}__year": year})
                  .annotate(m=TruncMonth(date_field))
                  .values("m")
                  .annotate(n=Count("id"))
                  .order_by("m"))
            monthly = [{"month": (row["m"].strftime("%Y-%m") if row["m"] else None),
                        "count": row["n"]} for row in qs]
            registrations["monthly"] = monthly
            registrations["total"] = sum(x["count"] for x in monthly)

        return Response({
            "totals": totals,
            "classes": list(classes),
            "registrations": registrations,
        })


# === Staff directory & password management (non-parents) ===

class StaffDirectoryView(APIView):
    """
    GET /api/staff/directory/
    Returns a flat list of all non-parent users (teachers + other staff).
    """
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        role = getattr(request.user, 'role', '')
        if role not in ('admin', 'registrar', 'operator'):
            return Response({'detail': 'Forbidden'}, status=403)

        # All users except parents
        users = (User.objects
                 .exclude(role='parent')
                 .order_by('last_name', 'first_name'))

        # Map teacher profile by user_id to enrich specialty
        teacher_by_user = {
            t.user_id: t
            for t in Teacher.objects.select_related('user', 'specialty').filter(user_id__in=[u.id for u in users])
        }

        rows = []
        for u in users:
            t = teacher_by_user.get(u.id)
            specialty_name = ''
            if t and getattr(t, 'specialty', None):
                specialty_name = getattr(t.specialty, 'name', '') or getattr(t.specialty, 'title', '')

            rows.append({
                'user_id': u.id,
                'role': getattr(u, 'role', '') or '',
                'first_name': getattr(u, 'first_name', '') or '',
                'last_name': getattr(u, 'last_name', '') or '',
                'phone': getattr(u, 'phone', '') or getattr(u, 'username', ''),
                'teacher_id': getattr(t, 'id', None),
                'specialty': specialty_name,
            })
        return Response(rows)


class StaffSetPasswordView(APIView):
    """
    POST /api/staff/set-password/
    { "user_id": <int>, "password": "<new_password>" }
    """
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        role = getattr(request.user, 'role', '')
        if role not in ('admin', 'registrar', 'operator'):
            return Response({'detail': 'Forbidden'}, status=403)

        user_id = request.data.get('user_id')
        password = (request.data.get('password') or '').strip()

        if not user_id or not password:
            return Response({'detail': 'user_id and password are required'}, status=400)
        if len(password) < 6:
            return Response({'detail': 'Parol uzunligi kamida 6 belgi bo‘lishi kerak'}, status=400)

        try:
            u = User.objects.get(id=user_id)
        except User.DoesNotExist:
            return Response({'detail': 'User not found'}, status=404)

        # Do not allow changing parent passwords via this endpoint
        if getattr(u, 'role', '') == 'parent':
            return Response({'detail': 'Forbidden for parents'}, status=403)

        u.set_password(password)
        u.save()
        return Response({'ok': True})


# =========================
# Parents directory (no email field in payload)
# =========================

class ParentDirectoryViewSet(viewsets.ViewSet):
    permission_classes = [permissions.IsAuthenticated]

    def list(self, request):
        try:
            role = getattr(request.user, "role", "")
            if role not in ("admin", "registrar", "operator"):
                return Response([], status=200)

            parents = list(
                User.objects
                .filter(role="parent")
                .only("id", "first_name", "last_name", "phone")
                .order_by("last_name", "first_name")
            )
            pids = [p.id for p in parents]

            # Gather children via forward FKs (robust to related_name changes)
            links = (
                StudentGuardian.objects
                .select_related("student__clazz")
                .filter(guardian_id__in=pids)
                .order_by("student__last_name", "student__first_name")
            )

            kid_map = {pid: [] for pid in pids}
            for link in links:
                s = link.student
                if not s:
                    continue
                kid_map.setdefault(link.guardian_id, []).append({
                    "id": s.id,
                    "first_name": s.first_name,
                    "last_name": s.last_name,
                    "class": (s.clazz.name if getattr(s, "clazz", None) else None),
                })

            rows = []
            for u in parents:
                rows.append({
                    "id": u.id,
                    "first_name": u.first_name or "",
                    "last_name":  u.last_name  or "",
                    "phone": getattr(u, "phone", "") or "",
                    "children": kid_map.get(u.id, []),
                })

            return Response(rows)

        except Exception as e:
            traceback.print_exc()
            return Response({"error": str(e)}, status=500)

    @action(detail=True, methods=["post"], url_path="set-password")
    def set_password(self, request, pk=None):
        try:
            role = getattr(request.user, "role", "")
            if role not in ("admin", "registrar", "operator"):
                return Response({"detail": "Forbidden"}, status=403)

            password = (request.data.get("password") or "").strip()
            if len(password) < 6:
                return Response({"detail": "Parol uzunligi kamida 6 belgi bo‘lishi kerak"}, status=400)

            parent = User.objects.get(pk=pk, role="parent")
            parent.set_password(password)
            parent.save(update_fields=["password"])
            return Response({"status": "password_changed"})
        except Exception as e:
            traceback.print_exc()
            return Response({"error": str(e)}, status=500)
