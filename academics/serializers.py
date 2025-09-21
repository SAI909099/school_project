# academics/serializers.py
from rest_framework import serializers
from accounts.models import User
from .models import (
    Subject, Teacher, SchoolClass, Student,
    StudentGuardian, ScheduleEntry, Attendance, Grade, GradeScale, GPAConfig
)

# =========================
# Core / CRUD serializers
# =========================

class SubjectSerializer(serializers.ModelSerializer):
    class Meta:
        model = Subject
        fields = ('id', 'name', 'code')


class TeacherSerializer(serializers.ModelSerializer):
    user = serializers.PrimaryKeyRelatedField(queryset=User.objects.all())
    user_full_name = serializers.SerializerMethodField()
    user_phone = serializers.SerializerMethodField()
    specialty_name = serializers.SerializerMethodField()

    class Meta:
        model = Teacher
        fields = (
            'id', 'user', 'user_full_name', 'user_phone',
            'specialty', 'specialty_name',
            'is_class_teacher', 'notes'
        )

    def get_user_full_name(self, obj):
        u = getattr(obj, 'user', None)
        if not u:
            return ''
        full = f"{(u.first_name or '').strip()} {(u.last_name or '').strip()}".strip()
        return full or str(u)

    def get_user_phone(self, obj):
        u = getattr(obj, 'user', None)
        return getattr(u, 'phone', '') if u else ''

    def get_specialty_name(self, obj):
        return obj.specialty.name if getattr(obj, 'specialty', None) else ''


class SchoolClassSerializer(serializers.ModelSerializer):
    class_teacher_name = serializers.SerializerMethodField()
    student_count = serializers.SerializerMethodField()

    class Meta:
        model = SchoolClass
        fields = (
            'id', 'name', 'level', 'class_teacher', 'capacity',
            'class_teacher_name', 'student_count'
        )

    def get_class_teacher_name(self, obj):
        t = getattr(obj, 'class_teacher', None)
        if not t:
            return ''
        u = getattr(t, 'user', None)
        if not u:
            return getattr(t, 'full_name', '') or ''
        # Use "First Last" consistently
        return f"{(u.first_name or '').strip()} {(u.last_name or '').strip()}".strip()

    def get_student_count(self, obj):
        # For CRUD views we compute on the fly; for directory views you have students_count via annotate.
        return obj.students.count()


class StudentSerializer(serializers.ModelSerializer):
    full_name = serializers.SerializerMethodField()

    class Meta:
        model = Student
        fields = (
            'id', 'first_name', 'last_name', 'dob', 'gender', 'clazz',
            'parent_name', 'parent_phone', 'address', 'status',
            'full_name'
        )

    def get_full_name(self, obj):
        return f"{(obj.first_name or '').strip()} {(obj.last_name or '').strip()}".strip()



class StudentGuardianSerializer(serializers.ModelSerializer):
    class Meta:
        model = StudentGuardian
        fields = ('id', 'student', 'guardian')


class ScheduleEntrySerializer(serializers.ModelSerializer):
    subject_name = serializers.CharField(source='subject.name', read_only=True)
    class_name = serializers.CharField(source='clazz.name', read_only=True)
    teacher_name = serializers.SerializerMethodField()

    class Meta:
        model = ScheduleEntry
        fields = (
            'id', 'clazz', 'class_name', 'subject', 'subject_name',
            'teacher', 'teacher_name', 'weekday', 'start_time', 'end_time', 'room'
        )

    def get_teacher_name(self, obj):
        t = getattr(obj, 'teacher', None)
        u = getattr(t, 'user', None) if t else None
        if not u:
            return ''
        return f"{(u.first_name or '').strip()} {(u.last_name or '').strip()}".strip()


class AttendanceSerializer(serializers.ModelSerializer):
    class Meta:
        model = Attendance
        fields = ('id', 'student', 'date', 'status', 'clazz', 'subject', 'teacher', 'note')


class GradeSerializer(serializers.ModelSerializer):
    class Meta:
        model = Grade
        fields = ('id', 'student', 'subject', 'teacher', 'date', 'term', 'type', 'score', 'comment')


class GradeScaleSerializer(serializers.ModelSerializer):
    class Meta:
        model = GradeScale
        fields = ('id', 'name', 'p2', 'p3', 'p4', 'p5', 'active')


class GPAConfigSerializer(serializers.ModelSerializer):
    class Meta:
        model = GPAConfig
        fields = ('id', 'name', 'weight_daily', 'weight_exam', 'weight_final', 'active')


# ----- Aggregated read model for Parents UI -----
class ChildOverviewSerializer(serializers.Serializer):
    student = StudentSerializer()
    class_name = serializers.CharField()
    timetable = ScheduleEntrySerializer(many=True)
    latest_week_attendance = AttendanceSerializer(many=True)
    grades_summary = serializers.DictField()
    gpa_overall = serializers.FloatField()
    class_rank = serializers.IntegerField(allow_null=True)
    class_size = serializers.IntegerField()


# =========================
# Directory / lightweight serializers (for list/search UIs)
# =========================

class ClassMiniSerializer(serializers.ModelSerializer):
    """
    Used by the directory (read-only) endpoints. Expects queryset annotated with:
      annotate(students_count=Count('students'))
    """
    class_teacher_name = serializers.SerializerMethodField()
    students_count = serializers.IntegerField(read_only=True)

    class Meta:
        model = SchoolClass
        fields = ("id", "name", "class_teacher_name", "students_count")

    def get_class_teacher_name(self, obj):
        t = getattr(obj, "class_teacher", None)
        if not t:
            return ""
        u = getattr(t, "user", None) or getattr(t, "account", None)
        if u:
            # "First Last"
            return f"{(getattr(u, 'first_name', '') or '').strip()} {(getattr(u, 'last_name', '') or '').strip()}".strip()
        return getattr(t, "full_name", "") or str(t)


class StudentLiteSerializer(serializers.ModelSerializer):
    class_name = serializers.CharField(source="clazz.name", read_only=True)
    class_teacher = serializers.SerializerMethodField()
    parent_name = serializers.SerializerMethodField()
    parent_phone = serializers.SerializerMethodField()
    full_name = serializers.SerializerMethodField()

    class Meta:
        model = Student
        fields = (
            "id", "first_name", "last_name", "full_name",
            "class_name", "class_teacher",
            "parent_name", "parent_phone"
        )

    def get_class_teacher(self, obj):
        t = getattr(obj.clazz, "class_teacher", None)
        u = getattr(t, "user", None) if t else None
        if u:
            return f"{(u.first_name or '').strip()} {(u.last_name or '').strip()}".strip()
        return getattr(t, "full_name", "") if t else ""

    def get_parent_name(self, obj):
        return getattr(obj, "parent_name", "") or getattr(obj, "guardian_name", "") or ""

    def get_parent_phone(self, obj):
        return getattr(obj, "parent_phone", "") or getattr(obj, "guardian_phone", "") or ""

    def get_full_name(self, obj):
        return f"{(obj.first_name or '').strip()} {(obj.last_name or '').strip()}".strip()

