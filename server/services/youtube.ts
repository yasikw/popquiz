import { extractTextFromYouTubeWithGemini } from './gemini';

async function fetchTranscriptDirect(videoId: string): Promise<string | null> {
  try {
    const { Innertube } = await import('youtubei.js');
    const yt = await Innertube.create({ retrieve_player: false });
    const info = await yt.getInfo(videoId);
    const transcriptData = await info.getTranscript();

    const segments =
      transcriptData?.transcript?.content?.body?.initial_segments ?? [];

    if (!segments.length) return null;

    const lines: string[] = [];
    for (const seg of segments) {
      const snippet = (seg as any)?.snippet?.text ?? (seg as any)?.snippet?.runs?.map((r: any) => r.text).join('') ?? '';
      if (snippet.trim()) lines.push(snippet.trim());
    }

    const text = lines.join('\n');
    return text.length > 50 ? text : null;
  } catch (e) {
    console.log('youtubei.js transcript extraction failed:', (e as Error).message);
    return null;
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

    // Method 1: youtubei.js transcript
    console.log('Trying youtubei.js transcript...');
    const transcript1 = await fetchTranscriptDirect(videoId);
    if (transcript1) {
      console.log('Successfully extracted transcript via youtubei.js, length:', transcript1.length);
      return transcript1;
    }

    // Method 2: Timed text API
    console.log('Trying timed text API...');
    const transcript2 = await fetchTranscriptFromTimedText(videoId);
    if (transcript2) {
      console.log('Successfully extracted transcript via timed text, length:', transcript2.length);
      return transcript2;
    }

    // Method 3: Fallback to Gemini (only if direct methods fail)
    console.log('Direct transcript extraction failed, falling back to Gemini...');
    try {
      const extractedText = await extractTextFromYouTubeWithGemini(videoId, url);
      if (extractedText && extractedText.length > 50) {
        console.log('Successfully extracted text using Gemini, length:', extractedText.length);
        return extractedText;
      }
    } catch (geminiError) {
      console.log('Gemini extraction also failed:', (geminiError as Error).message);
    }

    throw new Error("Could not extract content from this video. Please try a different video.");
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
