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
          <div>
            Serverless CV summarization engine uses an event-driven AWS pipeline
            where files uploaded to Amazon S3 trigger AWS Lambda to extract data
            into Amazon DynamoDB. AI processing is decoupled via Amazon SQS and
            executed using Groq AI, with results persisted back to DynamoDB.
            Scheduled jobs with Amazon EventBridge sync data backup, logs to
            MongoDB.
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
