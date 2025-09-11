from rest_framework import serializers
from accounts.models import User
from .models import (
    Subject, Teacher, SchoolClass, Student,
    StudentGuardian, ScheduleEntry, Attendance, Grade, GradeScale, GPAConfig
)


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
        u = obj.user
        full = f"{u.first_name} {u.last_name}".strip()
        return full or str(u)

    def get_user_phone(self, obj):
        return getattr(obj.user, 'phone', '')

    def get_specialty_name(self, obj):
        return obj.specialty.name if obj.specialty else ''


class SchoolClassSerializer(serializers.ModelSerializer):
    class_teacher_name = serializers.SerializerMethodField()
    student_count = serializers.SerializerMethodField()

    class Meta:
        model = SchoolClass
        fields = ('id', 'name', 'level', 'class_teacher', 'capacity',
                  'class_teacher_name', 'student_count')

    def get_class_teacher_name(self, obj):
        t = obj.class_teacher
        if not t:
            return ''
        u = t.user
        full = f"{u.last_name or ''} {u.first_name or ''}".strip()
        return full or str(u)

    def get_student_count(self, obj):
        return obj.students.count()


class StudentSerializer(serializers.ModelSerializer):
    class Meta:
        model = Student
        fields = (
            'id', 'first_name', 'last_name', 'dob', 'gender', 'clazz',
            'parent_name', 'parent_phone', 'address', 'status'
        )


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
        return f"{obj.teacher.user.last_name} {obj.teacher.user.first_name}" if obj.teacher else ''


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
