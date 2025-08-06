import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { processPDF, processText, processYouTube } from "@/lib/api";
import { type GeneratedQuiz } from "@shared/schema";

interface UploadSectionProps {
  onQuizGenerated: (quiz: GeneratedQuiz) => void;
  selectedDifficulty: string;
  setIsLoading: (loading: boolean) => void;
  setLoadingMessage: (message: string) => void;
}

export default function UploadSection({ 
  onQuizGenerated, 
  selectedDifficulty, 
  setIsLoading, 
  setLoadingMessage 
}: UploadSectionProps) {
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [textFile, setTextFile] = useState<File | null>(null);
  const [youtubeUrl, setYoutubeUrl] = useState("");
  const { toast } = useToast();

  const handlePDFUpload = async () => {
    if (!pdfFile) {
      toast({
        title: "エラー",
        description: "PDFファイルを選択してください",
        variant: "destructive",
      });
      return;
    }

    try {
      setIsLoading(true);
      setLoadingMessage("PDFからテキストを抽出中...");
      
      const quiz = await processPDF(
        pdfFile, 
        selectedDifficulty, 
        pdfFile.name.replace('.pdf', '')
      );
      
      onQuizGenerated(quiz);
      toast({
        title: "成功",
        description: "PDFからクイズが生成されました",
      });
    } catch (error) {
      toast({
        title: "エラー",
        description: error instanceof Error ? error.message : "PDF処理に失敗しました",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleTextUpload = async () => {
    if (!textFile) {
      toast({
        title: "エラー",
        description: "テキストファイルを選択してください",
        variant: "destructive",
      });
      return;
    }

    try {
      setIsLoading(true);
      setLoadingMessage("テキストを解析中...");
      
      const quiz = await processText(
        textFile, 
        selectedDifficulty, 
        textFile.name.replace(/\.(txt|md)$/, '')
      );
      
      onQuizGenerated(quiz);
      toast({
        title: "成功",
        description: "テキストからクイズが生成されました",
      });
    } catch (error) {
      toast({
        title: "エラー",
        description: error instanceof Error ? error.message : "テキスト処理に失敗しました",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleYouTubeSubmit = async () => {
    if (!youtubeUrl) {
      toast({
        title: "エラー",
        description: "YouTube URLを入力してください",
        variant: "destructive",
      });
      return;
    }

    try {
      setIsLoading(true);
      setLoadingMessage("YouTube字幕を取得中...");
      
      const quiz = await processYouTube(
        youtubeUrl, 
        selectedDifficulty, 
        "YouTube動画クイズ"
      );
      
      onQuizGenerated(quiz);
      toast({
        title: "成功",
        description: "YouTube動画からクイズが生成されました",
      });
    } catch (error) {
      toast({
        title: "エラー",
        description: error instanceof Error ? error.message : "YouTube処理に失敗しました",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <section className="mb-12">
      <h3 className="text-2xl font-bold text-gray-800 mb-6 text-center">コンテンツをアップロード</h3>
      
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* PDF Upload Card */}
        <Card className="bg-white/60 border border-gray-200/60 shadow-md hover:shadow-lg transition-shadow duration-200">
          <CardContent className="p-6 text-center">
            <div className="bg-gradient-to-br from-red-400 to-pink-500 rounded-full w-16 h-16 flex items-center justify-center mx-auto mb-4 shadow-lg">
              <i className="fas fa-file-pdf text-white text-2xl"></i>
            </div>
            <h4 className="text-lg font-semibold text-gray-800 mb-2">PDFファイル</h4>
            <p className="text-sm text-gray-600 mb-4">最大10MBまでのPDFファイルをアップロード</p>
            
            <div className="border-2 border-dashed border-gray-300/60 rounded-xl p-6 hover:border-gray-400/60 transition-colors mb-4 bg-gray-50/60">
              <Input
                type="file"
                accept=".pdf"
                onChange={(e) => setPdfFile(e.target.files?.[0] || null)}
                className="hidden"
                id="pdf-upload"
                data-testid="input-pdf-upload"
              />
              <label htmlFor="pdf-upload" className="cursor-pointer">
                <i className="fas fa-cloud-upload-alt text-gray-400 text-3xl mb-2 block"></i>
                <span className="text-sm text-gray-600">
                  {pdfFile ? pdfFile.name : "クリックまたはドラッグ&ドロップ"}
                </span>
              </label>
            </div>
            
            <Button 
              onClick={handlePDFUpload}
              className="w-full bg-gradient-to-r from-red-400 to-pink-500 hover:from-red-500 hover:to-pink-600 text-white border-0 shadow-md rounded-lg"
              disabled={!pdfFile}
              data-testid="button-pdf-upload"
            >
              アップロード開始
            </Button>
          </CardContent>
        </Card>

        {/* Text File Upload Card */}
        <Card className="bg-white/60 border border-gray-200/60 shadow-md hover:shadow-lg transition-shadow duration-200">
          <CardContent className="p-6 text-center">
            <div className="bg-gradient-to-br from-green-400 to-emerald-500 rounded-full w-16 h-16 flex items-center justify-center mx-auto mb-4 shadow-lg">
              <i className="fas fa-file-alt text-white text-2xl"></i>
            </div>
            <h4 className="text-lg font-semibold text-gray-800 mb-2">テキストファイル</h4>
            <p className="text-sm text-gray-600 mb-4">最大1MBまでのテキストファイル</p>
            
            <div className="border-2 border-dashed border-gray-300/60 rounded-xl p-6 hover:border-gray-400/60 transition-colors mb-4 bg-gray-50/60">
              <Input
                type="file"
                accept=".txt,.md"
                onChange={(e) => setTextFile(e.target.files?.[0] || null)}
                className="hidden"
                id="text-upload"
                data-testid="input-text-upload"
              />
              <label htmlFor="text-upload" className="cursor-pointer">
                <i className="fas fa-cloud-upload-alt text-gray-400 text-3xl mb-2 block"></i>
                <span className="text-sm text-gray-600">
                  {textFile ? textFile.name : "クリックまたはドラッグ&ドロップ"}
                </span>
              </label>
            </div>
            
            <Button 
              onClick={handleTextUpload}
              className="w-full bg-gradient-to-r from-green-400 to-emerald-500 hover:from-green-500 hover:to-emerald-600 text-white border-0 shadow-md rounded-lg"
              disabled={!textFile}
              data-testid="button-text-upload"
            >
              アップロード開始
            </Button>
          </CardContent>
        </Card>

        {/* YouTube URL Card */}
        <Card className="bg-white/60 border border-gray-200/60 shadow-md hover:shadow-lg transition-shadow duration-200">
          <CardContent className="p-6 text-center">
            <div className="bg-gradient-to-br from-red-500 to-red-600 rounded-full w-16 h-16 flex items-center justify-center mx-auto mb-4 shadow-lg">
              <i className="fab fa-youtube text-white text-2xl"></i>
            </div>
            <h4 className="text-lg font-semibold text-gray-800 mb-2">YouTube動画</h4>
            <p className="text-sm text-gray-600 mb-4">字幕付き動画のURLを入力</p>
            
            <div className="space-y-4">
              <Input
                type="url"
                placeholder="https://www.youtube.com/watch?v=..."
                value={youtubeUrl}
                onChange={(e) => setYoutubeUrl(e.target.value)}
                className="bg-gray-50 border-gray-300 text-gray-800 placeholder-gray-500 rounded-lg"
                data-testid="input-youtube-url"
              />
              <Button 
                onClick={handleYouTubeSubmit}
                className="w-full bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700 text-white border-0 shadow-md rounded-lg"
                disabled={!youtubeUrl}
                data-testid="button-youtube-submit"
              >
                字幕取得開始
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </section>
  );
}
