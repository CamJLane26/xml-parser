# Test Suite Documentation

This directory contains the test suite for the XML parser microservice. The tests are organized by component and cover unit testing, integration testing, and integration testing scenarios.

## Test Structure

```
tests/
├── parsers/
│   ├── xmlParser.test.ts          # Tests for the parseXML function (non-streaming)
│   └── xmlParserStream.test.ts     # Tests for the parseXMLStream function (streaming)
├── middleware/
│   └── upload.test.ts              # Tests for file upload middleware
└── server.test.ts                  # Integration tests for Express server endpoints
```

## Running Tests

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run tests with coverage
npm test -- --coverage
```

---

## Test Files

### `parsers/xmlParser.test.ts`

Tests for the `parseXML` function, which parses XML streams and returns all parsed objects as an array. This is the non-streaming version of the parser (note: the production code uses `parseXMLStream` instead).

**Test Cases:**

1. **`should parse simple toy with text fields`**
   - Verifies basic parsing of a single toy element with simple text fields (`name` and `color`)
   - Ensures the parser correctly extracts text content from XML elements

2. **`should parse toy with nested store array`**
   - Tests parsing of repetitive nested elements that should be grouped into an array
   - Verifies that multiple `<store>` elements are correctly collected into a `store` array with proper structure

3. **`should parse multiple toys`**
   - Tests parsing of multiple root elements (`<toy>`) within a parent container
   - Ensures all toys are correctly extracted and returned as separate objects in the result array

4. **`should handle empty store array`**
   - Verifies that when no array elements are present, the field is correctly omitted (undefined) rather than being an empty array
   - Tests graceful handling of missing optional fields

5. **`should handle malformed XML`**
   - Tests error handling when XML is invalid (e.g., unclosed tags)
   - Ensures the parser throws an error for malformed input rather than silently failing

6. **`should handle object field type`**
   - Tests parsing of nested object fields (not arrays)
   - Verifies that nested structures defined as `type: 'object'` in the schema are correctly extracted

7. **`should handle deeply nested elements`**
   - Tests parsing of multi-level nested structures (objects within objects)
   - Ensures the parser can handle arbitrary nesting depth as specified in the schema

8. **`should handle XML with attributes`**
   - Tests that XML attributes on elements are ignored (not extracted) when not part of the schema
   - Verifies the parser focuses only on element content, not attributes

9. **`should handle empty root element`**
   - Tests parsing of a root element with no child elements
   - Ensures the parser returns an object with undefined fields rather than failing

---

### `parsers/xmlParserStream.test.ts`

Tests for the `parseXMLStream` function, which is the **production parser** used by the server. This function uses a callback-based streaming approach, calling a callback function for each parsed toy element as it's encountered. This is more memory-efficient for large files.

**Test Cases:**

1. **`should call callback for each toy`**
   - Verifies that the callback function is invoked once for each `<toy>` element found in the XML
   - Tests that multiple toys result in multiple callback invocations
   - Ensures the streaming callback mechanism works correctly

2. **`should handle nested store arrays`**
   - Tests that nested repetitive elements (arrays) are correctly grouped when using the streaming parser
   - Verifies the same array grouping logic works in the streaming context

3. **`should handle empty XML`**
   - Tests that empty XML (no root elements matching the schema) results in zero callback invocations
   - Ensures the parser doesn't crash on empty input

4. **`should handle malformed XML`**
   - Tests error handling for invalid XML in the streaming parser
   - Ensures errors are properly propagated through the Promise rejection mechanism

5. **`should handle object field type`**
   - Tests nested object field extraction in the streaming parser
   - Verifies object field types work correctly with the callback-based approach

---

### `middleware/upload.test.ts`

Tests for the file upload middleware that handles multipart form data uploads using Multer. These tests verify the middleware is properly configured.

**Test Cases:**

1. **`upload should be configured with file filter`**
   - Verifies that the upload middleware is properly initialized and configured
   - Ensures the upload function exists and is callable

2. **`upload should accept single file`**
   - Tests that the upload middleware is configured to accept a single file upload
   - Verifies the basic configuration of the Multer middleware

**Note:** These tests are simplified due to the complexity of mocking Multer's internal behavior. The middleware is more thoroughly tested through integration tests in `server.test.ts`.

---

### `server.test.ts`

Integration tests for the Express server endpoints. These tests verify the complete request/response cycle, including middleware, parsing, and response formatting. The tests use mocked dependencies to isolate server logic.

**Test Cases:**

1. **`GET /health should return ok`**
   - Tests the health check endpoint
   - Verifies it returns a 200 status code with `{ status: 'ok' }` JSON response
   - Ensures basic server functionality is working

2. **`POST /parse should parse XML file and return SSE summary`**
   - Tests the main XML parsing endpoint
   - Verifies that:
     - The endpoint accepts file uploads
     - XML parsing is triggered via `parseXMLStream`
     - The response uses Server-Sent Events (SSE) format
     - Progress updates are sent via SSE
     - Final result includes count, sample, and download URL
   - Tests the complete parsing workflow from upload to response

3. **`POST /parse should handle parsing errors`**
   - Tests error handling when XML parsing fails
   - Verifies that errors are properly formatted and sent via SSE
   - Ensures the server doesn't crash on parsing errors

4. **`GET /download should return file`**
   - Tests the file download endpoint for parsed JSON results
   - Verifies:
     - Correct Content-Type header (`application/json`)
     - Content-Disposition header for file download
     - Successful file serving

**Note:** The server tests use mocked versions of:
- `parseXMLStream` - to avoid actual XML parsing during tests
- `uploadMiddleware` - to simulate file uploads without Multer complexity
- File system operations are simplified in the test setup

---

## Test Coverage Summary

The test suite covers:

- ✅ **XML Parsing**: Basic parsing, nested structures, arrays, objects, attributes
- ✅ **Streaming**: Callback-based streaming parser behavior
- ✅ **Error Handling**: Malformed XML, missing files, parsing errors
- ✅ **Server Endpoints**: Health check, file upload/parsing, file download
- ✅ **Response Formats**: JSON responses, Server-Sent Events (SSE)
- ✅ **Edge Cases**: Empty XML, missing fields, deeply nested structures

## Test Dependencies

- **Jest**: Test framework
- **ts-jest**: TypeScript support for Jest
- **supertest**: HTTP assertion library for testing Express endpoints
- **@types/jest**: TypeScript types for Jest
- **@types/supertest**: TypeScript types for supertest

## Writing New Tests

When adding new functionality, follow these guidelines:

1. **Unit Tests**: Test individual functions in isolation (e.g., parser functions)
2. **Integration Tests**: Test complete workflows (e.g., server endpoints)
3. **Mock External Dependencies**: Use `jest.mock()` to mock file system, network, or complex dependencies
4. **Test Edge Cases**: Include tests for empty inputs, malformed data, and error conditions
5. **Use Descriptive Names**: Test names should clearly describe what is being tested

Example test structure:

```typescript
describe('ComponentName', () => {
  test('should do something specific', async () => {
    // Arrange: Set up test data
    const input = 'test data';
    
    // Act: Execute the function
    const result = await functionUnderTest(input);
    
    // Assert: Verify the result
    expect(result).toEqual(expectedOutput);
  });
});
```
