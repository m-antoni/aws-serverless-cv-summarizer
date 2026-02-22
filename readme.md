# AWS Serverless CV Summarizer

Serverless CV summarization engine uses an event-driven AWS pipeline where files uploaded to Amazon S3 trigger AWS Lambda to extract data into Amazon DynamoDB. AI processing is decoupled via Amazon SQS and executed using Groq AI, with results persisted back to DynamoDB. Scheduled jobs with Amazon EventBridge sync data backup, logs to MongoDB.

#### Flow Diagram:

![image](image01.png)

<br/>

> Note: This project is a work in progress. Changes may be implemented in the upcoming updates.

### Project Architecture

**Lambda Functions:**

- `cv-summarizer-auth-request-authorizer`
- `cv-summarizer-get-s3-presigned-url`
- `cv-summarizer-s3-intake-service`
- `cv-summarizer-s3-queue-consumer`
- `cv-summarizer-sync-metadata-to-mongodb`
- `cv-summarizer-s3-cleanup`

---

**Lambda Layer: cv-summarizer-layer-collections**

Shared backend utils and dependencies.

**Required ZIP Structure:**

```
nodejs/ (required name)
├─ utils/
├─ node_modules/
├─ package.json
└─ package-lock.json
```

**Deployment Steps**:

1. **Structure:** Wrap everything in the `nodejs/` folder.
2. **Zip:** Zip the `nodejs` folder itself.
3. **Import:** `import { ... } from '/opt/nodejs/utils/filename.mjs';`
4. **AWS Setup:** Lambda Function -> Layers -> Add Layer -> Select Version.

---

By using `npm install --production`, you ensure that the layer remains lightweight by excluding devDependencies.
