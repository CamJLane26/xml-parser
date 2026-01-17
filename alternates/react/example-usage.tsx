/**
 * Example usage of the XmlParser component in a React application
 * 
 * This file demonstrates how to integrate the XmlParser component
 * into a larger React application.
 */

import React, { useState } from 'react';
import { XmlParser } from './XmlParser';
import './XmlParser.css';

interface ParseResult {
  done: boolean;
  count: number;
  sample: any[];
  downloadUrl?: string;
}

/**
 * Example 1: Basic usage
 */
export const BasicExample: React.FC = () => {
  return (
    <div>
      <h2>XML Parser - Basic Example</h2>
      <XmlParser />
    </div>
  );
};

/**
 * Example 2: With callbacks to handle results
 */
export const WithCallbacksExample: React.FC = () => {
  const [lastResult, setLastResult] = useState<ParseResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleParseComplete = (result: ParseResult) => {
    setLastResult(result);
    setError(null);
    console.log('Parse completed:', result);
  };

  const handleError = (errorMessage: string) => {
    setError(errorMessage);
    setLastResult(null);
    console.error('Parse error:', errorMessage);
  };

  return (
    <div>
      <h2>XML Parser - With Callbacks</h2>
      <XmlParser
        onParseComplete={handleParseComplete}
        onError={handleError}
      />
      {lastResult && (
        <div style={{ marginTop: '20px', padding: '10px', background: '#e8f5e9' }}>
          <h3>Last Parse Result:</h3>
          <p>Total toys: {lastResult.count}</p>
          <p>Sample size: {lastResult.sample.length}</p>
        </div>
      )}
      {error && (
        <div style={{ marginTop: '20px', padding: '10px', background: '#ffebee', color: '#d32f2f' }}>
          <strong>Error:</strong> {error}
        </div>
      )}
    </div>
  );
};

/**
 * Example 3: With custom API base URL (for different origin)
 */
export const WithCustomApiExample: React.FC = () => {
  return (
    <div>
      <h2>XML Parser - Custom API</h2>
      <XmlParser apiBaseUrl="https://api.example.com" />
    </div>
  );
};

/**
 * Example 4: Integrated into a larger app layout
 */
export const IntegratedExample: React.FC = () => {
  return (
    <div style={{ minHeight: '100vh', background: '#f5f5f5' }}>
      <header style={{ background: '#333', color: 'white', padding: '20px' }}>
        <h1>My Application</h1>
      </header>
      <main style={{ padding: '20px' }}>
        <nav style={{ marginBottom: '20px' }}>
          <a href="#home">Home</a> | <a href="#parser">XML Parser</a>
        </nav>
        <section>
          <XmlParser className="custom-parser" />
        </section>
      </main>
      <footer style={{ background: '#333', color: 'white', padding: '20px', textAlign: 'center' }}>
        <p>&copy; 2024 My Application</p>
      </footer>
    </div>
  );
};

/**
 * Example 5: Multiple parsers (if needed)
 */
export const MultipleParsersExample: React.FC = () => {
  return (
    <div>
      <h2>Multiple XML Parsers</h2>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
        <div>
          <h3>Parser 1</h3>
          <XmlParser />
        </div>
        <div>
          <h3>Parser 2</h3>
          <XmlParser />
        </div>
      </div>
    </div>
  );
};

/**
 * Main App component showing all examples
 */
export const App: React.FC = () => {
  const [activeExample, setActiveExample] = useState<string>('basic');

  return (
    <div>
      <nav style={{ marginBottom: '20px', padding: '10px', background: '#e0e0e0' }}>
        <button onClick={() => setActiveExample('basic')}>Basic</button>
        <button onClick={() => setActiveExample('callbacks')}>With Callbacks</button>
        <button onClick={() => setActiveExample('custom-api')}>Custom API</button>
        <button onClick={() => setActiveExample('integrated')}>Integrated</button>
        <button onClick={() => setActiveExample('multiple')}>Multiple</button>
      </nav>

      {activeExample === 'basic' && <BasicExample />}
      {activeExample === 'callbacks' && <WithCallbacksExample />}
      {activeExample === 'custom-api' && <WithCustomApiExample />}
      {activeExample === 'integrated' && <IntegratedExample />}
      {activeExample === 'multiple' && <MultipleParsersExample />}
    </div>
  );
};

export default App;
