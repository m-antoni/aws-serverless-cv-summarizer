import { Badge } from "@/components/ui/badge";

export default function TechBadge() {
  return (
    <>
      <div className="mb-4 mt-3">
        <h3 className="mb-3">Technologies:</h3>
        <div className="flex w-full flex-wrap justify-center gap-2">
          <Badge variant="outline" className="px-2 py-0.5">
            AWS Lambda
          </Badge>
          <Badge variant="outline" className="px-2 py-0.5">
            AWS DynamoDB
          </Badge>
          <Badge variant="outline" className="px-2 py-0.5">
            AWS API Gateway
          </Badge>
          <Badge variant="outline" className="px-2 py-0.5">
            AWS S3
          </Badge>
          <Badge variant="outline" className="px-2 py-0.5">
            AWS SQS
          </Badge>
          <Badge variant="outline" className="px-2 py-0.5">
            AWS SNS
          </Badge>
          <Badge variant="outline" className="px-2 py-0.5">
            AWS Textract
          </Badge>
          <Badge variant="outline" className="px-2 py-0.5">
            AWS EventBridge
          </Badge>
          <Badge variant="outline" className="px-2 py-0.5">
            AWS Secrets Manager
          </Badge>
          <Badge variant="outline" className="px-2 py-0.5">
            AWS IAM
          </Badge>
          <Badge variant="outline" className="px-2 py-0.5">
            AWS CloudWatch
          </Badge>
          <Badge variant="outline" className="px-2 py-0.5">
            Redis (Rate Limiting)
          </Badge>
          <Badge variant="outline" className="px-2 py-0.5">
            AI Groq (LPU)
          </Badge>
          <Badge variant="outline" className="px-2 py-0.5">
            Reactjs (TypeScript)
          </Badge>
          <Badge variant="outline" className="px-2 py-0.5">
            Resend (Email API)
          </Badge>
          <Badge variant="outline" className="px-2 py-0.5">
            Shadcn-UI
          </Badge>
          <Badge variant="outline" className="px-2 py-0.5">
            Vercel(CI/CD)
          </Badge>
        </div>
      </div>
    </>
  );
}
