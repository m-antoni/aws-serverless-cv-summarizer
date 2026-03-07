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
            <div className="flex justify-between overflow-y-auto">
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
          <div className="text-justify">
            <h2 className="mb-2 mt-6">Description:</h2>
            This serverless CV summarization engine utilizes an event-driven AWS
            architecture to ensure high scalability, loose coupling, Files
            uploaded to Amazon S3 trigger an AWS Lambda function to extract CV
            data, which is then persisted in Amazon DynamoDB, while asynchronous
            AI processing is offloaded to Amazon SQS to ensure system resiliency
            during high traffic, allowing a consumer Lambda to execute
            summarization via Groq AI and update the database with final
            results. Upon successful completion, the pipeline publishes an event
            to an Amazon SNS topic to trigger real-time notifications for
            downstream services or users, and Amazon EventBridge manages
            scheduled jobs for data backups and log synchronization to MongoDB
            to maintain data consistency and archival compliance.
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
