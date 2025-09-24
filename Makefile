mig:
	python manage.py makemigrations
	python manage.py migrate

user:
	python3 manage.py createsuperuser

celery:
	celery -A root worker --loglevel=info


beat:
	celery -A root beat -l info

flush:
	python3 manage.py flush --no-input