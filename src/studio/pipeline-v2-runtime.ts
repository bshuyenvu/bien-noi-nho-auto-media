import { createHash, randomUUID } from 'node:crypto';
import { all, db, run } from '../storage/db.js';
import { medicalTopicEntityMatch, researchHealthTopic, type HealthResearchPack } from '../research/health.js';
import { searchOpenMediaForScript, type OpenMediaResult } from '../media/open-media.js';
import { craftShotPlan, type ShotCraftPlan } from '../video/shotcraft.js';
import { castVietnameseVoice } from '../tts/casting.js';
import { getPipelineProject, type PipelineOutputProfile, type PipelineProject } from './pipeline-v2.js';
import { smartScenePlan,rendererSummary,type SmartSceneIntent,type SmartSceneLayout,type SmartSceneRenderer } from './pipeline-v2-smart.js';

export type PipelineResearchStatus = 'not_required' | 'pass' | 'review' | 'block';
export type PipelineReviewStatus = 'not_required' | 'pending' | 'accepted' | 'needs_fix';
export type PipelineRuntimeStatus = 'prepared' | 'blocked' | 'generation_ready';

export interface CharacterBible {
  version: 'character-bible-v1';
  continuityKey: string;
  scope: 'episode';
  cast: Array<{
    id: string;
    role: string;
    promptAnchor: string;
  }>;
  continuityRules: string[];
}

export interface StyleBible {
  version: 'style-bible-v1';
  styleId: string;
  visualDirection: string;
  lighting: string;
  camera: string;
  typography: string;
  safety: string[];
  negativePrompt: string[];
}

export interface ScenePromptPack {
  sceneIndex: number;
  beat: string;
  narration: string;
  imagePrompt: string;
  videoPrompt: string;
  evidenceRequired: boolean;
  intent?: SmartSceneIntent;
  renderer?: SmartSceneRenderer;
  layout?: SmartSceneLayout;
  estimatedDurationSec?: number;
  subtitleChunks?: string[];
  rendererReason?: string;
}

export interface VoicePlan {
  mode: 'auto-cast';
  voice: string;
  style: string;
  reason: string;
  confidence: number;
  subtitleMode: 'tts-srt';
  subtitleLanguage: 'vi';
}

export interface ComposeOutputPlan extends PipelineOutputProfile {
  status: 'planned';
  renderer: 'ffmpeg' | 'hyperframes' | 'hybrid' | 'audio-export' | 'image-sequence';
  source: 'approved-scenes';
}

export interface PipelineResearchSnapshot {
  status: PipelineResearchStatus;
  topicEntityMatch: boolean;
  sourceCount: number;
  authoritativeSourceCount: number;
  sources: Array<{
    name: string;
    title: string;
    url: string;
    kind: string;
    authority: number;
    publishedAt?: string;
  }>;
  userSuppliedSourceUrls: string[];
  warnings: string[];
  note: string;
}

export interface PipelineRuntime {
  projectId: string;
  ownerId: string;
  status: PipelineRuntimeStatus;
  currentStage: string;
  research: PipelineResearchSnapshot;
  characterBible: CharacterBible;
  styleBible: StyleBible;
  scenePrompts: ScenePromptPack[];
  shotPlan: ShotCraftPlan;
  openMedia: OpenMediaResult;
  voicePlan: VoicePlan;
  composePlan: ComposeOutputPlan[];
  reviews: {
    medical: PipelineReviewStatus;
    copyright: PipelineReviewStatus;
    final: PipelineReviewStatus;
  };
  generationAllowed: boolean;
  publishAllowed: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface GenerationHandoff {
  version: 'generation-handoff-v1';
  projectId: string;
  topic: string;
  seriesName?: string;
  episode?: number;
  characterBible: CharacterBible;
  styleBible: StyleBible;
  scenes: ScenePromptPack[];
  shotPlan: ShotCraftPlan;
  mediaStrategy: {
    primary: 'generated-original';
    fallback: 'rights-verified-open-media-or-original-card';
    externalAutoUse: false;
    rightsVerifiedCandidates: OpenMediaResult['candidates'];
  };
  voicePlan: VoicePlan;
  outputs: ComposeOutputPlan[];
  gates: {
    research: PipelineResearchStatus;
    medicalReview: PipelineReviewStatus;
    copyrightBeforePublish: PipelineReviewStatus;
    humanFinalBeforePublish: PipelineReviewStatus;
  };
}

type RuntimeRow = {
  project_id: string;
  owner_id: string;
  status: PipelineRuntimeStatus;
  current_stage: string;
  research_json: string;
  character_bible_json: string;
  style_bible_json: string;
  scene_prompts_json: string;
  shot_plan_json: string;
  open_media_json: string;
  voice_plan_json: string;
  compose_plan_json: string;
  medical_review_status: PipelineReviewStatus;
  copyright_review_status: PipelineReviewStatus;
  final_review_status: PipelineReviewStatus;
  created_at: string;
  updated_at: string;
};

db.exec(`
CREATE TABLE IF NOT EXISTS content_studio_project_runtime (
  project_id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL,
  status TEXT NOT NULL,
  current_stage TEXT NOT NULL,
  research_json TEXT NOT NULL,
  character_bible_json TEXT NOT NULL,
  style_bible_json TEXT NOT NULL,
  scene_prompts_json TEXT NOT NULL,
  shot_plan_json TEXT NOT NULL,
  open_media_json TEXT NOT NULL,
  voice_plan_json TEXT NOT NULL,
  compose_plan_json TEXT NOT NULL,
  medical_review_status TEXT NOT NULL,
  copyright_review_status TEXT NOT NULL,
  final_review_status TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_content_studio_runtime_owner_updated
ON content_studio_project_runtime(owner_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS content_studio_project_review_events (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  owner_id TEXT NOT NULL,
  gate TEXT NOT NULL,
  status TEXT NOT NULL,
  actor TEXT NOT NULL,
  note TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_content_studio_review_events
ON content_studio_project_review_events(owner_id, project_id, created_at DESC);
`);

const clean = (value: unknown, max: number) =>
  String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max);

function hashKey(...parts: string[]) {
  return createHash('sha256').update(parts.join('|')).digest('hex').slice(0, 16);
}

function isHealthProject(project: PipelineProject) {
  return project.plan.gates.medicalReview === 'required' || project.templateId === 'health-story' || project.templateId === 'health-short';
}

export function buildCharacterBible(project: PipelineProject): CharacterBible {
  const continuityKey = hashKey(project.id, project.seriesName || '', String(project.episode || ''));
  const storyMode = project.templateId === 'health-story' || project.templateId === 'podcast-story';
  return {
    version: 'character-bible-v1',
    continuityKey,
    scope: 'episode',
    cast: storyMode
      ? [
          {
            id: 'lead',
            role: 'nhân vật trung tâm hư cấu',
            promptAnchor:
              'fictional Vietnamese adult, natural proportions, everyday modest clothing, consistent face hair wardrobe and age across every scene, no resemblance to a real public figure',
          },
          {
            id: 'support',
            role: 'người thân hoặc nhân vật hỗ trợ hư cấu',
            promptAnchor:
              'fictional Vietnamese supporting adult, visually distinct from lead, consistent face hair wardrobe and age across every scene, natural everyday appearance',
          },
        ]
      : [
          {
            id: 'presenter-subject',
            role: 'nhân vật minh họa hư cấu',
            promptAnchor:
              'fictional Vietnamese adult subject, neutral natural appearance, consistent identity across scenes, no resemblance to a real person',
          },
        ],
    continuityRules: [
      'Khóa khuôn mặt, độ tuổi, kiểu tóc và trang phục trong toàn bộ một tập.',
      'Không dùng logo thương hiệu, nhân vật nổi tiếng hoặc gương mặt người thật làm tham chiếu.',
      'Nếu đổi bối cảnh, chỉ đổi môi trường và hành động; không đổi nhận diện nhân vật.',
      'Không tạo chi tiết chấn thương đồ họa; nội dung y khoa phải mang tính giáo dục.',
    ],
  };
}

export function buildStyleBible(project: PipelineProject): StyleBible {
  const health = isHealthProject(project);
  return {
    version: 'style-bible-v1',
    styleId: hashKey(project.templateId, project.seriesName || project.templateId),
    visualDirection: project.plan.template.visualStyle,
    lighting: health
      ? 'natural soft daylight, calm clinical clarity, realistic skin tones'
      : 'natural cinematic light, warm but restrained contrast',
    camera: 'stable documentary framing, eye-level human perspective, subtle depth, no extreme lens distortion',
    typography: 'clean Vietnamese sans-serif overlays only in compositor; generated images should contain no text',
    safety: [
      'original composition only',
      'no copied artwork or artist imitation',
      'no trademarks or visible logos',
      'no graphic medical imagery',
      'medical visuals are educational and non-diagnostic',
    ],
    negativePrompt: [
      'watermark',
      'logo',
      'brand name',
      'copied poster',
      'celebrity likeness',
      'public figure likeness',
      'graphic wound',
      'gore',
      'distorted anatomy',
      'extra fingers',
      'unreadable embedded text',
    ],
  };
}

function buildScenePrompts(
  project: PipelineProject,
  characterBible: CharacterBible,
  styleBible: StyleBible,
): ScenePromptPack[] {
  const anchors = characterBible.cast.map((item) => item.promptAnchor).join('; ');
  return project.plan.scenes.map((scene) => {
    const smart=smartScenePlan({beat:scene.beat,narration:scene.narration,topic:project.topic,templateId:project.templateId,evidenceRequired:scene.needsEvidence});
    return {
      sceneIndex: scene.index,
      beat: scene.beat,
      narration: scene.narration,
      evidenceRequired: scene.needsEvidence,
      intent: smart.intent,
      renderer: smart.renderer,
      layout: smart.layout,
      estimatedDurationSec: smart.estimatedDurationSec,
      subtitleChunks: smart.subtitleChunks,
      rendererReason: smart.reason,
      imagePrompt: [
        'Create an original fictional scene.',
        styleBible.visualDirection,
        styleBible.lighting,
        styleBible.camera,
        anchors,
        `continuity key ${characterBible.continuityKey}`,
        `story beat ${scene.beat}`,
        `scene intent ${smart.intent}; layout ${smart.layout}; renderer preference ${smart.renderer}`,
        `visual intent: ${scene.visualPromptSeed}`,
        `narration context: ${clean(scene.narration, 700)}`,
        'no text inside generated image; no logo; no watermark; no copied artwork',
      ].join('; '),
      videoPrompt: [
        scene.videoPromptSeed,
        `continuity key ${characterBible.continuityKey}`,
        'preserve face, age, wardrobe and environment identity from the approved keyframe',
        'subtle natural body movement and environmental motion only',
        'no morphing, no identity drift, no abrupt camera move',
      ].join('; '),
    };
  });
}

function emptyOpenMedia(topic: string, warning: string): OpenMediaResult {
  return { query: topic, provider: 'open-media', candidates: [], warnings: [warning], sceneQueries: [] };
}

function researchSnapshot(
  project: PipelineProject,
  pack: HealthResearchPack | undefined,
  externalSkipped: boolean,
): PipelineResearchSnapshot {
  if (project.plan.gates.research !== 'required') {
    return {
      status: 'not_required',
      topicEntityMatch: true,
      sourceCount: 0,
      authoritativeSourceCount: 0,
      sources: [],
      userSuppliedSourceUrls: project.plan.sourceUrls,
      warnings: [],
      note: 'Template này không bắt buộc Research Gate.',
    };
  }

  if (!pack) {
    return {
      status: externalSkipped ? 'review' : 'block',
      topicEntityMatch: false,
      sourceCount: 0,
      authoritativeSourceCount: 0,
      sources: [],
      userSuppliedSourceUrls: project.plan.sourceUrls,
      warnings: [externalSkipped ? 'External research bị bỏ qua trong lần chuẩn bị này.' : 'Không tạo được Evidence Pack.'],
      note: 'Chưa có nguồn đủ để bác sĩ đối chiếu kịch bản.',
    };
  }

  const joined = pack.sources.map((source) => `${source.title} ${source.summary}`).join(' ');
  const topicEntityMatch = medicalTopicEntityMatch(project.topic, joined);
  const authoritativeSourceCount = pack.sources.filter((source) => source.authority >= 90).length;
  const sourceCount = pack.sources.length;
  const status: PipelineResearchStatus =
    !topicEntityMatch || sourceCount === 0
      ? 'block'
      : authoritativeSourceCount >= 1 && sourceCount >= 2
        ? 'pass'
        : 'review';

  return {
    status,
    topicEntityMatch,
    sourceCount,
    authoritativeSourceCount,
    sources: pack.sources.map((source) => ({
      name: source.name,
      title: source.title,
      url: source.url,
      kind: source.kind,
      authority: source.authority,
      publishedAt: source.publishedAt,
    })),
    userSuppliedSourceUrls: project.plan.sourceUrls,
    warnings: pack.warnings,
    note:
      'Evidence Pack này dùng để bác sĩ đối chiếu kịch bản; không tự động biến nội dung thành khuyến cáo y khoa đã được duyệt.',
  };
}

function composePlan(outputs: PipelineOutputProfile[],scenes:ScenePromptPack[]): ComposeOutputPlan[] {
  const summary=rendererSummary(scenes.map(scene=>({
    intent:scene.intent||'story',
    renderer:scene.renderer||'ffmpeg',
    layout:scene.layout||'cinematic',
    estimatedDurationSec:scene.estimatedDurationSec||3,
    subtitleChunks:scene.subtitleChunks||[],
    reason:scene.rendererReason||'',
  })));
  return outputs.map((output) => ({
    ...output,
    status: 'planned',
    renderer:
      output.kind === 'podcast'
        ? 'audio-export'
        : output.kind === 'comic' || output.kind === 'thumbnail'
          ? 'image-sequence'
          : summary.hybrid ? 'hybrid' : summary.hyperframes>0 ? 'hyperframes' : 'ffmpeg',
    source: 'approved-scenes',
  }));
}

function mapRow(row: RuntimeRow): PipelineRuntime {
  const research = JSON.parse(row.research_json) as PipelineResearchSnapshot;
  const reviews = {
    medical: row.medical_review_status,
    copyright: row.copyright_review_status,
    final: row.final_review_status,
  };
  const generationAllowed =
    research.status !== 'block' &&
    research.status !== 'review' &&
    (reviews.medical === 'not_required' || reviews.medical === 'accepted');
  const publishAllowed =
    generationAllowed &&
    reviews.copyright === 'accepted' &&
    reviews.final === 'accepted';

  return {
    projectId: row.project_id,
    ownerId: row.owner_id,
    status: row.status,
    currentStage: row.current_stage,
    research,
    characterBible: JSON.parse(row.character_bible_json),
    styleBible: JSON.parse(row.style_bible_json),
    scenePrompts: JSON.parse(row.scene_prompts_json),
    shotPlan: JSON.parse(row.shot_plan_json),
    openMedia: JSON.parse(row.open_media_json),
    voicePlan: JSON.parse(row.voice_plan_json),
    composePlan: JSON.parse(row.compose_plan_json),
    reviews,
    generationAllowed,
    publishAllowed,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function getPipelineRuntime(ownerId: string, projectId: string): PipelineRuntime | undefined {
  const row = all<RuntimeRow>(
    'SELECT * FROM content_studio_project_runtime WHERE owner_id=? AND project_id=? LIMIT 1',
    ownerId,
    projectId,
  )[0];
  return row ? mapRow(row) : undefined;
}

export function listPipelineReviewEvents(ownerId: string, projectId: string, limit = 30) {
  const safeLimit = Math.max(1, Math.min(100, Math.trunc(limit)));
  return all<{
    id: string;
    gate: string;
    status: string;
    actor: string;
    note?: string;
    created_at: string;
  }>(
    'SELECT id,gate,status,actor,note,created_at FROM content_studio_project_review_events WHERE owner_id=? AND project_id=? ORDER BY created_at DESC LIMIT ?',
    ownerId,
    projectId,
    safeLimit,
  ).map((row) => ({
    id: row.id,
    gate: row.gate,
    status: row.status,
    actor: row.actor,
    note: row.note || undefined,
    createdAt: row.created_at,
  }));
}

export async function preparePipelineProject(
  ownerId: string,
  projectId: string,
  options: { skipExternal?: boolean } = {},
): Promise<PipelineRuntime> {
  const project = getPipelineProject(ownerId, projectId);
  if (!project) throw new Error('Content Studio project not found');

  const characterBible = buildCharacterBible(project);
  const styleBible = buildStyleBible(project);
  const scenePrompts = buildScenePrompts(project, characterBible, styleBible);

  let pack: HealthResearchPack | undefined;
  if (project.plan.gates.research === 'required' && !options.skipExternal) {
    try {
      pack = await researchHealthTopic(project.topic, 5, project.plan.sourceUrls);
    } catch {
      pack = undefined;
    }
  }
  const research = researchSnapshot(project, pack, Boolean(options.skipExternal));

  let openMedia = emptyOpenMedia(
    project.topic,
    options.skipExternal
      ? 'External media discovery bị bỏ qua trong lần chuẩn bị này.'
      : 'Chưa chạy được open-media discovery.',
  );
  if (!options.skipExternal) {
    try {
      openMedia = await searchOpenMediaForScript(project.topic, project.script, Math.min(8, Math.max(1, project.plan.scenes.length)));
    } catch (error) {
      openMedia = emptyOpenMedia(
        project.topic,
        `Open media lookup: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  const durationSeconds =
    project.plan.outputs.find((output) => output.targetSeconds)?.targetSeconds ||
    project.plan.template.defaultDurationSeconds ||
    60;
  const shotPlan = craftShotPlan({
    text: project.script,
    imageCount: Math.max(1, project.plan.scenes.length),
    smartMatch: false,
    format: 'standard',
    audience: isHealthProject(project) ? 'patient' : 'general',
    durationSeconds,
    maxScenes: project.plan.template.maxScenes,
  });

  const cast = castVietnameseVoice({
    title: `${project.seriesName || project.plan.template.name}: ${project.topic}`,
    text: project.script,
    format: 'standard',
  });
  const voicePlan: VoicePlan = {
    mode: 'auto-cast',
    voice: cast.voice,
    style: project.plan.template.voiceStyle === 'podcast' ? 'podcast' : cast.style,
    reason: cast.reason,
    confidence: cast.confidence,
    subtitleMode: 'tts-srt',
    subtitleLanguage: 'vi',
  };

  const medicalReview: PipelineReviewStatus = project.plan.gates.medicalReview === 'required' ? 'pending' : 'not_required';
  const blocked = research.status === 'block';
  const generationAllowed = !blocked && research.status !== 'review' && medicalReview === 'not_required';
  const status: PipelineRuntimeStatus = blocked ? 'blocked' : generationAllowed ? 'generation_ready' : 'prepared';
  const currentStage = blocked
    ? 'research'
    : medicalReview === 'pending'
      ? 'medical-review'
      : 'generation-handoff';
  const now = new Date().toISOString();
  const existing = getPipelineRuntime(ownerId, projectId);
  const createdAt = existing?.createdAt || now;

  run(
    `INSERT INTO content_studio_project_runtime(
      project_id,owner_id,status,current_stage,research_json,character_bible_json,style_bible_json,
      scene_prompts_json,shot_plan_json,open_media_json,voice_plan_json,compose_plan_json,
      medical_review_status,copyright_review_status,final_review_status,created_at,updated_at
    ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    ON CONFLICT(project_id) DO UPDATE SET
      owner_id=excluded.owner_id,status=excluded.status,current_stage=excluded.current_stage,
      research_json=excluded.research_json,character_bible_json=excluded.character_bible_json,
      style_bible_json=excluded.style_bible_json,scene_prompts_json=excluded.scene_prompts_json,
      shot_plan_json=excluded.shot_plan_json,open_media_json=excluded.open_media_json,
      voice_plan_json=excluded.voice_plan_json,compose_plan_json=excluded.compose_plan_json,
      medical_review_status=excluded.medical_review_status,
      copyright_review_status=CASE WHEN content_studio_project_runtime.copyright_review_status='accepted' THEN 'pending' ELSE content_studio_project_runtime.copyright_review_status END,
      final_review_status=CASE WHEN content_studio_project_runtime.final_review_status='accepted' THEN 'pending' ELSE content_studio_project_runtime.final_review_status END,
      updated_at=excluded.updated_at`,
    projectId,
    ownerId,
    status,
    currentStage,
    JSON.stringify(research),
    JSON.stringify(characterBible),
    JSON.stringify(styleBible),
    JSON.stringify(scenePrompts),
    JSON.stringify(shotPlan),
    JSON.stringify(openMedia),
    JSON.stringify(voicePlan),
    JSON.stringify(composePlan(project.plan.outputs,scenePrompts)),
    medicalReview,
    'pending',
    'pending',
    createdAt,
    now,
  );

  run(
    'UPDATE content_studio_projects SET status=?,updated_at=? WHERE id=? AND owner_id=?',
    blocked ? 'blocked' : 'prepared',
    now,
    projectId,
    ownerId,
  );

  return getPipelineRuntime(ownerId, projectId)!;
}

export function setPipelineMedicalReview(input: {
  ownerId: string;
  projectId: string;
  status: 'accepted' | 'needs_fix';
  actor: string;
  note?: string;
}) {
  const project = getPipelineProject(input.ownerId, input.projectId);
  if (!project) throw new Error('Content Studio project not found');
  const runtime = getPipelineRuntime(input.ownerId, input.projectId);
  if (!runtime) throw new Error('Project chưa chạy prepare runtime');
  if (project.plan.gates.medicalReview !== 'required') throw new Error('Project này không yêu cầu Medical Review');
  if (input.status === 'accepted' && runtime.research.status !== 'pass') {
    throw new Error('Research Gate chưa PASS; chưa thể xác nhận Medical Review.');
  }
  const note = clean(input.note, 1200);
  if (input.status === 'needs_fix' && note.length < 5) {
    throw new Error('Medical Review needs_fix cần ghi chú cụ thể.');
  }

  const now = new Date().toISOString();
  const nextStatus: PipelineRuntimeStatus = input.status === 'accepted' ? 'generation_ready' : 'prepared';
  const nextStage = input.status === 'accepted' ? 'generation-handoff' : 'script';
  run(
    'UPDATE content_studio_project_runtime SET medical_review_status=?,status=?,current_stage=?,updated_at=? WHERE project_id=? AND owner_id=?',
    input.status,
    nextStatus,
    nextStage,
    now,
    input.projectId,
    input.ownerId,
  );
  run(
    'INSERT INTO content_studio_project_review_events(id,project_id,owner_id,gate,status,actor,note,created_at) VALUES(?,?,?,?,?,?,?,?)',
    randomUUID(),
    input.projectId,
    input.ownerId,
    'medical',
    input.status,
    clean(input.actor, 240),
    note || null,
    now,
  );
  run(
    'UPDATE content_studio_projects SET status=?,updated_at=? WHERE id=? AND owner_id=?',
    input.status === 'accepted' ? 'generation_ready' : 'review_required',
    now,
    input.projectId,
    input.ownerId,
  );
  return getPipelineRuntime(input.ownerId, input.projectId)!;
}

export function setPipelineReleaseReview(input:{
  ownerId:string;
  projectId:string;
  gate:'copyright'|'final';
  status:'accepted'|'needs_fix';
  actor:string;
  note?:string;
}) {
  const project=getPipelineProject(input.ownerId,input.projectId);
  if(!project)throw new Error('Content Studio project not found');
  const runtime=getPipelineRuntime(input.ownerId,input.projectId);
  if(!runtime)throw new Error('Project chưa chạy prepare runtime');
  if(!runtime.generationAllowed)throw new Error('Generation Gate chưa mở; chưa thể duyệt release.');

  const note=clean(input.note,1200);
  if(input.status==='needs_fix'&&note.length<5)throw new Error('needs_fix cần ghi chú cụ thể.');

  let artifactCount=0;
  try{
    const row=all<{n:number}>('SELECT COUNT(*) AS n FROM content_studio_artifacts WHERE owner_id=? AND project_id=?',input.ownerId,input.projectId)[0];
    artifactCount=Number(row?.n||0);
  }catch{}
  if(input.status==='accepted'&&artifactCount<1)throw new Error('Chưa có artifact để thực hiện Copyright/Final Review.');

  if(input.gate==='final'&&input.status==='accepted'&&runtime.reviews.copyright!=='accepted'){
    throw new Error('Copyright Review chưa ACCEPTED; chưa thể xác nhận Final Review.');
  }

  const now=new Date().toISOString(),column=input.gate==='copyright'?'copyright_review_status':'final_review_status';
  const nextStage=input.status==='accepted'
    ? (input.gate==='copyright'?'final-review':'release-ready')
    : (input.gate==='copyright'?'copyright-fix':'final-fix');
  run(`UPDATE content_studio_project_runtime SET ${column}=?,current_stage=?,updated_at=? WHERE project_id=? AND owner_id=?`,
    input.status,nextStage,now,input.projectId,input.ownerId);
  run(
    'INSERT INTO content_studio_project_review_events(id,project_id,owner_id,gate,status,actor,note,created_at) VALUES(?,?,?,?,?,?,?,?)',
    randomUUID(),input.projectId,input.ownerId,input.gate,input.status,clean(input.actor,240),note||null,now
  );
  run(
    'UPDATE content_studio_projects SET status=?,updated_at=? WHERE id=? AND owner_id=?',
    input.status==='accepted'?(input.gate==='final'?'review_accepted':'review_required'):'review_required',
    now,input.projectId,input.ownerId
  );
  return getPipelineRuntime(input.ownerId,input.projectId)!;
}

export function buildGenerationHandoff(ownerId: string, projectId: string): GenerationHandoff {
  const project = getPipelineProject(ownerId, projectId);
  const runtime = getPipelineRuntime(ownerId, projectId);
  if (!project || !runtime) throw new Error('Project/runtime not found');
  if (!runtime.generationAllowed) {
    throw new Error('Generation Gate chưa mở: cần Research PASS và Medical Review phù hợp trước khi tạo media.');
  }

  return {
    version: 'generation-handoff-v1',
    projectId,
    topic: project.topic,
    seriesName: project.seriesName,
    episode: project.episode,
    characterBible: runtime.characterBible,
    styleBible: runtime.styleBible,
    scenes: runtime.scenePrompts,
    shotPlan: runtime.shotPlan,
    mediaStrategy: {
      primary: 'generated-original',
      fallback: 'rights-verified-open-media-or-original-card',
      externalAutoUse: false,
      rightsVerifiedCandidates: runtime.openMedia.candidates.filter((candidate) => candidate.rightsVerified),
    },
    voicePlan: runtime.voicePlan,
    outputs: runtime.composePlan,
    gates: {
      research: runtime.research.status,
      medicalReview: runtime.reviews.medical,
      copyrightBeforePublish: runtime.reviews.copyright,
      humanFinalBeforePublish: runtime.reviews.final,
    },
  };
}
