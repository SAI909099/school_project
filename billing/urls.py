# billing/urls.py
from django.urls import path, include
from rest_framework.routers import DefaultRouter

from .views import (
    TuitionPlanViewSet,
    InvoiceViewSet,
    PaymentViewSet,           # CRUD for Payment model (to avoid clash with /payments/ report)
    StudentBillingViewSet,

    # Reports / summaries
    SummaryView,              # KPI summary (used on dashboard)
    PaymentsView,             # Report list (used by moliya-chiqim.js)
    DebtorsView,              # Debtors report

    # Salaries endpoints
    SalariesListView,         # GET list of salaries by month (moliya-oylik.js optional)
    SalariesStaffView,        # GET staff roster for a month (teachers & staff with roles)
    SalariesMarkView,         # POST mark/submit salaries for a month
    SalariesFinalizeView,     # POST finalize/lock salaries for a month

    # Manual expenses
    ExpenseViewSet,           # CRUD for Expense (manual chiqimlar)
)

router = DefaultRouter()
router.register(r'plans', TuitionPlanViewSet, basename='plans')
router.register(r'invoices', InvoiceViewSet, basename='invoices')
router.register(r'payments-model', PaymentViewSet, basename='payments-model')  # keep distinct from /payments/ report
router.register(r'student', StudentBillingViewSet, basename='student-billing')
router.register(r'expenses', ExpenseViewSet, basename='expenses')

urlpatterns = [
    # Reports / summaries
    path('summary/',  SummaryView.as_view(),  name='billing-summary'),
    path('payments/', PaymentsView.as_view(), name='billing-payments'),   # used by moliya-chiqim.js
    path('debtors/',  DebtorsView.as_view(),  name='billing-debtors'),

    # Salaries (used by moliya-oylik.js)
    path('salaries/',          SalariesListView.as_view(),     name='billing-salaries'),
    path('salaries/staff/',    SalariesStaffView.as_view(),    name='billing-salaries-staff'),
    path('salaries/mark/',     SalariesMarkView.as_view(),     name='billing-salaries-mark'),
    path('salaries/finalize/', SalariesFinalizeView.as_view(), name='billing-salaries-finalize'),


    # DRF router endpoints (CRUD)
    path('', include(router.urls)),
]
