import { extractTextFromYouTubeWithGemini, generateContentFromVideoMetadata } from './gemini';

interface VideoMetadata {
  title: string;
  description: string;
  author?: string;
  keywords?: string[];
}

async function fetchVideoData(videoId: string): Promise<{ transcript: string | null; metadata: VideoMetadata | null }> {
  try {
    const { Innertube } = await import('youtubei.js');
    const yt = await Innertube.create({ retrieve_player: false });
    const info = await yt.getInfo(videoId);

    const basic = (info as any).basic_info ?? {};
    const metadata: VideoMetadata = {
      title: basic.title ?? '',
      description: basic.short_description ?? (info as any).secondary_info?.description?.text ?? '',
      author: basic.author ?? basic.channel?.name ?? '',
      keywords: basic.keywords ?? [],
    };

    let transcript: string | null = null;
    try {
      const transcriptData = await info.getTranscript();
      const segments =
        transcriptData?.transcript?.content?.body?.initial_segments ?? [];

      if (segments.length) {
        const lines: string[] = [];
        for (const seg of segments) {
          const snippet = (seg as any)?.snippet?.text ?? (seg as any)?.snippet?.runs?.map((r: any) => r.text).join('') ?? '';
          if (snippet.trim()) lines.push(snippet.trim());
        }
        const text = lines.join('\n');
        if (text.length > 50) transcript = text;
      }
    } catch (e) {
      console.log('youtubei.js transcript fetch failed:', (e as Error).message);
    }

    return { transcript, metadata };
  } catch (e) {
    console.log('youtubei.js getInfo failed:', (e as Error).message);
    return { transcript: null, metadata: null };
  }
}

async function fetchTranscriptFromTimedText(videoId: string): Promise<string | null> {
  try {
    const pageRes = await fetch(`https://www.youtube.com/watch?v=${videoId}`, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' }
    });
    const html = await pageRes.text();

    const captionMatch = html.match(/"captions":\s*(\{.*?"playerCaptionsTracklistRenderer".*?\})\s*,\s*"/s);
    if (!captionMatch) return null;

    let captionData: any;
    try {
      const jsonStr = captionMatch[1].replace(/\\"/g, '"').replace(/\\\\/g, '\\');
      captionData = JSON.parse(jsonStr);
    } catch {
      const urlMatch = html.match(/"baseUrl"\s*:\s*"(https:\/\/www\.youtube\.com\/api\/timedtext[^"]+)"/);
      if (!urlMatch) return null;
      const timedTextUrl = urlMatch[1].replace(/\\u0026/g, '&');
      const res = await fetch(timedTextUrl);
      const xml = await res.text();
      return parseTimedTextXml(xml);
    }

    const tracks = captionData?.playerCaptionsTracklistRenderer?.captionTracks;
    if (!tracks?.length) return null;

    const preferredLangs = ['ja', 'en', 'ko', 'zh'];
    let trackUrl = tracks[0].baseUrl;
    for (const lang of preferredLangs) {
      const found = tracks.find((t: any) => t.languageCode === lang);
      if (found) { trackUrl = found.baseUrl; break; }
    }

    const res = await fetch(trackUrl);
    const xml = await res.text();
    return parseTimedTextXml(xml);
  } catch (e) {
    console.log('TimedText transcript extraction failed:', (e as Error).message);
    return null;
  }
}

function parseTimedTextXml(xml: string): string | null {
  const textMatches = xml.match(/<text[^>]*>([\s\S]*?)<\/text>/g);
  if (!textMatches?.length) return null;

  const lines = textMatches.map(m => {
    const content = m.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/\n/g, ' ').trim();
    return content;
  }).filter(Boolean);

  const text = lines.join('\n');
  return text.length > 50 ? text : null;
}

export async function extractYouTubeSubtitles(url: string): Promise<string> {
  try {
    console.log('Extracting YouTube content from:', url);

    const videoId = extractVideoId(url);
    if (!videoId) {
      throw new Error("Invalid YouTube URL");
    }
    console.log('Video ID:', videoId);

    // Method 1: youtubei.js — fetch transcript + metadata in one call
    console.log('Trying youtubei.js (transcript + metadata)...');
    const { transcript: transcript1, metadata } = await fetchVideoData(videoId);

    if (transcript1) {
      console.log('Successfully extracted transcript via youtubei.js, length:', transcript1.length);
      // Prepend title for context so quiz questions stay on-topic
      const header = metadata?.title ? `タイトル: ${metadata.title}\n\n` : '';
      return header + transcript1;
    }

    // Method 2: Timed text API
    console.log('Trying timed text API...');
    const transcript2 = await fetchTranscriptFromTimedText(videoId);
    if (transcript2) {
      console.log('Successfully extracted transcript via timed text, length:', transcript2.length);
      const header = metadata?.title ? `タイトル: ${metadata.title}\n\n` : '';
      return header + transcript2;
    }

    // Method 3: Use real video metadata (title + description) with Gemini
    // This is far more accurate than guessing from URL alone.
    if (metadata && (metadata.title || metadata.description)) {
      console.log('No transcript available. Using real video metadata for content generation.');
      console.log(`  Title: ${metadata.title}`);
      console.log(`  Description length: ${metadata.description?.length || 0}`);

      try {
        const generated = await generateContentFromVideoMetadata(metadata);
        if (generated && generated.length > 100) {
          console.log('Generated content from metadata, length:', generated.length);
          return generated;
        }
      } catch (genErr) {
        console.log('Metadata-based generation failed:', (genErr as Error).message);
      }

      // Even if Gemini fails, return raw title + description as last resort
      const fallback = `タイトル: ${metadata.title}\n\n${metadata.description}`.trim();
      if (fallback.length > 100) {
        console.log('Returning raw metadata as content, length:', fallback.length);
        return fallback;
      }
    }

    // Method 4: URL-only Gemini guessing (last resort, least accurate)
    console.log('Falling back to URL-only Gemini extraction...');
    try {
      const extractedText = await extractTextFromYouTubeWithGemini(videoId, url);
      if (extractedText && extractedText.length > 50) {
        console.log('Successfully extracted text using URL-only Gemini, length:', extractedText.length);
        return extractedText;
      }
    } catch (geminiError) {
      console.log('URL-only Gemini extraction also failed:', (geminiError as Error).message);
    }

    throw new Error("この動画から内容を抽出できませんでした。字幕付きの動画をお試しください。");
  } catch (error) {
    console.error('YouTube content extraction error:', error);
    throw new Error(`YouTube video processing failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

function extractVideoId(url: string): string | null {
  const patterns = [
    /(?:youtube\.com\/watch\?v=)([^&\n?#]+)/,
    /(?:youtu\.be\/)([^&\n?#]+)/,
    /(?:youtube\.com\/embed\/)([^&\n?#]+)/,
    /(?:youtube\.com\/v\/)([^&\n?#]+)/,
    /(?:youtube\.com\/shorts\/)([^&\n?#]+)/,
  ];

  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match?.[1]) {
      console.log(`Video ID extracted: ${match[1]}`);
      return match[1];
    }
  }

  console.log(`No video ID found in URL: ${url}`);
  return null;
}
