# Planet Teller – Online-Betrieb (z. B. Railway).
# Nur die App-Dateien kommen ins Abbild; Notizen, Sicherungen und Übergabe-Dateien bleiben lokal.
FROM python:3.12-slim
WORKDIR /app
COPY index.html app.js sync.js foods.js sw.js manifest.webmanifest icon.svg icon-180.png icon-512.png server.py ./
ENV PYTHONUNBUFFERED=1
CMD ["python", "-B", "server.py"]
