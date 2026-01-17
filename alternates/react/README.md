# React XML Parser Component

This directory contains a React component that replicates the functionality of the HTML-based XML parser interface. It can be easily integrated into any React application.

## Files

- `XmlParser.tsx` - The main React component
- `XmlParser.css` - Styles for the component (optional, can be customized)
- `example-usage.tsx` - Example of how to use the component in a React app

## Installation

If you're using this in a React project, you'll need React installed:

```bash
npm install react react-dom
# or
yarn add react react-dom
```

## Usage

### Basic Usage

```tsx
import { XmlParser } from './alternates/react/XmlParser';
import './alternates/react/XmlParser.css'; // Optional: import styles

function App() {
  return (
    <div className="App">
      <XmlParser />
    </div>
  );
}
```

### With Custom API Base URL

If your backend is on a different origin:

```tsx
<XmlParser apiBaseUrl="https://api.example.com" />
```

### With Callbacks

```tsx
<XmlParser
  onParseComplete={(result) => {
    console.log(`Parsed ${result.count} toys`);
    // Do something with the result
  }}
  onError={(error) => {
    console.error('Parse error:', error);
    // Handle error
  }}
/>
```

### With Custom Styling

```tsx
<XmlParser className="my-custom-class" />
```

Then override styles in your CSS:

```css
.my-custom-class .upload-form {
  background: #your-color;
}
```

## Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `apiBaseUrl` | `string` | `''` | Base URL for the API (empty string for same origin) |
| `onParseComplete` | `(result: ParseResult) => void` | `undefined` | Callback when parsing completes successfully |
| `onError` | `(error: string) => void` | `undefined` | Callback when an error occurs |
| `className` | `string` | `''` | Custom className for the container |

## Features

- File upload with XML validation
- Real-time progress updates via Server-Sent Events (SSE)
- Progress bar with percentage and count
- Summary display with total count
- Sample results preview (first 20 items)
- Download full results as JSON
- Error handling
- Reset functionality to parse another file

## Integration Notes

- The component is self-contained and doesn't require any external state management
- All styles are scoped to `.xml-parser` class to avoid conflicts
- The component handles all API communication internally
- Progress updates are streamed in real-time from the backend
- The component is fully typed with TypeScript

## Backend Requirements

The component expects the backend to:
- Accept POST requests to `/parse` with multipart/form-data containing `xmlfile`
- Return Server-Sent Events (SSE) with progress updates in the format:
  ```
  data: {"progress": 50, "current": 1000, "total": 2000}
  ```
- Send a final message when done:
  ```
  data: {"done": true, "count": 2000, "sample": [...], "downloadUrl": "/download/..."}
  ```

See `src/server.ts` for the backend implementation.
