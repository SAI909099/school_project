from rest_framework.permissions import BasePermission, SAFE_METHODS

class IsAdminOrAccountantWrite(BasePermission):
    """Everyone authenticated can read, only admin/accountant can write."""
    def has_permission(self, request, view):
        u = request.user
        if not (u and u.is_authenticated):
            return False
        if request.method in SAFE_METHODS:
            return True
        return u.role in ('admin', 'accountant')