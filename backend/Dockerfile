# Production image for the TJSR backend — one image runs the API, the Celery
# worker, Celery beat, and the Telegram bot (compose picks the command).
#
# Build from the REPO ROOT (not backend/) so the fine-tuned classifier can be
# baked in:
#   docker build -f backend/Dockerfile -t tjsr-backend .
# Cross-build for the Raspberry Pi from an x86 machine:
#   docker buildx build --platform linux/arm64 -f backend/Dockerfile -t tjsr-backend:arm64 .
#
# Secrets are NEVER copied into this image. The root .dockerignore allowlists
# only app source + model weights; .env and firebase-service-account.json are
# supplied at runtime via env_file / volume mounts (see docker-compose.yml).

# bookworm pin: playwright 1.49's `install --with-deps` references pre-trixie
# apt package names (ttf-unifont vs fonts-unifont) and fails on newer Debian
FROM python:3.11-slim-bookworm

ENV PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PLAYWRIGHT_BROWSERS_PATH=/ms-playwright \
    HF_HOME=/app/hf_cache \
    ML_MODEL_DIR=/app/ml_model \
    CHROME_BIN=/usr/bin/chromium \
    CHROMEDRIVER_PATH=/usr/bin/chromedriver

WORKDIR /app

# System deps: chromium(+driver) for the Selenium scraper, libgomp1 for torch,
# xml libs for lxml/newspaper3k, curl for container healthchecks.
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    curl \
    wget \
    gnupg \
    chromium \
    chromium-driver \
    libxml2-dev \
    libxslt1-dev \
    libgomp1 \
    && rm -rf /var/lib/apt/lists/*

# CPU-only torch first: PyPI's default amd64 wheel drags in ~4 GB of CUDA
# libraries the Pi (and any CPU host) can't use. The pin matches requirements.txt.
COPY backend/requirements.txt .
RUN pip install torch==2.12.0 --index-url https://download.pytorch.org/whl/cpu \
    && pip install -r requirements.txt

# Bake model assets so the image is fully self-contained offline (none are secrets):
# spaCy NER model, Playwright chromium (playwright + crawl4ai scrapers),
# the MiniLM embedding model, and the fine-tuned DistilBERT classifier.
RUN python -m spacy download en_core_web_sm
RUN playwright install --with-deps chromium
RUN python -c "from sentence_transformers import SentenceTransformer; SentenceTransformer('all-MiniLM-L6-v2')"
COPY Classifier_Model_training/bert_finetuned /app/ml_model

COPY backend/app ./app
COPY backend/alembic.ini .

RUN useradd -m appuser && chown -R appuser:appuser /app /ms-playwright
USER appuser

EXPOSE 8000

# Default command: the API. docker-compose overrides this for worker/beat/bot.
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
