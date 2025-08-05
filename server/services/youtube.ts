import { YoutubeTranscript } from 'youtube-transcript';

export async function extractYouTubeSubtitles(url: string): Promise<string> {
  try {
    console.log('Extracting YouTube subtitles from:', url);
    
    // Extract video ID from URL
    const videoId = extractVideoId(url);
    if (!videoId) {
      throw new Error("無効なYouTube URLです");
    }

    console.log('Video ID:', videoId);

    // Try multiple approaches to get transcript
    let transcript = null;
    let combinedText = '';

    // Method 1: Try Japanese transcript
    try {
      console.log('Trying Japanese transcript...');
      transcript = await YoutubeTranscript.fetchTranscript(videoId, { lang: 'ja' });
      if (transcript && transcript.length > 0) {
        combinedText = transcript.map(item => item.text).join(' ');
        console.log('Japanese transcript found, length:', combinedText.length);
      }
    } catch (error) {
      console.log('Japanese transcript failed:', error);
    }

    // Method 2: Try English transcript if Japanese failed
    if (!combinedText) {
      try {
        console.log('Trying English transcript...');
        transcript = await YoutubeTranscript.fetchTranscript(videoId, { lang: 'en' });
        if (transcript && transcript.length > 0) {
          combinedText = transcript.map(item => item.text).join(' ');
          console.log('English transcript found, length:', combinedText.length);
        }
      } catch (error) {
        console.log('English transcript failed:', error);
      }
    }

    // Method 3: Try auto-generated transcript (any language)
    if (!combinedText) {
      try {
        console.log('Trying auto-generated transcript...');
        transcript = await YoutubeTranscript.fetchTranscript(videoId);
        if (transcript && transcript.length > 0) {
          combinedText = transcript.map(item => item.text).join(' ');
          console.log('Auto-generated transcript found, length:', combinedText.length);
        }
      } catch (error) {
        console.log('Auto-generated transcript failed:', error);
      }
    }

    // Check if we got any transcript
    if (!combinedText || combinedText.trim().length === 0) {
      throw new Error("この動画には利用可能な字幕がありません。字幕付きの動画をお試しください。");
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
    
  } catch (error) {
    console.error('YouTube transcript extraction error:', error);
    throw new Error(`YouTube字幕取得に失敗しました: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

function extractVideoId(url: string): string | null {
  const regex = /(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&\n?#]+)/;
  const match = url.match(regex);
  return match ? match[1] : null;
}
