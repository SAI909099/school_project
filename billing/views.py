from datetime import date, timedelta
from django.db.models import Sum, Q
from rest_framework import viewsets, permissions, status
from rest_framework.decorators import action
from rest_framework.response import Response

from academics.models import Student, SchoolClass
from accounts.models import User
from .models import TuitionPlan, Invoice, Payment
from .serializers import TuitionPlanSerializer, InvoiceSerializer, PaymentSerializer
from .permissions import IsAdminOrAccountantWrite
from .utils import month_first, parse_month

class TuitionPlanViewSet(viewsets.ModelViewSet):
    queryset = TuitionPlan.objects.select_related('clazz').all()
    serializer_class = TuitionPlanSerializer
    permission_classes = [permissions.IsAuthenticated, IsAdminOrAccountantWrite]

class InvoiceViewSet(viewsets.ModelViewSet):
    queryset = Invoice.objects.select_related('student','student__clazz').all()
    serializer_class = InvoiceSerializer
    permission_classes = [permissions.IsAuthenticated, IsAdminOrAccountantWrite]

    def get_queryset(self):
        qs = super().get_queryset()
        u = self.request.user
        # Parents see only their children; Teachers see their class students; Others see all
        if u.role == 'parent':
            child_ids = u.children_links.values_list('student_id', flat=True)
            qs = qs.filter(student_id__in=child_ids)
        elif u.role == 'teacher':
            try:
                t = u.teacher_profile
                qs = qs.filter(Q(student__clazz__class_teacher=t) | Q(student__clazz__schedule__teacher=t))
            except Exception:
                qs = qs.none()
        # Filters
        month = self.request.query_params.get('month')  # YYYY-MM
        clazz = self.request.query_params.get('class')
        status_f = self.request.query_params.get('status')
        if month:
            qs = qs.filter(month=parse_month(month))
        if clazz:
            qs = qs.filter(student__clazz_id=clazz)
        if status_f:
            qs = qs.filter(status=status_f)
        return qs.distinct()

    @action(detail=False, methods=['post'])
    def generate(self, request):
        """Generate monthly invoices for all active students (optionally filter by class). Params: month=YYYY-MM, class, due_day=10, default_amount."""
        if request.user.role not in ('admin','accountant'):
            return Response({'detail': 'Forbidden'}, status=403)
        m = request.query_params.get('month')
        if not m:
            return Response({'detail': 'month=YYYY-MM required'}, status=400)
        month_dt = parse_month(m)
        class_id = request.query_params.get('class')
        due_day = int(request.query_params.get('due_day', 10))
        default_amount = int(request.query_params.get('default_amount', 0))

        students = Student.objects.filter(status='active')
        if class_id:
            students = students.filter(clazz_id=class_id)
        created, updated = 0, 0
        for s in students.select_related('clazz'):
            plan = getattr(s.clazz, 'tuition_plan', None)
            amt = plan.amount_uzs if plan else default_amount
            inv, was_created = Invoice.objects.get_or_create(
                student=s, month=month_dt,
                defaults={
                    'amount_uzs': amt, 'discount_uzs': 0, 'penalty_uzs': 0, 'paid_uzs': 0, 'status': 'unpaid',
                    'due_date': month_dt.replace(day=min(due_day, 28))
                }
            )
            if was_created:
                created += 1
            else:
                if inv.amount_uzs != amt and amt:
                    inv.amount_uzs = amt
                    inv.recompute_status()
                    inv.save()
                    updated += 1
        return Response({'ok': True, 'created': created, 'updated': updated})

    @action(detail=False, methods=['get'])
    def overdue(self, request):
        """List overdue invoices: status != paid AND due_date < today. Optional: month=YYYY-MM, class."""
        qs = self.get_queryset()
        today = date.today()
        qs = qs.filter(~Q(status='paid'), due_date__lt=today)
        month = request.query_params.get('month')
        if month:
            qs = qs.filter(month=parse_month(month))
        return Response(self.serializer_class(qs, many=True).data)

    @action(detail=True, methods=['post'])
    def recompute(self, request, pk=None):
        inv = self.get_object()
        inv.recompute_status()
        inv.save(update_fields=['status'])
        return Response(self.serializer_class(inv).data)

class PaymentViewSet(viewsets.ModelViewSet):
    queryset = Payment.objects.select_related('invoice','student','student__clazz').all()
    serializer_class = PaymentSerializer
    permission_classes = [permissions.IsAuthenticated, IsAdminOrAccountantWrite]

    def get_queryset(self):
        qs = super().get_queryset()
        u = self.request.user
        if u.role == 'parent':
            child_ids = u.children_links.values_list('student_id', flat=True)
            qs = qs.filter(student_id__in=child_ids)
        elif u.role == 'teacher':
            try:
                t = u.teacher_profile
                qs = qs.filter(Q(student__clazz__class_teacher=t) | Q(student__clazz__schedule__teacher=t))
            except Exception:
                qs = qs.none()
        # filters
        month = self.request.query_params.get('month')
        if month:
            qs = qs.filter(invoice__month=parse_month(month))
        student = self.request.query_params.get('student')
        if student:
            qs = qs.filter(student_id=student)
        return qs.distinct()

class StudentBillingViewSet(viewsets.ViewSet):
    permission_classes = [permissions.IsAuthenticated]

    def _can_view(self, request, student_id: int) -> bool:
        u = request.user
        if u.role in ('admin','accountant','registrar','teacher'):
            return True
        if u.role == 'parent':
            return u.children_links.filter(student_id=student_id).exists()
        return False

    @action(detail=False, methods=['get'], url_path='(?P<student_id>[^/.]+)/balance')
    def balance(self, request, student_id=None):
        if not self._can_view(request, student_id):
            return Response({'detail': 'Forbidden'}, status=403)
        inv = Invoice.objects.filter(student_id=student_id)
        totals = inv.aggregate(total_due=Sum(models.F('amount_uzs') - models.F('discount_uzs') + models.F('penalty_uzs')), total_paid=Sum('paid_uzs'))
        total_due = int(totals['total_due'] or 0)
        total_paid = int(totals['total_paid'] or 0)
        return Response({'student': int(student_id), 'total_due_uzs': total_due, 'total_paid_uzs': total_paid, 'balance_uzs': total_due - total_paid})

    @action(detail=False, methods=['get'], url_path='(?P<student_id>[^/.]+)/invoices')
    def invoices(self, request, student_id=None):
        if not self._can_view(request, student_id):
            return Response({'detail': 'Forbidden'}, status=403)
        qs = Invoice.objects.filter(student_id=student_id).order_by('-month')
        return Response(InvoiceSerializer(qs, many=True).data)

    @action(detail=False, methods=['get'], url_path='(?P<student_id>[^/.]+)/payments')
    def payments(self, request, student_id=None):
        if not self._can_view(request, student_id):
            return Response({'detail': 'Forbidden'}, status=403)
        qs = Payment.objects.filter(student_id=student_id).order_by('-paid_at')
        return Response(PaymentSerializer(qs, many=True).data)

from datetime import date
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated

class SummaryView(APIView):
    permission_classes = [IsAuthenticated]
    def get(self, request):
        # TODO: replace with real aggregation
        return Response({
            "income": 3000000,
            "expense": 450000,
            "balance": 2550000,
            "debtors_count": 12,
        })

class PaymentsView(APIView):
    permission_classes = [IsAuthenticated]
    def get(self, request):
        t = request.query_params.get('type', 'income')
        # TODO: replace with queryset results
        if t == 'income':
            data = [
                {"id": 1, "date": str(date.today()), "amount": 1000000, "payer_name": "Test.T"},
                {"id": 2, "date": str(date.today()), "amount": 900000, "payer_name": "Test.T"},
            ]
        else:
            data = [
                {"id": 10, "date": str(date.today()), "amount": 500000, "reason": "Ofis sarfi"},
                {"id": 11, "date": str(date.today()), "amount": 200000, "reason": "Kantselyariya"},
            ]
        return Response(data)

class DebtorsView(APIView):
    permission_classes = [IsAuthenticated]
    def get(self, request):
        # TODO: replace with real debt query
        data = [
            {"student_id": 1, "student_name": "Ali Aliyev", "class_name": "7-A", "parent_phone": "+998901112233", "debt": 150000},
            {"student_id": 2, "student_name": "Dilnoza Karimova", "class_name": "7-A", "parent_phone": "+998909998877", "debt": 200000},
        ]
        return Response(data)


# billing/views.py (append)
from rest_framework.permissions import IsAuthenticated
from .models import SalaryPayout
from .utils import parse_month  # you already use this in invoices/payments

class SalariesListView(APIView):
    """
    GET /api/billing/salaries/?month=YYYY-MM
    Returns: [{fio, date, paid}, ...]
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        m = request.query_params.get('month')
        if not m:
            # default: current month
            from datetime import date
            m = date.today().strftime('%Y-%m')
        mdt = parse_month(m)
        rows = SalaryPayout.objects.filter(month=mdt).order_by('fio', 'date')
        data = [{'fio': r.fio, 'date': r.date.isoformat(), 'paid': bool(r.paid)} for r in rows]
        return Response(data)

class SalariesMarkView(APIView):
    """
    POST /api/billing/salaries/mark/
    body: {"month": "YYYY-MM", "items": [{"fio": "...", "date": "YYYY-MM-DD", "paid": true}, ...]}
    Upserts rows by (month, fio, date).
    """
    permission_classes = [IsAuthenticated]

    def post(self, request):
        role = getattr(request.user, 'role', '')
        if role not in ('admin','accountant'):
            return Response({'detail': 'Forbidden'}, status=403)

        m = (request.data.get('month') or '').strip()
        items = request.data.get('items') or []
        if not m:
            return Response({'detail':'month required (YYYY-MM)'}, status=400)
        try:
            mdt = parse_month(m)
        except Exception:
            return Response({'detail':'invalid month format'}, status=400)

        created = 0
        updated = 0
        for it in items:
            fio = (it.get('fio') or '').strip()
            dt  = it.get('date')
            paid = bool(it.get('paid'))
            if not fio or not dt:
                continue
            try:
                # normalize (ensures date is valid)
                from datetime import date as _d
                y, mo, d = map(int, dt.split('-'))
                dtx = _d(y, mo, d)
            except Exception:
                continue

            obj, was_created = SalaryPayout.objects.update_or_create(
                month=mdt, fio=fio, date=dtx,
                defaults={'paid': paid}
            )
            created += 1 if was_created else 0
            updated += 0 if was_created else 1

        return Response({'ok': True, 'created': created, 'updated': updated})
