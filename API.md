# XML Parser API Documentation

REST API endpoints for integrating with external frontends.

## Base URL

- Development: `http://localhost:3000`
- Production: `https://your-domain.com`

## Endpoints

### 1. Upload & Parse (Async)

Upload an XML file and get a job ID for tracking progress.

**Endpoint:** `POST /api/parse`

**Content-Type:** `multipart/form-data`

**Parameters:**
- `xmlfile` (file, required): XML file to parse

**Response:**
```json
{
  "success": true,
  "jobId": "batch-1707123456789-123456789",
  "status": "processing",
  "statusUrl": "/api/status/batch-1707123456789-123456789",
  "resultUrl": "/api/result/batch-1707123456789-123456789"
}
```

**Example:**
```bash
curl -X POST \
  -F "xmlfile=@sample.xml" \
  http://localhost:3000/api/parse
```

```javascript
// JavaScript/Fetch
const formData = new FormData();
formData.append('xmlfile', fileInput.files[0]);

const response = await fetch('http://localhost:3000/api/parse', {
  method: 'POST',
  body: formData
});

const data = await response.json();
console.log('Job ID:', data.jobId);
```

---

### 2. Check Job Status

Poll this endpoint to track parsing progress.

**Endpoint:** `GET /api/status/:jobId`

**Response (Processing):**
```json
{
  "success": true,
  "job": {
    "id": "batch-1707123456789-123456789",
    "status": "processing",
    "progress": 45,
    "current": 4500,
    "total": 10000,
    "createdAt": "2024-02-05T10:30:00.000Z",
    "updatedAt": "2024-02-05T10:30:15.000Z"
  }
}
```

**Response (Queued):**
```json
{
  "success": true,
  "job": {
    "id": "batch-1707123456789-123456789",
    "status": "queued",
    "queuePosition": 2,
    "progress": 0,
    "createdAt": "2024-02-05T10:30:00.000Z"
  }
}
```

**Response (Completed):**
```json
{
  "success": true,
  "job": {
    "id": "batch-1707123456789-123456789",
    "status": "completed",
    "progress": 100,
    "current": 10000,
    "total": 10000,
    "createdAt": "2024-02-05T10:30:00.000Z",
    "completedAt": "2024-02-05T10:32:00.000Z"
  }
}
```

**Response (Failed):**
```json
{
  "success": true,
  "job": {
    "id": "batch-1707123456789-123456789",
    "status": "failed",
    "error": "Invalid XML format",
    "createdAt": "2024-02-05T10:30:00.000Z",
    "failedAt": "2024-02-05T10:30:05.000Z"
  }
}
```

**Response (Not Found):**
```json
{
  "success": false,
  "error": "Job not found or expired"
}
```

**Example:**
```bash
curl http://localhost:3000/api/status/batch-1707123456789-123456789
```

```javascript
// Poll every 2 seconds
const pollStatus = async (jobId) => {
  const response = await fetch(`http://localhost:3000/api/status/${jobId}`);
  const data = await response.json();
  
  if (data.success && data.job.status === 'completed') {
    console.log('Parsing complete!');
    return data.job;
  } else if (data.job.status === 'failed') {
    console.error('Parsing failed:', data.job.error);
    return null;
  } else {
    console.log(`Progress: ${data.job.progress}%`);
    setTimeout(() => pollStatus(jobId), 2000);
  }
};
```

---

### 3. Get Results

Retrieve parsed data after job completion.

**Endpoint:** `GET /api/result/:jobId`

**Response (Success):**
```json
{
  "success": true,
  "result": {
    "done": true,
    "count": 10000,
    "sample": [
      {
        "name": "Toy Car",
        "color": "Red",
        "store": [
          { "name": "Target", "location": "Texas" }
        ]
      }
    ]
  }
}
```

**Response (Not Completed):**
```json
{
  "success": false,
  "error": "Job is processing, not completed",
  "status": "processing",
  "progress": 45
}
```

**Response (Not Found):**
```json
{
  "success": false,
  "error": "Job not found or expired"
}
```

**Example:**
```bash
curl http://localhost:3000/api/result/batch-1707123456789-123456789
```

```javascript
const getResult = async (jobId) => {
  const response = await fetch(`http://localhost:3000/api/result/${jobId}`);
  const data = await response.json();
  
  if (data.success) {
    console.log('Total records:', data.result.count);
    console.log('Sample:', data.result.sample);
  } else {
    console.error('Error:', data.error);
  }
};
```

---

### 4. Health Check

Check server and queue status.

**Endpoint:** `GET /health`

**Response:**
```json
{
  "status": "ok",
  "queue": {
    "length": 2,
    "running": 1,
    "idle": false
  }
}
```

---

## Complete Frontend Integration Example

```javascript
class XMLParserClient {
  constructor(baseUrl = 'http://localhost:3000') {
    this.baseUrl = baseUrl;
  }

  async uploadAndParse(file) {
    const formData = new FormData();
    formData.append('xmlfile', file);

    const response = await fetch(`${this.baseUrl}/api/parse`, {
      method: 'POST',
      body: formData
    });

    const data = await response.json();
    
    if (!data.success) {
      throw new Error('Upload failed');
    }

    return data.jobId;
  }

  async pollUntilComplete(jobId, onProgress) {
    while (true) {
      const response = await fetch(`${this.baseUrl}/api/status/${jobId}`);
      const data = await response.json();

      if (!data.success) {
        throw new Error(data.error);
      }

      const job = data.job;

      // Call progress callback
      if (onProgress) {
        onProgress(job);
      }

      // Check status
      if (job.status === 'completed') {
        return this.getResult(jobId);
      } else if (job.status === 'failed') {
        throw new Error(job.error);
      }

      // Wait 2 seconds before next poll
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }

  async getResult(jobId) {
    const response = await fetch(`${this.baseUrl}/api/result/${jobId}`);
    const data = await response.json();

    if (!data.success) {
      throw new Error(data.error);
    }

    return data.result;
  }

  async parseFile(file, onProgress) {
    const jobId = await this.uploadAndParse(file);
    return await this.pollUntilComplete(jobId, onProgress);
  }
}

// Usage
const client = new XMLParserClient();

const fileInput = document.getElementById('file-input');
const file = fileInput.files[0];

try {
  const result = await client.parseFile(file, (job) => {
    console.log(`Status: ${job.status}`);
    console.log(`Progress: ${job.progress}%`);
    console.log(`Records: ${job.current}/${job.total}`);
  });

  console.log('Parsing complete!');
  console.log('Total records:', result.count);
  console.log('Sample data:', result.sample);
} catch (error) {
  console.error('Parsing failed:', error);
}
```

---

## React Integration Example

```jsx
import { useState } from 'react';

function XMLUploader() {
  const [jobId, setJobId] = useState(null);
  const [status, setStatus] = useState(null);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  const uploadFile = async (file) => {
    const formData = new FormData();
    formData.append('xmlfile', file);

    try {
      const response = await fetch('http://localhost:3000/api/parse', {
        method: 'POST',
        body: formData
      });
      const data = await response.json();
      
      if (data.success) {
        setJobId(data.jobId);
        pollStatus(data.jobId);
      }
    } catch (err) {
      setError(err.message);
    }
  };

  const pollStatus = async (id) => {
    const response = await fetch(`http://localhost:3000/api/status/${id}`);
    const data = await response.json();

    if (data.success) {
      const job = data.job;
      setStatus(job.status);
      setProgress(job.progress);

      if (job.status === 'completed') {
        fetchResult(id);
      } else if (job.status === 'failed') {
        setError(job.error);
      } else {
        setTimeout(() => pollStatus(id), 2000);
      }
    }
  };

  const fetchResult = async (id) => {
    const response = await fetch(`http://localhost:3000/api/result/${id}`);
    const data = await response.json();

    if (data.success) {
      setResult(data.result);
    }
  };

  return (
    <div>
      <input type="file" onChange={(e) => uploadFile(e.target.files[0])} />
      
      {status && <div>Status: {status}</div>}
      {progress > 0 && <div>Progress: {progress}%</div>}
      
      {result && (
        <div>
          <h3>Results</h3>
          <p>Total records: {result.count}</p>
          <pre>{JSON.stringify(result.sample, null, 2)}</pre>
        </div>
      )}
      
      {error && <div>Error: {error}</div>}
    </div>
  );
}
```

---

## Important Notes

1. **Job Expiration**: Results are kept for 1 hour after completion
2. **File Size**: Maximum 1GB
3. **Queue**: Files are processed one at a time (check `/health` for queue status)
4. **Polling**: Poll `/api/status/:jobId` every 1-2 seconds for progress
5. **CORS**: Configure CORS if frontend is on different domain

---

## Error Handling

All endpoints return JSON with `success` field:
- `success: true` - Operation succeeded
- `success: false` - Operation failed, check `error` field

Common HTTP status codes:
- `200` - Success
- `400` - Bad request (job not completed, invalid parameters)
- `404` - Job not found or expired
- `500` - Server error
