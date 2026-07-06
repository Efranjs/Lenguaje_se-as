FROM tensorflow/tensorflow:2.15.0

WORKDIR /app

# Dependencias del sistema para OpenCV y MediaPipe
RUN apt-get update && apt-get install -y --no-install-recommends \
    libgl1 \
    libglib2.0-0 \
    libgomp1 \
    && rm -rf /var/lib/apt/lists/*

# Instalar MediaPipe y OpenCV (TensorFlow ya viene en la imagen base)
RUN pip install --no-cache-dir \
    mediapipe==0.10.11 \
    opencv-python==4.9.0.80

# Resto de dependencias ligeras
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Código de la aplicación (siempre al final para mejor caché)
COPY app ./app

ENV LSP_VENDOR_DIR=/app/vendors/modelo_lstm_lsp
ENV PYTHONPATH=/app
ENV PYTHONUNBUFFERED=1

EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
