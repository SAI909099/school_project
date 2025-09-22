# billing/urls.py
from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import TuitionPlanViewSet, InvoiceViewSet, PaymentViewSet, StudentBillingViewSet, \
    SummaryView, PaymentsView, DebtorsView, SalariesListView, SalariesMarkView

# If you add salaries (below), also import SalariesListView, SalariesMarkView

router = DefaultRouter()
router.register(r'plans', TuitionPlanViewSet, basename='plans')
router.register(r'invoices', InvoiceViewSet, basename='invoices')
router.register(r'payments-model', PaymentViewSet, basename='payments-model')  # renamed
router.register(r'student', StudentBillingViewSet, basename='student-billing')

urlpatterns = [
    path('summary/',  SummaryView.as_view(),  name='billing-summary'),
    path('payments/', PaymentsView.as_view(), name='billing-payments'),   # used by moliya-chiqim.js
    path('debtors/',  DebtorsView.as_view(),  name='billing-debtors'),

    # If you add salaries endpoints:
    # path('salaries/',      SalariesListView.as_view(), name='billing-salaries'),
    # path('salaries/mark/', SalariesMarkView.as_view(), name='billing-salaries-mark'),

    path('', include(router.urls)),

    path('salaries/',      SalariesListView.as_view(), name='billing-salaries'),
    path('salaries/mark/', SalariesMarkView.as_view(), name='billing-salaries-mark'),

]
