/**
 * XML Parser - Frontend Polling Client
 * 
 * Drop this into any frontend to upload XML files and track progress.
 * Works with the /api/* endpoints on the xml-parser service.
 * 
 * Usage:
 *   const client = new XMLParserClient('http://localhost:3000');
 *   const result = await client.parseFile(file, (job) => {
 *     console.log(`${job.progress}% - ${job.current}/${job.total}`);
 *   });
 */

class XMLParserClient {
  constructor(baseUrl = 'http://localhost:3000') {
    this.baseUrl = baseUrl;
    this.pollInterval = 2000; // ms between status checks
  }

  /**
   * Upload an XML file and return the job ID
   */
  async upload(file) {
    const formData = new FormData();
    formData.append('xmlfile', file);

    const res = await fetch(`${this.baseUrl}/api/parse`, {
      method: 'POST',
      body: formData,
    });

    if (!res.ok) throw new Error(`Upload failed: ${res.status}`);
    const data = await res.json();
    if (!data.success) throw new Error('Upload rejected');

    return data.jobId;
  }

  /**
   * Poll job status until complete or failed
   * @param {string} jobId
   * @param {function} onProgress - Called with job object on each poll
   * @returns {object} Final job object with batchId
   */
  async poll(jobId, onProgress) {
    while (true) {
      const res = await fetch(`${this.baseUrl}/api/status/${jobId}`);
      const data = await res.json();

      if (!data.success) throw new Error(data.error);

      const job = data.job;
      if (onProgress) onProgress(job);

      if (job.status === 'completed') return job;
      if (job.status === 'failed') throw new Error(job.error);

      await new Promise((r) => setTimeout(r, this.pollInterval));
    }
  }

  /**
   * Upload file, poll until complete, return final job
   */
  async parseFile(file, onProgress) {
    const jobId = await this.upload(file);
    return await this.poll(jobId, onProgress);
  }
}

// ---------------------------------------------------------------------------
// Example: Vanilla JS with a progress bar
// ---------------------------------------------------------------------------
//
// <input type="file" id="file" accept=".xml" />
// <button id="upload">Upload</button>
// <div id="bar" style="width:0%; height:20px; background:#3498db;"></div>
// <p id="label"></p>
//
// <script src="pollingClient.js"></script>
// <script>
//   const client = new XMLParserClient('http://localhost:3000');
//
//   document.getElementById('upload').onclick = async () => {
//     const file = document.getElementById('file').files[0];
//     if (!file) return;
//
//     try {
//       const job = await client.parseFile(file, (j) => {
//         document.getElementById('bar').style.width = j.progress + '%';
//         document.getElementById('label').textContent =
//           `${j.status} — ${j.current ?? 0} / ${j.total ?? '?'} records (${j.progress}%)`;
//       });
//
//       document.getElementById('label').textContent =
//         `Done! Batch ID: ${job.batchId ?? job.id}`;
//     } catch (err) {
//       document.getElementById('label').textContent = 'Error: ' + err.message;
//     }
//   };
// </script>
// ---------------------------------------------------------------------------

// Export for module environments (Node, bundlers)
if (typeof module !== 'undefined') {
  module.exports = { XMLParserClient };
}
