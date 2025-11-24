FROM python:3.10

# system packages
RUN apt update && apt install -y build-essential

# create app directory
WORKDIR /app

# install dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# copy project files
COPY . .

# expose backend port (internal)
EXPOSE 8000

CMD ["gunicorn", "school_project.wsgi:application", "--bind", "0.0.0.0:8000"]
