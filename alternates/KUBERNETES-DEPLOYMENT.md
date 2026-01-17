# Kubernetes Deployment Guide

This guide covers deploying the XML Parser with PostgreSQL in a Kubernetes environment.

## Architecture Overview

- **Stateless Application Pods**: Multiple replicas can run simultaneously
- **PostgreSQL Database**: External database service (managed or self-hosted)
- **No File Storage Required**: All data is stored in PostgreSQL
- **Concurrent Processing**: Each pod handles requests independently

## Prerequisites

1. PostgreSQL database (version 12+)
2. Kubernetes cluster
3. kubectl configured

## Database Setup

### 1. Create Database and User

```sql
CREATE DATABASE xmlparser;
CREATE USER xmlparser_user WITH PASSWORD 'your-secure-password';
GRANT ALL PRIVILEGES ON DATABASE xmlparser TO xmlparser_user;
```

The application will automatically create the `toys` table on first connection.

### 2. Database Schema

The application creates the following table automatically:

```sql
CREATE TABLE toys (
  id SERIAL PRIMARY KEY,
  batch_id VARCHAR(255),
  data JSONB NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_batch_id ON toys(batch_id);
CREATE INDEX idx_created_at ON toys(created_at);
```

## Kubernetes Deployment

### 1. Create ConfigMap for Environment Variables

```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: xml-parser-config
data:
  PORT: "3000"
  DB_BATCH_SIZE: "1000"
  NODE_HEAP_SIZE: "5120"
```

### 2. Create Secret for Database Credentials

```yaml
apiVersion: v1
kind: Secret
metadata:
  name: xml-parser-db-secret
type: Opaque
stringData:
  DB_HOST: "postgres-service.default.svc.cluster.local"
  DB_PORT: "5432"
  DB_NAME: "xmlparser"
  DB_USER: "xmlparser_user"
  DB_PASSWORD: "your-secure-password"
```

**Note**: In production, use a proper secret management system (e.g., AWS Secrets Manager, HashiCorp Vault).

### 3. Deployment Configuration

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: xml-parser
  labels:
    app: xml-parser
spec:
  replicas: 3
  selector:
    matchLabels:
      app: xml-parser
  template:
    metadata:
      labels:
        app: xml-parser
    spec:
      containers:
      - name: xml-parser
        image: your-registry/xml-parser:latest
        ports:
        - containerPort: 3000
        envFrom:
        - configMapRef:
            name: xml-parser-config
        - secretRef:
            name: xml-parser-db-secret
        env:
        - name: DB_POOL_MAX
          value: "20"
        - name: DB_IDLE_TIMEOUT
          value: "30000"
        - name: DB_CONNECTION_TIMEOUT
          value: "2000"
        resources:
          requests:
            memory: "6Gi"
            cpu: "1000m"
          limits:
            memory: "8Gi"
            cpu: "2000m"
        livenessProbe:
          httpGet:
            path: /health
            port: 3000
          initialDelaySeconds: 30
          periodSeconds: 10
          timeoutSeconds: 5
          failureThreshold: 3
        readinessProbe:
          httpGet:
            path: /health
            port: 3000
          initialDelaySeconds: 5
          periodSeconds: 5
          timeoutSeconds: 3
          failureThreshold: 3
        lifecycle:
          preStop:
            exec:
              command: ["/bin/sh", "-c", "sleep 15"]
```

### 4. Service Configuration

```yaml
apiVersion: v1
kind: Service
metadata:
  name: xml-parser-service
spec:
  selector:
    app: xml-parser
  ports:
  - port: 80
    targetPort: 3000
    protocol: TCP
  type: LoadBalancer  # Or ClusterIP, NodePort, etc.
```

### 5. Horizontal Pod Autoscaler (Optional)

```yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: xml-parser-hpa
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: xml-parser
  minReplicas: 3
  maxReplicas: 10
  metrics:
  - type: Resource
    resource:
      name: cpu
      target:
        type: Utilization
        averageUtilization: 70
  - type: Resource
    resource:
      name: memory
      target:
        type: Utilization
        averageUtilization: 80
```

## Environment Variables

| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| `PORT` | Server port | `3000` | No |
| `DB_HOST` | PostgreSQL host | `localhost` | Yes |
| `DB_PORT` | PostgreSQL port | `5432` | Yes |
| `DB_NAME` | Database name | `xmlparser` | Yes |
| `DB_USER` | Database user | `postgres` | Yes |
| `DB_PASSWORD` | Database password | - | Yes |
| `DB_POOL_MAX` | Max connection pool size | `20` | No |
| `DB_IDLE_TIMEOUT` | Idle connection timeout (ms) | `30000` | No |
| `DB_CONNECTION_TIMEOUT` | Connection timeout (ms) | `2000` | No |
| `DB_BATCH_SIZE` | Batch insert size | `1000` | No |
| `NODE_HEAP_SIZE` | Node.js heap size (MB) | `4096` | No |

## Database Connection Pooling

The application uses connection pooling to handle concurrent requests efficiently:

- **Pool Size**: Configured via `DB_POOL_MAX` (default: 20)
- **Per Pod**: Each pod maintains its own connection pool
- **Total Connections**: `DB_POOL_MAX × number of pods`

**Example**: 3 pods × 20 connections = 60 total database connections

Ensure your PostgreSQL `max_connections` setting can accommodate this.

## Resource Recommendations

### Memory
- **Request**: 6Gi (allows for 5GB heap + overhead)
- **Limit**: 8Gi
- **Heap Size**: Set `NODE_HEAP_SIZE` to ~70% of request (e.g., 5120MB for 6Gi request)

### CPU
- **Request**: 1000m (1 core)
- **Limit**: 2000m (2 cores)
- XML parsing is CPU-intensive, especially for large files

## Monitoring

### Key Metrics to Monitor

1. **Database Connection Pool**
   - Active connections
   - Idle connections
   - Connection wait time

2. **Application Metrics**
   - Request rate
   - Parse completion time
   - Error rate
   - Memory usage

3. **Database Metrics**
   - Query performance
   - Transaction rate
   - Lock contention
   - Disk I/O

### Health Check Endpoint

The `/health` endpoint returns:
```json
{
  "status": "ok"
}
```

Consider enhancing this to check database connectivity:
```typescript
app.get('/health', async (req, res) => {
  try {
    const pool = getPool();
    await pool.query('SELECT 1');
    res.json({ status: 'ok', database: 'connected' });
  } catch (error) {
    res.status(503).json({ status: 'error', database: 'disconnected' });
  }
});
```

## Scaling Considerations

### Vertical Scaling
- Increase memory/CPU limits for pods
- Increase `NODE_HEAP_SIZE` proportionally
- Increase `DB_POOL_MAX` if needed

### Horizontal Scaling
- Add more pod replicas
- Ensure database can handle increased connection count
- Consider read replicas for query-heavy workloads
- Use load balancer to distribute traffic

### Database Scaling
- Monitor connection count: `SELECT count(*) FROM pg_stat_activity;`
- Adjust `max_connections` in PostgreSQL if needed
- Consider connection pooling at database level (PgBouncer)
- Use read replicas for reporting/analytics queries

## Security Best Practices

1. **Secrets Management**
   - Use Kubernetes Secrets or external secret management
   - Rotate database passwords regularly
   - Never commit secrets to version control

2. **Network Security**
   - Use NetworkPolicies to restrict pod communication
   - Encrypt database connections (SSL/TLS)
   - Use private database endpoints

3. **Database Security**
   - Use least-privilege database users
   - Enable SSL for database connections
   - Regular security updates

4. **Application Security**
   - Add authentication/authorization middleware
   - Implement rate limiting
   - Validate and sanitize inputs
   - Use HTTPS for external traffic

## Troubleshooting

### Database Connection Issues

```bash
# Check pod logs
kubectl logs -l app=xml-parser

# Test database connectivity from pod
kubectl exec -it <pod-name> -- psql -h $DB_HOST -U $DB_USER -d $DB_NAME
```

### High Memory Usage

- Reduce `NODE_HEAP_SIZE`
- Reduce `DB_BATCH_SIZE` (more frequent, smaller inserts)
- Check for memory leaks

### Slow Parsing

- Increase CPU limits
- Optimize database indexes
- Check database connection pool utilization
- Monitor database query performance

### Connection Pool Exhaustion

- Increase `DB_POOL_MAX`
- Reduce number of pod replicas
- Use PgBouncer for connection pooling
- Optimize query performance

## Production Checklist

- [ ] PostgreSQL database configured with appropriate `max_connections`
- [ ] Database credentials stored in secure secret management
- [ ] Resource limits configured appropriately
- [ ] Health checks configured
- [ ] Monitoring and alerting set up
- [ ] Logging configured
- [ ] Backup strategy for database
- [ ] Disaster recovery plan
- [ ] Rate limiting implemented
- [ ] Authentication/authorization configured
- [ ] SSL/TLS enabled for database connections
- [ ] Network policies configured
- [ ] Horizontal Pod Autoscaler configured (if needed)
