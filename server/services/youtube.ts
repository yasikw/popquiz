import { extractTextFromYouTubeWithGemini } from './gemini';

export async function extractYouTubeSubtitles(url: string): Promise<string> {
  try {
    console.log('Extracting YouTube content from:', url);
    
    // Extract video ID from URL
    const videoId = extractVideoId(url);
    if (!videoId) {
      throw new Error("無効なYouTube URLです");
    }

    console.log('Video ID:', videoId);

    // Try to get YouTube video thumbnail and extract text using Gemini Vision
    try {
      console.log('Using Gemini Vision to extract content from YouTube video...');
      const extractedText = await extractTextFromYouTubeWithGemini(videoId, url);
      
      if (extractedText && extractedText.length > 50) {
        console.log('Successfully extracted text using Gemini Vision, length:', extractedText.length);
        return extractedText;
      } else {
        throw new Error("動画から十分なテキストコンテンツを抽出できませんでした");
      }
      
    } catch (geminiError) {
      console.log('Gemini extraction failed:', geminiError);
      throw new Error("この動画からコンテンツを抽出できませんでした。テキストが含まれる動画をお試しください。");
    }
    
  } catch (error) {
    console.error('YouTube content extraction error:', error);
    throw new Error(`YouTube動画の処理に失敗しました: ${error instanceof Error ? error.message : 'Unknown error'}`);
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
