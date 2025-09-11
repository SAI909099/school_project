from django.contrib import admin
from django.urls import path, include
from drf_spectacular.views import SpectacularAPIView, SpectacularSwaggerView
from django.views.generic import TemplateView


urlpatterns = [
    path('admin/', admin.site.urls),

    # API schema & docs
    path('api/schema/', SpectacularAPIView.as_view(), name='schema'),
    path('api/docs/', SpectacularSwaggerView.as_view(url_name='schema'), name='swagger-ui'),

    # Apps
    path('api/auth/', include('accounts.urls')),
    path('api/', include('academics.urls')),
    path('api/billing/', include('billing.urls')),

]
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView

urlpatterns += [
    path("api/token/", TokenObtainPairView.as_view(), name="token_obtain_pair"),
    path("api/token/refresh/", TokenRefreshView.as_view(), name="token_refresh"),
]

from django.views.generic import TemplateView
urlpatterns += [
    path("login/", TemplateView.as_view(template_name="auth_login.html"), name="login"),
    path("dashboard/", TemplateView.as_view(template_name="admin-dashboard.html"), name="admin-dashboard"),

]
