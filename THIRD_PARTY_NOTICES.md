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

## Openverse media discovery

Rights-cleared third-party image discovery uses the public Openverse search service and follows the architecture of the WordPress Openverse open-source project.

- Project: https://github.com/WordPress/openverse
- Project license: MIT
- Purpose: discover openly licensed media only
- Allowed media rights in this application: Public Domain, CC0, CC BY, CC BY-SA

Each discovered media item keeps its own creator, landing page and license metadata. Openverse discovery does not override the copyright or attribution requirements of an individual media item.

## Personal Voice Clone

Personal voice cloning uses the same self-hosted VieNeu-TTS v3 engine above. Reference samples remain on the private server and are isolated by account-derived identifiers.

- Engine/model license: Apache License 2.0
- Reference sample: 3–8 seconds
- Use restriction in this application: the operator must confirm the sample is their own voice or a voice they are authorized to use
- Storage: private Docker volume; reference samples are never exposed through `/output`
