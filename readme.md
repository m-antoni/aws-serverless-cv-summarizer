# AWS Serverless CV Summarizer

Serverless CV summarization engine automates resume data extraction using an event-driven AWS architecture. By decoupling file uploads from AI processing via Amazon SQS and Gemini AI, the system ensures high scalability and low latency while maintaining cost efficiency. The pipeline integrates robust security through AWS Secrets Manager and ensures data longevity with automated cross-cloud backups and storage cleanup.

<br/>

Flow Diagram:
![image](image01.png)

<br/>

> Note: This project is a work in progress. Changes may be implemented in the upcoming updates.

<br/>

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
nodejs/
├─ utils/ (your .mjs files)
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
