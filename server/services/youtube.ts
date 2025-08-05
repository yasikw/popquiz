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

    // Try to get available transcript languages first
    try {
      console.log('Attempting to get any available transcript...');
      transcript = await YoutubeTranscript.fetchTranscript(videoId);
      if (transcript && transcript.length > 0) {
        combinedText = transcript.map(item => item.text).join(' ');
        console.log('Default transcript found, length:', combinedText.length);
      }
    } catch (error) {
      console.log('Default transcript failed, trying specific languages...', error);
      
      // If default fails, try specific languages from the error message
      const availableLanguages = ['ja', 'en', 'ar', 'de', 'ru', 'fr', 'ko', 'pt', 'th', 'es', 'it', 'hi', 'id', 'vi', 'zh-Hant'];
      
      for (const lang of availableLanguages) {
        if (combinedText) break; // Stop if we found one
        
        try {
          console.log(`Trying specific language: ${lang}`);
          transcript = await YoutubeTranscript.fetchTranscript(videoId, { lang });
          if (transcript && transcript.length > 0) {
            combinedText = transcript.map(item => item.text).join(' ');
            console.log(`Successfully got ${lang} transcript, length:`, combinedText.length);
            break;
          }
        } catch (langError) {
          console.log(`Language ${lang} failed:`, langError.message);
        }
      }
    }

    // Check if we got any transcript
    if (!combinedText || combinedText.trim().length === 0) {
      throw new Error("この動画の字幕を取得できませんでした。他の動画をお試しいただくか、PDFやテキストファイルをご利用ください。");
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
