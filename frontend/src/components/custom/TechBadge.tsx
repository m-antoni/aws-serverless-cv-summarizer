import { Badge } from "@/components/ui/badge";

export default function TechBadge() {
  return (
    <>
      <div className="mb-4">
        <h3 className="mb-2">Technologies:</h3>
        <div className="flex w-full flex-wrap justify-center gap-2">
          <Badge variant="outline">AWS Lambda</Badge>
          <Badge variant="outline">AWS API Gateway</Badge>
          <Badge variant="outline">AWS S3 Bucket</Badge>
          <Badge variant="outline">AWS SQS</Badge>
          <Badge variant="outline">AWS EventBridge</Badge>
          <Badge variant="outline">AWS Secrets Manager</Badge>
          <Badge variant="outline">AWS IAM</Badge>
          <Badge variant="outline">AWS CloudWatch</Badge>
          <Badge variant="outline">Redis</Badge>
          <Badge variant="outline">AI GroQ</Badge>
          <Badge variant="outline">MongoDB</Badge>
          <Badge variant="outline">Reactjs (TypeScript)</Badge>
        </div>
      </div>
    </>
  );
}
