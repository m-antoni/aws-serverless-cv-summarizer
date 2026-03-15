import { Button } from "@/components/ui/button";
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "@/components/ui/drawer";
import TechBadge from "./TechBadge";
import { Github } from "lucide-react";
import { User } from "lucide-react";
// import FlowDiagramv2 from "./FlowDiagramv2";
import { FlowDiagram } from "./FlowDiagram";

export default function DrawerRightSide() {
  return (
    <Drawer direction="right">
      <DrawerTrigger asChild>
        <Button variant="secondary">About The Project</Button>
      </DrawerTrigger>
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle>AWS Serverless CV Summarizer</DrawerTitle>
          <DrawerDescription>
            <div className="flex justify-between overflow-y-auto mt-3">
              <Button variant="default" size="xs" asChild>
                <a
                  href="https://github.com/m-antoni/aws-serverless-cv-summarizer"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center text-inherit"
                >
                  <Github className="h-3 w-3" />
                  Github Repository
                </a>
              </Button>
              <Button variant="default" size="xs" asChild>
                <a
                  href="https://michaelantoni.vercel.app"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center text-inherit"
                >
                  <User className="h-3 w-3" />
                  My Portfolio
                </a>
              </Button>
            </div>
          </DrawerDescription>
        </DrawerHeader>
        <div className="no-scrollbar overflow-y-auto px-4">
          <TechBadge />
          <FlowDiagram src="assets/img/image01.png" alt="Flow Diagram" />
          {/* <FlowDiagramv2 /> */}
          <h2 className="mb-2 mt-6">Description:</h2>
          <div className="text-balance text-justify">
            Serverless CV summarization engine utilizes an event-driven AWS
            architecture to ensure high scalability and loose coupling. Files
            uploaded to Amazon S3 trigger an AWS Lambda function to extract CV
            data, which is then persisted in Amazon DynamoDB, while asynchronous
            AI processing is offloaded to Amazon SQS to ensure system resiliency
            during high traffic. A consumer Lambda processes queued tasks to
            execute summarization via Groq AI and updates the database with the
            final results. Upon successful completion, the system sends a
            notification email. Additionally, Amazon EventBridge manages
            scheduled jobs that archive processed records into a file stored in
            Amazon S3, after which the corresponding records in Amazon DynamoDB
            and related S3 files are purged to optimize storage and maintain
            lifecycle management.
          </div>
        </div>
        <DrawerFooter>
          {/* <Button>Submit</Button> */}
          <DrawerClose asChild>
            <Button variant="secondary">Close</Button>
          </DrawerClose>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}
