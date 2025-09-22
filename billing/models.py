from django.db import models
from django.utils import timezone
from decimal import Decimal

from academics.models import SchoolClass, Student

AMT = dict(max_digits=12, decimal_places=0, default=0)

class TuitionPlan(models.Model):
    clazz = models.OneToOneField(SchoolClass, on_delete=models.CASCADE, related_name='tuition_plan')
    amount_uzs = models.DecimalField(**AMT)

    def __str__(self):
        return f"{self.clazz.name}: {self.amount_uzs} so'm"

class Invoice(models.Model):
    STATUS = (
        ('unpaid', 'Toʻlanmagan'),
        ('partial', 'Qisman toʻlangan'),
        ('paid', 'Toʻlangan'),
    )
    student = models.ForeignKey(Student, on_delete=models.CASCADE, related_name='invoices')
    month = models.DateField(help_text='Bir oylik hisob (oyning 1-kuni sifatida saqlanadi)')
    amount_uzs = models.DecimalField(**AMT)
    discount_uzs = models.DecimalField(**AMT)
    penalty_uzs = models.DecimalField(**AMT)
    paid_uzs = models.DecimalField(**AMT)
    status = models.CharField(max_length=10, choices=STATUS, default='unpaid')
    due_date = models.DateField(null=True, blank=True)
    notes = models.CharField(max_length=255, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        unique_together = (('student', 'month'),)
        indexes = [
            models.Index(fields=['student', 'month']),
            models.Index(fields=['status', 'month'])
        ]
        ordering = ['-month', 'student_id']

    @property
    def total_due_uzs(self) -> Decimal:
        return (self.amount_uzs - self.discount_uzs + self.penalty_uzs)

    @property
    def balance_uzs(self) -> Decimal:
        return self.total_due_uzs - self.paid_uzs

    def recompute_status(self):
        bal = self.balance_uzs
        if bal <= 0:
            self.status = 'paid'
        elif self.paid_uzs > 0:
            self.status = 'partial'
        else:
            self.status = 'unpaid'

class Payment(models.Model):
    METHOD = (
        ('cash', 'Naqd'),
        ('card', 'Karta'),
        ('transfer', 'Oʻtkazma'),
    )
    student = models.ForeignKey(Student, on_delete=models.CASCADE, related_name='payments')
    invoice = models.ForeignKey(Invoice, on_delete=models.CASCADE, related_name='payments')
    amount_uzs = models.DecimalField(**AMT)
    method = models.CharField(max_length=10, choices=METHOD, default='cash')
    paid_at = models.DateTimeField(default=timezone.now)
    receipt_no = models.CharField(max_length=32, blank=True)
    note = models.CharField(max_length=255, blank=True)

    class Meta:
        indexes = [
            models.Index(fields=['invoice', 'paid_at'])
        ]
        ordering = ['-paid_at']

    def save(self, *args, **kwargs):
        super().save(*args, **kwargs)
        # Sync invoice totals after payment save
        inv = self.invoice
        agg = inv.payments.aggregate(total=models.Sum('amount_uzs'))
        inv.paid_uzs = agg['total'] or 0
        inv.recompute_status()
        inv.save(update_fields=['paid_uzs', 'status', 'updated_at'])

# billing/models.py (append)
class SalaryPayout(models.Model):
    """
    Minimal checklist row for salaries.
    If you want to link real staff later, add teacher = models.ForeignKey(Teacher, ...)
    """
    month = models.DateField(help_text="Oyning birinchi kuni sifatida saqlanadi (YYYY-MM-01)")
    fio = models.CharField(max_length=200)          # "F.I.O"
    date = models.DateField()                       # planned or actual date
    paid = models.BooleanField(default=False)

    class Meta:
        indexes = [
            models.Index(fields=['month', 'fio', 'date']),
        ]
        unique_together = (('month', 'fio', 'date'),)
        ordering = ['fio', 'date']

    def __str__(self):
        return f"{self.month:%Y-%m} | {self.fio} | {self.date} | {'paid' if self.paid else 'unpaid'}"

