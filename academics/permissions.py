from rest_framework.permissions import BasePermission, SAFE_METHODS


class IsAdminOrRegistrarWrite(BasePermission):
    def has_permission(self, request, view):
        u = request.user
        if not (u and u.is_authenticated):
            return False
        if request.method in SAFE_METHODS:
            return True
        return getattr(u, 'role', None) in ('admin', 'registrar')


class IsAdminOrTeacherWrite(BasePermission):
    def has_permission(self, request, view):
        u = request.user
        if not (u and u.is_authenticated):
            return False
        if request.method in SAFE_METHODS:
            return True
        return getattr(u, 'role', None) in ('admin', 'teacher')

from rest_framework.permissions import BasePermission, SAFE_METHODS

class IsAdminRegistrarOperatorWrite(BasePermission):
    """
    Read: any logged in user.
    Write: admin, registrar, or operator.
    """
    def has_permission(self, request, view):
        u = request.user
        if not (u and u.is_authenticated):
            return False
        if request.method in SAFE_METHODS:
            return True
        return getattr(u, "role", None) in ("admin", "registrar", "operator")

