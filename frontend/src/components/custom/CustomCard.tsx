import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import Dropzone from "./Dropzone";

export default function CustomCard() {
  return (
    <>
      <div className="flex justify-center items-center min-h-screen p-5">
        <div>
          <div className="mb-10 -mt-50">
            <h1 className="scroll-m-20 text-center text-2xl font-extrabold tracking-tight text-balance">
              CV Summarizer
            </h1>
            <div className="scroll-m-20 text-lg font-semibold tracking-tight text-center">
              Upload your CV and get an instant AI-generated summary.
            </div>
          </div>
          <Card className="w-full max-w-lg">
            {/* <CardHeader>
              <CardTitle className="text-center"></CardTitle>
              <CardDescription className="text-center"></CardDescription>
            </CardHeader> */}
            <CardContent>
              <form>
                <div className="flex flex-col gap-6">
                  <div className="grid gap-2">
                    <Label htmlFor="email">Email</Label>
                    <Input
                      id="email"
                      type="email"
                      placeholder="m@example.com"
                      required
                    />
                  </div>
                </div>
                <div className="flex justify-center w-full my-5">
                  <Dropzone />
                </div>
              </form>
              <div className="flex-col gap-2">
                <Button type="submit" className="w-full">
                  Upload CV
                </Button>
              </div>
            </CardContent>
          </Card>
          <div className="flex justify-center mt-4">
            <small className="text-sm leading-none font-medium">
              Created by Michael Antoni
            </small>
            <br />
          </div>
        </div>
      </div>
    </>
  );
}
