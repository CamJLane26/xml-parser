import React, { useState, useRef, useCallback } from 'react';

interface ParseProgress {
  progress: number;
  current: number;
  total: number;
}

interface ParseResult {
  done: boolean;
  count: number;
  sample: any[];
  downloadUrl?: string;
}

interface XmlParserProps {
  /** Base URL for the API (defaults to empty string for same origin) */
  apiBaseUrl?: string;
  /** Callback when parsing completes successfully */
  onParseComplete?: (result: ParseResult) => void;
  /** Callback when an error occurs */
  onError?: (error: string) => void;
  /** Custom className for the container */
  className?: string;
}

export const XmlParser: React.FC<XmlParserProps> = ({
  apiBaseUrl = '',
  onParseComplete,
  onError,
  className = '',
}) => {
  const [file, setFile] = useState<File | null>(null);
  const [isParsing, setIsParsing] = useState(false);
  const [progress, setProgress] = useState<ParseProgress>({ progress: 0, current: 0, total: 0 });
  const [result, setResult] = useState<ParseResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      setFile(selectedFile);
      setResult(null);
      setError(null);
    }
  }, []);

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();

    if (!file) {
      setError('Please select a file');
      return;
    }

    const formData = new FormData();
    formData.append('xmlfile', file);

    setIsParsing(true);
    setError(null);
    setResult(null);
    setProgress({ progress: 0, current: 0, total: 0 });

    try {
      const response = await fetch(`${apiBaseUrl}/parse`, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        throw new Error('Failed to parse XML');
      }

      if (!response.body) {
        throw new Error('No response body');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let finalData: ParseResult | null = null;

      while (true) {
        const { done, value } = await reader.read();

        if (done) {
          break;
        }

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6));

              if (data.error) {
                throw new Error(data.error);
              }

              if (data.done) {
                finalData = data;
              } else if (data.progress !== undefined) {
                setProgress({
                  progress: data.progress,
                  current: data.current,
                  total: data.total,
                });
              }
            } catch (e) {
              console.error('Error parsing SSE data:', e);
            }
          }
        }
      }

      if (finalData) {
        setResult(finalData);
        onParseComplete?.(finalData);
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'An error occurred';
      setError(errorMessage);
      onError?.(errorMessage);
    } finally {
      setIsParsing(false);
    }
  }, [file, apiBaseUrl, onParseComplete, onError]);

  const handleDownload = useCallback(() => {
    if (result?.downloadUrl) {
      window.location.href = `${apiBaseUrl}${result.downloadUrl}`;
    }
  }, [result, apiBaseUrl]);

  const handleReset = useCallback(() => {
    setFile(null);
    setResult(null);
    setError(null);
    setProgress({ progress: 0, current: 0, total: 0 });
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }, []);

  return (
    <div className={`xml-parser ${className}`}>
      <h1>XML Parser</h1>
      <div className="upload-form">
        <form onSubmit={handleSubmit}>
          <div className="file-input">
            <label htmlFor="xmlfile">Select XML File:</label>
            <input
              ref={fileInputRef}
              type="file"
              id="xmlfile"
              name="xmlfile"
              accept=".xml"
              onChange={handleFileChange}
              disabled={isParsing}
              required
            />
          </div>
          <button type="submit" disabled={isParsing || !file}>
            {isParsing ? 'Parsing...' : 'Parse XML'}
          </button>
        </form>

        {isParsing && (
          <div className="progress">
            {progress.total > 0 && (
              <div className="total-count-info">
                Total toys found: <span>{progress.total.toLocaleString()}</span>
              </div>
            )}
            <div className="progress-bar">
              <div
                className="progress-fill"
                style={{ width: `${Math.min(100, Math.max(0, progress.progress))}%` }}
              />
            </div>
            <p className="progress-text">
              {progress.total > 0
                ? `Parsing: ${progress.current.toLocaleString()} / ${progress.total.toLocaleString()} toys (${progress.progress}%)`
                : `Parsing: ${progress.current.toLocaleString()} toys...`}
            </p>
          </div>
        )}

        {error && (
          <div className="error">
            {error}
          </div>
        )}
      </div>

      {result && (
        <div className="results">
          <div className="summary">
            <h3>Summary</h3>
            <p>Total toys parsed: {result.count.toLocaleString()}</p>
            <p>
              {result.count > result.sample.length
                ? `Showing sample of ${result.sample.length} toys (out of ${result.count.toLocaleString()} total)`
                : `Showing all ${result.count.toLocaleString()} toys`}
            </p>
          </div>
          <h3>Sample Results (first 20 toys):</h3>
          <pre>{JSON.stringify({ toys: result.sample }, null, 2)}</pre>
          {result.count > result.sample.length && result.downloadUrl && (
            <button className="download-btn" onClick={handleDownload}>
              Download Full Results (JSON)
            </button>
          )}
          <button className="reset-btn" onClick={handleReset} style={{ marginTop: '10px' }}>
            Parse Another File
          </button>
        </div>
      )}
    </div>
  );
};
