from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import TuitionPlanViewSet, InvoiceViewSet, PaymentViewSet, StudentBillingViewSet, DebtorsView, PaymentsView, \
    SummaryView

router = DefaultRouter()
router.register('plans', TuitionPlanViewSet, basename='plans')
router.register('invoices', InvoiceViewSet, basename='invoices')
router.register('payments', PaymentViewSet, basename='payments')
router.register('student', StudentBillingViewSet, basename='student-billing')

urlpatterns = [
    path('', include(router.urls)),
    path('summary/', SummaryView.as_view()),
    path('payments/', PaymentsView.as_view()),
    path('debtors/', DebtorsView.as_view()),
]