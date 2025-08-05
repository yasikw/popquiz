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

    // Extract transcript using youtube-transcript
    let transcript;
    try {
      transcript = await YoutubeTranscript.fetchTranscript(videoId, {
        lang: 'ja' // Prefer Japanese
      });
    } catch (error) {
      console.log('Japanese transcript not available, trying English...');
      transcript = null;
    }

    if (!transcript || transcript.length === 0) {
      // Try English if Japanese is not available
      console.log('Attempting to fetch English transcript...');
      const englishTranscript = await YoutubeTranscript.fetchTranscript(videoId, {
        lang: 'en'
      });
      
      if (!englishTranscript || englishTranscript.length === 0) {
        throw new Error("この動画には字幕がありません");
      }
      
      // Combine English transcript text
      const combinedText = englishTranscript.map(item => item.text).join(' ');
      console.log('English transcript extracted, length:', combinedText.length);
      return combinedText;
    }

    // Combine transcript text
    const combinedText = transcript.map(item => item.text).join(' ');
    console.log('Japanese transcript extracted, length:', combinedText.length);
    
    if (combinedText.trim().length < 50) {
      throw new Error("字幕の内容が短すぎてクイズを作成できません");
    }
    
    return combinedText;
    
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
