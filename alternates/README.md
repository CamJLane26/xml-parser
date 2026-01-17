# Alternates Directory

This directory contains alternate implementations and examples of the XML parser functionality, designed to be easily integrated into different frameworks and projects.

## Contents

### React Component (`react/`)

A React component that replicates the functionality of `src/public/index.html`. This component is designed for production use where parsed data is stored in PostgreSQL rather than downloaded as files.

**Files:**
- `XmlParser.tsx` - Main React component
- `XmlParser.css` - Component styles
- `example-usage.tsx` - Usage examples
- `README.md` - Detailed documentation

**Quick Start:**
```tsx
import { XmlParser } from './alternates/react/XmlParser';
import './alternates/react/XmlParser.css';

function App() {
  return <XmlParser />;
}
```

### Kubernetes Deployment Guide (`KUBERNETES-DEPLOYMENT.md`)

Comprehensive guide for deploying the XML parser with PostgreSQL in Kubernetes, including:
- Database setup and configuration
- Kubernetes deployment manifests
- Environment variables and resource recommendations
- Scaling and monitoring considerations
- Security best practices

## Purpose

The alternates directory is intended to provide:
- Framework-specific implementations (React, Vue, Angular, etc.)
- Alternative UI approaches
- Integration examples for different use cases
- Reusable components that can be dropped into existing projects
- Production deployment guides

## Architecture Notes

**Production Configuration:**
- Data is stored directly in PostgreSQL database
- No file storage or download functionality
- Stateless application pods for horizontal scaling
- Connection pooling for efficient database access
- Batch inserts for optimal performance

## Contributing

When adding new alternates:
1. Create a new subdirectory (e.g., `vue/`, `angular/`, `vanilla-js/`)
2. Include a README.md explaining usage
3. Provide example code showing integration
4. Keep the API consistent with the backend (`/parse` endpoint)
5. Note whether it's for file-based or database-based storage
