FROM python:3.11-slim
WORKDIR /app
RUN pip install --no-cache-dir "vieneu==3.3.0"
COPY services/vieneu-tts/server.py /app/server.py
EXPOSE 7861
CMD ["python", "/app/server.py"]
