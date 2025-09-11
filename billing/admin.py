from django.contrib import admin
from .models import TuitionPlan, Invoice, Payment

@admin.register(TuitionPlan)
class TuitionPlanAdmin(admin.ModelAdmin):
    list_display = ('clazz', 'amount_uzs')
    search_fields = ('clazz__name',)

@admin.register(Invoice)
class InvoiceAdmin(admin.ModelAdmin):
    list_display = ('student', 'month', 'amount_uzs', 'discount_uzs', 'penalty_uzs', 'paid_uzs', 'status', 'due_date')
    list_filter = ('status', 'month', 'student__clazz')
    search_fields = ('student__last_name', 'student__first_name')

@admin.register(Payment)
class PaymentAdmin(admin.ModelAdmin):
    list_display = ('student', 'invoice', 'amount_uzs', 'method', 'paid_at', 'receipt_no')
    list_filter = ('method', 'paid_at')
    search_fields = ('student__last_name', 'student__first_name', 'receipt_no')