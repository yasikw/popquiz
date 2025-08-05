import { Innertube } from 'youtubei.js';

export async function extractYouTubeSubtitles(url: string): Promise<string> {
  try {
    console.log('Extracting YouTube subtitles from:', url);
    
    // Extract video ID from URL
    const videoId = extractVideoId(url);
    if (!videoId) {
      throw new Error("無効なYouTube URLです");
    }

    console.log('Video ID:', videoId);

    // Initialize YouTube internal API
    const youtube = await Innertube.create();
    
    try {
      // Get video info
      console.log('Getting video info...');
      const info = await youtube.getInfo(videoId);
      
      if (!info) {
        throw new Error("動画情報を取得できませんでした");
      }

      console.log('Video title:', info.basic_info?.title || 'Unknown');
      
      // Get transcript/captions
      console.log('Getting transcript...');
      const transcriptData = await info.getTranscript();
      
      if (!transcriptData || !transcriptData.content) {
        throw new Error("この動画には字幕がありません");
      }

      // Extract text from transcript segments
      let combinedText = '';
      if (transcriptData.content.body && transcriptData.content.body.initial_segments) {
        const segments = transcriptData.content.body.initial_segments;
        combinedText = segments
          .map((segment: any) => {
            if (segment.snippet && segment.snippet.text) {
              return segment.snippet.text;
            }
            return '';
          })
          .filter((text: string) => text.trim().length > 0)
          .join(' ');
      }

      console.log('Raw transcript length:', combinedText.length);

      if (!combinedText || combinedText.trim().length === 0) {
        throw new Error("字幕の内容を抽出できませんでした");
      }

      // Validate transcript length
      if (combinedText.trim().length < 50) {
        throw new Error("字幕の内容が短すぎてクイズを作成できません。より長い動画をお試しください。");
      }
      
      // Clean up the text
      const cleanedText = combinedText
        .replace(/\[.*?\]/g, '') // Remove brackets like [Music], [Applause]
        .replace(/\s+/g, ' ') // Normalize whitespace
        .trim();
      
      console.log('Final transcript length:', cleanedText.length);
      return cleanedText;
      
    } catch (apiError) {
      console.log('YouTube API error:', apiError);
      throw new Error("この動画の字幕を取得できませんでした。字幕付きの動画をお試しください。");
    }
    
  } catch (error) {
    console.error('YouTube transcript extraction error:', error);
    throw new Error(`YouTube字幕取得に失敗しました: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

function extractVideoId(url: string): string | null {
  // Handle various YouTube URL formats
  const patterns = [
    /(?:youtube\.com\/watch\?v=)([^&\n?#]+)/,
    /(?:youtu\.be\/)([^&\n?#]+)/,
    /(?:youtube\.com\/embed\/)([^&\n?#]+)/,
    /(?:youtube\.com\/v\/)([^&\n?#]+)/
  ];
  
  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match && match[1]) {
      console.log(`Video ID extracted: ${match[1]} from URL: ${url}`);
      return match[1];
    }
  }
  
  console.log(`No video ID found in URL: ${url}`);
  return null;
}
