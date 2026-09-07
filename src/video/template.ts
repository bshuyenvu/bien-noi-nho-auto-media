export interface NewsVideoTemplate {
  width: 1080;
  height: 1920;
  fps: number;
  brand: string;
  label: 'TIN MỚI' | 'TIN NÓNG';
  headline: string;
  source?: string;
  subtitleSafeBottom: number;
}

export function createNewsTemplate(input: {
  headline: string;
  source?: string;
  breaking?: boolean;
}): NewsVideoTemplate {
  return {
    width: 1080,
    height: 1920,
    fps: 30,
    brand: 'BIỂN & NỖI NHỚ',
    label: input.breaking ? 'TIN NÓNG' : 'TIN MỚI',
    headline: input.headline,
    source: input.source,
    subtitleSafeBottom: 280,
  };
}
