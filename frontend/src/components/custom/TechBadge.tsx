import { Badge } from "@/components/ui/badge";

export default function TechBadge() {
  return (
    <>
      <div className="mb-4 mt-3">
        <h3 className="mb-3">Technologies:</h3>
        <div className="flex w-full flex-wrap justify-center gap-2">
          <Badge variant="outline" className="px-3 py-1">
            AWS Lambda
          </Badge>
          <Badge variant="outline" className="px-3 py-1">
            AWS DynamoDB
          </Badge>
          <Badge variant="outline" className="px-3 py-1">
            AWS API Gateway
          </Badge>
          <Badge variant="outline" className="px-3 py-1">
            AWS S3 Bucket
          </Badge>
          <Badge variant="outline" className="px-3 py-1">
            AWS SQS
          </Badge>
          <Badge variant="outline" className="px-3 py-1">
            AWS EventBridge
          </Badge>
          <Badge variant="outline" className="px-3 py-1">
            AWS Secrets Manager
          </Badge>
          <Badge variant="outline" className="px-3 py-1">
            AWS IAM
          </Badge>
          <Badge variant="outline" className="px-3 py-1">
            AWS CloudWatch
          </Badge>
          <Badge variant="outline" className="px-3 py-1">
            Redis
          </Badge>
          <Badge variant="outline" className="px-3 py-1">
            AI Groq (LPU)
          </Badge>
          <Badge variant="outline" className="px-3 py-1">
            Reactjs (TypeScript)
          </Badge>
          <Badge variant="outline" className="px-3 py-1">
            Resend (Email API)
          </Badge>
          <Badge variant="outline" className="px-3 py-1">
            Shadcn-UI
          </Badge>
          <Badge variant="outline" className="px-3 py-1">
            Vercel
          </Badge>
        </div>
      </div>
    </>
  );
}
