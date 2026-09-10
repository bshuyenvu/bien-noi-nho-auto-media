# Third-party notices

## VieNeu-TTS v3

Optional local Vietnamese speech synthesis is provided by VieNeu-TTS v3.3.0.

- Project: https://github.com/pnnbao97/VieNeu-TTS
- Model: https://huggingface.co/pnnbao-ump/VieNeu-TTS-v3-Turbo
- License: Apache License 2.0

VieNeu-TTS v4 is proprietary and is not installed or called by this project.

## Nodemailer

Optional SMTP email alerts use Nodemailer.

- Project: https://github.com/nodemailer/nodemailer
- Package: `nodemailer`
- License: MIT-0

## Local English → Vietnamese translation

Optional local translation fallback uses CTranslate2 with the Helsinki-NLP OPUS-MT English → Vietnamese model.

- Engine: https://github.com/OpenNMT/CTranslate2
- Engine license: MIT
- Model: https://huggingface.co/Helsinki-NLP/opus-mt-en-vi
- Model license: Apache License 2.0
- Runtime mode: CPU-only INT8; internal Docker network only

Health Content Studio treats this local machine translation as a review-required fallback; it is not considered verified medical translation.
