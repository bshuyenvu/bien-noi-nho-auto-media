import { randomUUID } from 'node:crypto';
import { all, db, run } from '../storage/db.js';

export type PipelineTemplateId =
  | 'health-story'
  | 'health-short'
  | 'podcast-story'
  | 'social-short'
  | 'comic-episode';

export type PipelineOutputKind = 'video' | 'short' | 'podcast' | 'comic' | 'thumbnail';
export type PipelineAspectRatio = '16:9' | '9:16' | '1:1';

export interface PipelineOutputProfile {
  id: string;
  kind: PipelineOutputKind;
  label: string;
  aspectRatio?: PipelineAspectRatio;
  width?: number;
  height?: number;
  targetSeconds?: number;
}

export interface PipelineTemplate {
  id: PipelineTemplateId;
  name: string;
  description: string;
  contentProfile: 'health' | 'life_truth' | 'life_tips' | 'event_commentary';
  researchRequired: boolean;
  medicalReviewRequired: boolean;
  defaultDurationSeconds: number;
  maxScenes: number;
  visualStyle: string;
  voiceStyle: string;
  outputs: PipelineOutputProfile[];
}

export type PipelineBeat = 'hook' | 'context' | 'evidence' | 'development' | 'takeaway' | 'cta';

export interface PipelineScene {
  index: number;
  beat: PipelineBeat;
  narration: string;
  needsEvidence: boolean;
  visualPromptSeed: string;
  videoPromptSeed: string;
}

export interface PipelinePlan {
  version: '2.0.0-alpha.1';
  template: PipelineTemplate;
  topic: string;
  seriesName?: string;
  episode?: number;
  sourceUrls: string[];
  scenes: PipelineScene[];
  outputs: PipelineOutputProfile[];
  gates: {
    research: 'required' | 'optional';
    medicalReview: 'required' | 'optional';
    copyrightReview: 'required';
    humanReviewBeforePublish: 'required';
  };
  stages: Array<{
    id: string;
    label: string;
    required: boolean;
  }>;
}

export interface CreatePipelineProjectInput {
  ownerId: string;
  templateId: PipelineTemplateId;
  topic: string;
  script: string;
  seriesName?: string;
  episode?: number;
  sourceUrls?: string[];
  outputIds?: string[];
}

export interface PipelineProject {
  id: string;
  ownerId: string;
  templateId: PipelineTemplateId;
  topic: string;
  script: string;
  seriesName?: string;
  episode?: number;
  status: 'planned' | 'prepared' | 'blocked' | 'review_required' | 'generation_ready';
  plan: PipelinePlan;
  createdAt: string;
  updatedAt: string;
}

const TEMPLATES: readonly PipelineTemplate[] = [
  {
    id: 'health-story',
    name: 'Chuyện Sức Khỏe Quanh Ta',
    description: 'Kể chuyện sức khỏe theo series, có research, kiểm tra y khoa và nhiều đầu ra.',
    contentProfile: 'health',
    researchRequired: true,
    medicalReviewRequired: true,
    defaultDurationSeconds: 180,
    maxScenes: 12,
    visualStyle: 'cinematic Vietnamese everyday life, original or rights-verified visuals',
    voiceStyle: 'podcast',
    outputs: [
      { id: 'video-16x9', kind: 'video', label: 'Video 16:9', aspectRatio: '16:9', width: 1920, height: 1080, targetSeconds: 180 },
      { id: 'short-9x16', kind: 'short', label: 'Short/Reels 9:16', aspectRatio: '9:16', width: 1080, height: 1920, targetSeconds: 60 },
      { id: 'podcast', kind: 'podcast', label: 'Podcast audio', targetSeconds: 180 },
      { id: 'comic', kind: 'comic', label: 'Episodic comic', aspectRatio: '1:1', width: 1080, height: 1080 },
      { id: 'thumbnail', kind: 'thumbnail', label: 'Cover/thumbnail', aspectRatio: '16:9', width: 1280, height: 720 },
    ],
  },
  {
    id: 'health-short',
    name: 'Health Short 60s',
    description: 'Video giáo dục sức khỏe ngắn, ưu tiên một thông điệp chính.',
    contentProfile: 'health',
    researchRequired: true,
    medicalReviewRequired: true,
    defaultDurationSeconds: 60,
    maxScenes: 8,
    visualStyle: 'clean medical explainer, original diagrams and rights-verified media',
    voiceStyle: 'news',
    outputs: [
      { id: 'short-9x16', kind: 'short', label: 'Short 9:16', aspectRatio: '9:16', width: 1080, height: 1920, targetSeconds: 60 },
      { id: 'video-16x9', kind: 'video', label: 'Video 16:9', aspectRatio: '16:9', width: 1920, height: 1080, targetSeconds: 60 },
      { id: 'thumbnail', kind: 'thumbnail', label: 'Thumbnail', aspectRatio: '16:9', width: 1280, height: 720 },
    ],
  },
  {
    id: 'podcast-story',
    name: 'Podcast Story',
    description: 'Kịch bản kể chuyện đời sống, voice-first và có thể sinh video phụ trợ.',
    contentProfile: 'life_truth',
    researchRequired: false,
    medicalReviewRequired: false,
    defaultDurationSeconds: 180,
    maxScenes: 10,
    visualStyle: 'warm cinematic illustration, consistent characters',
    voiceStyle: 'podcast',
    outputs: [
      { id: 'podcast', kind: 'podcast', label: 'Podcast audio', targetSeconds: 180 },
      { id: 'video-16x9', kind: 'video', label: 'Podcast video 16:9', aspectRatio: '16:9', width: 1920, height: 1080, targetSeconds: 180 },
      { id: 'short-9x16', kind: 'short', label: 'Teaser 9:16', aspectRatio: '9:16', width: 1080, height: 1920, targetSeconds: 45 },
    ],
  },
  {
    id: 'social-short',
    name: 'Social Short',
    description: 'Short-form content có hook nhanh, scene ngắn và caption rõ.',
    contentProfile: 'life_tips',
    researchRequired: false,
    medicalReviewRequired: false,
    defaultDurationSeconds: 45,
    maxScenes: 8,
    visualStyle: 'high-clarity social video, original visuals',
    voiceStyle: 'news',
    outputs: [
      { id: 'short-9x16', kind: 'short', label: 'Short 9:16', aspectRatio: '9:16', width: 1080, height: 1920, targetSeconds: 45 },
      { id: 'square-1x1', kind: 'short', label: 'Square 1:1', aspectRatio: '1:1', width: 1080, height: 1080, targetSeconds: 45 },
    ],
  },
  {
    id: 'comic-episode',
    name: 'Episodic Comic',
    description: 'Chuyển kịch bản thành chuỗi khung truyện có nhân vật và phong cách nhất quán.',
    contentProfile: 'life_truth',
    researchRequired: false,
    medicalReviewRequired: false,
    defaultDurationSeconds: 0,
    maxScenes: 12,
    visualStyle: 'episodic comic, consistent character bible, original artwork',
    voiceStyle: 'podcast',
    outputs: [
      { id: 'comic', kind: 'comic', label: 'Comic panels', aspectRatio: '1:1', width: 1080, height: 1080 },
      { id: 'thumbnail', kind: 'thumbnail', label: 'Episode cover', aspectRatio: '16:9', width: 1280, height: 720 },
    ],
  },
];

db.exec(`
CREATE TABLE IF NOT EXISTS content_studio_projects (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL,
  template_id TEXT NOT NULL,
  topic TEXT NOT NULL,
  script TEXT NOT NULL,
  series_name TEXT,
  episode INTEGER,
  status TEXT NOT NULL DEFAULT 'planned',
  plan_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_content_studio_projects_owner_created
ON content_studio_projects(owner_id, created_at DESC);
`);

const clean = (value: unknown, max: number) =>
  String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max);

function resolveTemplate(id: PipelineTemplateId): PipelineTemplate {
  const template = TEMPLATES.find((item) => item.id === id);
  if (!template) throw new Error(`Template không tồn tại: ${id}`);
  return template;
}

function sentenceChunks(script: string, maxScenes: number): string[] {
  const normalized = clean(script, 20000);
  const sentences = normalized
    .split(/(?<=[.!?…])\s+/u)
    .map((item) => item.trim())
    .filter(Boolean);

  if (!sentences.length) return [];

  const desired = Math.min(maxScenes, Math.max(Math.min(3, sentences.length), Math.ceil(normalized.length / 360)));
  const chunks: string[] = [];
  let bucket: string[] = [];
  let bucketLength = 0;
  const targetLength = Math.max(180, Math.ceil(normalized.length / desired));

  for (const sentence of sentences) {
    if (bucket.length && bucketLength + sentence.length > targetLength && chunks.length < maxScenes - 1) {
      chunks.push(bucket.join(' '));
      bucket = [];
      bucketLength = 0;
    }
    bucket.push(sentence);
    bucketLength += sentence.length + 1;
  }
  if (bucket.length) chunks.push(bucket.join(' '));

  return chunks.slice(0, maxScenes);
}

function beatFor(index: number, total: number, health: boolean): PipelineBeat {
  if (index === 0) return 'hook';
  if (index === total - 1) return total >= 4 ? 'cta' : 'takeaway';
  if (index === 1) return 'context';
  if (health && index % 3 === 2) return 'evidence';
  if (index >= total - 2) return 'takeaway';
  return 'development';
}

function scenePlan(template: PipelineTemplate, topic: string, script: string): PipelineScene[] {
  const chunks = sentenceChunks(script, template.maxScenes);
  return chunks.map((narration, index) => {
    const beat = beatFor(index, chunks.length, template.contentProfile === 'health');
    const needsEvidence =
      template.researchRequired &&
      (beat === 'evidence' || /\b\d+(?:[.,]\d+)?\s*(?:%|mg|g|kg|ml|mmhg|mmol|cm|mm)?\b/i.test(narration));

    const visualPromptSeed = [
      template.visualStyle,
      `topic: ${topic}`,
      `scene ${index + 1}/${chunks.length}`,
      `story beat: ${beat}`,
      'no logos, no copied artwork, no visible copyrighted text',
    ].join('; ');

    const videoPromptSeed = [
      `Use the scene keyframe for scene ${index + 1}`,
      'subtle natural motion',
      'stable identity and wardrobe',
      'no abrupt camera movement',
      `beat: ${beat}`,
    ].join('; ');

    return { index, beat, narration, needsEvidence, visualPromptSeed, videoPromptSeed };
  });
}

export function listPipelineTemplates(): PipelineTemplate[] {
  return TEMPLATES.map((template) => ({
    ...template,
    outputs: template.outputs.map((output) => ({ ...output })),
  }));
}

export function buildPipelinePlan(input: Omit<CreatePipelineProjectInput, 'ownerId'>): PipelinePlan {
  const template = resolveTemplate(input.templateId);
  const topic = clean(input.topic, 180);
  const script = clean(input.script, 20000);
  if (topic.length < 3) throw new Error('Chủ đề phải có ít nhất 3 ký tự.');
  if (script.length < 20) throw new Error('Kịch bản phải có ít nhất 20 ký tự.');

  const requestedOutputs = new Set(input.outputIds ?? []);
  const outputs = requestedOutputs.size
    ? template.outputs.filter((output) => requestedOutputs.has(output.id))
    : template.outputs;
  if (!outputs.length) throw new Error('Không có output profile hợp lệ cho template đã chọn.');

  const sourceUrls = (input.sourceUrls ?? [])
    .map((url) => clean(url, 2000))
    .filter(Boolean)
    .slice(0, 20);

  return {
    version: '2.0.0-alpha.1',
    template,
    topic,
    seriesName: clean(input.seriesName, 160) || undefined,
    episode: input.episode,
    sourceUrls,
    scenes: scenePlan(template, topic, script),
    outputs: outputs.map((output) => ({ ...output })),
    gates: {
      research: template.researchRequired ? 'required' : 'optional',
      medicalReview: template.medicalReviewRequired ? 'required' : 'optional',
      copyrightReview: 'required',
      humanReviewBeforePublish: 'required',
    },
    stages: [
      { id: 'research', label: 'Research & Source Check', required: template.researchRequired },
      { id: 'script', label: 'Script', required: true },
      { id: 'medical-review', label: 'Medical Review', required: template.medicalReviewRequired },
      { id: 'scene-plan', label: 'Scene & Storyboard Plan', required: true },
      { id: 'media', label: 'Image/Video Generation', required: true },
      { id: 'voice', label: 'Voice & Subtitle', required: outputs.some((x) => x.kind !== 'comic' && x.kind !== 'thumbnail') },
      { id: 'compose', label: 'Compose & Export', required: true },
      { id: 'copyright', label: 'Copyright & Provenance Review', required: true },
      { id: 'final-review', label: 'Human Final Review', required: true },
    ],
  };
}

export function createPipelineProject(input: CreatePipelineProjectInput): PipelineProject {
  const ownerId = clean(input.ownerId, 200);
  if (!ownerId) throw new Error('ownerId là bắt buộc.');
  const plan = buildPipelinePlan(input);
  const now = new Date().toISOString();
  const project: PipelineProject = {
    id: randomUUID(),
    ownerId,
    templateId: input.templateId,
    topic: plan.topic,
    script: clean(input.script, 20000),
    seriesName: plan.seriesName,
    episode: plan.episode,
    status: 'planned',
    plan,
    createdAt: now,
    updatedAt: now,
  };

  run(
    `INSERT INTO content_studio_projects
      (id,owner_id,template_id,topic,script,series_name,episode,status,plan_json,created_at,updated_at)
     VALUES(?,?,?,?,?,?,?,?,?,?,?)`,
    project.id,
    project.ownerId,
    project.templateId,
    project.topic,
    project.script,
    project.seriesName ?? null,
    project.episode ?? null,
    project.status,
    JSON.stringify(project.plan),
    project.createdAt,
    project.updatedAt,
  );
  return project;
}

type ProjectRow = {
  id: string;
  owner_id: string;
  template_id: PipelineTemplateId;
  topic: string;
  script: string;
  series_name: string | null;
  episode: number | null;
  status: PipelineProject['status'];
  plan_json: string;
  created_at: string;
  updated_at: string;
};

function rowToProject(row: ProjectRow): PipelineProject {
  return {
    id: row.id,
    ownerId: row.owner_id,
    templateId: row.template_id,
    topic: row.topic,
    script: row.script,
    seriesName: row.series_name || undefined,
    episode: row.episode ?? undefined,
    status: row.status,
    plan: JSON.parse(row.plan_json) as PipelinePlan,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function listPipelineProjects(ownerId: string, limit = 50): PipelineProject[] {
  const safeLimit = Math.max(1, Math.min(100, Math.trunc(limit)));
  return all<ProjectRow>(
    'SELECT * FROM content_studio_projects WHERE owner_id=? ORDER BY created_at DESC LIMIT ?',
    ownerId,
    safeLimit,
  ).map(rowToProject);
}

export function getPipelineProject(ownerId: string, id: string): PipelineProject | undefined {
  const row = all<ProjectRow>(
    'SELECT * FROM content_studio_projects WHERE owner_id=? AND id=? LIMIT 1',
    ownerId,
    id,
  )[0];
  return row ? rowToProject(row) : undefined;
}
