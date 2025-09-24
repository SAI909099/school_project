# billing/admin.py
from django.contrib import admin
from .models import TuitionPlan, Invoice, Payment, SalaryPayout, SalaryMonthLock
from academics.models import Teacher

@admin.register(TuitionPlan)
class TuitionPlanAdmin(admin.ModelAdmin):
    list_display = ("clazz", "amount_uzs")
    search_fields = ("clazz__name",)

@admin.register(Invoice)
class InvoiceAdmin(admin.ModelAdmin):
    list_display = ("student", "month", "amount_uzs", "discount_uzs", "penalty_uzs", "paid_uzs", "status", "due_date")
    list_filter = ("status", "month", "student__clazz")
    search_fields = ("student__first_name", "student__last_name", "student__clazz__name")
    date_hierarchy = "month"
    autocomplete_fields = ("student",)

@admin.register(Payment)
class PaymentAdmin(admin.ModelAdmin):
    list_display = ("student", "invoice", "amount_uzs", "method", "paid_at", "receipt_no")
    list_filter = ("method", "paid_at")
    search_fields = ("student__first_name", "student__last_name", "invoice__student__first_name", "invoice__student__last_name")
    autocomplete_fields = ("student", "invoice")
    date_hierarchy = "paid_at"

@admin.register(SalaryPayout)
class SalaryPayoutAdmin(admin.ModelAdmin):
    list_display = ("month", "user_full_name", "user_role", "teacher_specialty", "amount_uzs", "paid", "paid_at")
    list_filter = ("month", "paid", "user__role")
    search_fields = ("user__first_name", "user__last_name", "user__phone")
    ordering = ("-month", "user__last_name", "user__first_name")
    autocomplete_fields = ("user",)
    date_hierarchy = "month"

    def user_full_name(self, obj):
        u = obj.user
        full = f"{(u.first_name or '').strip()} {(u.last_name or '').strip()}".strip()
        return full or getattr(u, "phone", "") or str(u)
    user_full_name.short_description = "F.I.O"

    def user_role(self, obj):
        return getattr(obj.user, "role", "")
    user_role.short_description = "Rol"

    def teacher_specialty(self, obj):
        try:
            t = obj.user.teacher_profile
        except Teacher.DoesNotExist:
            return ""
        return t.specialty.name if getattr(t, "specialty", None) else ""
    teacher_specialty.short_description = "Mutaxassislik"

@admin.register(SalaryMonthLock)
class SalaryMonthLockAdmin(admin.ModelAdmin):
    list_display = ("month", "locked_at", "locked_by")
    date_hierarchy = "month"
    autocomplete_fields = ("locked_by",)


# billing/admin.py (append)
from django.contrib import admin
from .models import Expense

@admin.register(Expense)
class ExpenseAdmin(admin.ModelAdmin):
    list_display = ('date', 'category', 'amount_uzs', 'method', 'reason', 'created_by')
    list_filter  = ('category', 'method', 'date')
    search_fields = ('reason',)
