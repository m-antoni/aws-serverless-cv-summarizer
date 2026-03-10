# AWS Serverless CV Summarizer

Serverless CV summarization engine utilizes an event-driven AWS architecture to ensure high scalability and loose coupling. Files uploaded to `Amazon S3` trigger an `AWS Lambda` function to extract CV data, which is then persisted in `Amazon DynamoDB`, while asynchronous AI processing is offloaded to `Amazon SQS` to ensure system resiliency during high traffic. A consumer Lambda processes queued tasks to execute summarization via [Groq AI](https://console.groq.com/docs/overview) and updates the database with the final results. Upon successful completion, the system sends a notification email using the [Resend API](https://resend.com/). Additionally, `Amazon EventBridge` manages scheduled jobs that archive processed records into a file stored in Amazon S3, after which the corresponding records in Amazon DynamoDB and related S3 files are purged to optimize storage and maintain lifecycle management.

#### Flow Diagram:`

![image](image01.png)

<br/>

> Note: This project is a work in progress. Changes may be implemented in the upcoming updates.

### Project Architecture

**Lambda Functions:**

- `cv-summarizer-auth-request-authorizer`
- `cv-summarizer-get-s3-presigned-url`
- `cv-summarizer-s3-intake-service`
- `cv-summarizer-s3-queue-consumer`
- `cv-summarizer-dispatch-email`
- `cv-summarizer-sync-metadata-to-mongodb`
- `cv-summarizer-cleanup-job-records`

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
