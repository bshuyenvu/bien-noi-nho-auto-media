FROM python:3.11-slim AS builder
ENV PIP_DISABLE_PIP_VERSION_CHECK=1 PIP_NO_CACHE_DIR=1
RUN python -m pip install --upgrade pip \
 && pip install --index-url https://download.pytorch.org/whl/cpu torch \
 && pip install "ctranslate2==4.8.2" "transformers>=4.44,<5" sentencepiece
RUN ct2-transformers-converter \
  --model Helsinki-NLP/opus-mt-en-vi \
  --output_dir /model \
  --quantization int8 \
  --copy_files source.spm target.spm vocab.json tokenizer_config.json generation_config.json

FROM python:3.11-slim AS runtime
ENV PIP_DISABLE_PIP_VERSION_CHECK=1 PIP_NO_CACHE_DIR=1 \
    TOKENIZERS_PARALLELISM=false TRANSFORMERS_OFFLINE=1 \
    LOCAL_TRANSLATE_MODEL=/model LOCAL_TRANSLATE_PORT=8080
RUN pip install "ctranslate2==4.8.2" sentencepiece fastapi uvicorn
COPY --from=builder /model /model
COPY services/local-translate/server.py /app/server.py
WORKDIR /app
USER 65534:65534
EXPOSE 8080
CMD ["python","/app/server.py"]