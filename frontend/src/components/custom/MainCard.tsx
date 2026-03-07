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
import { DialogPopUp } from "./DialogPopUp";
import DrawerRightSide from "./DrawerRightSide";
import { useEffect, useState } from "react";

const baseUrl: string = import.meta.env.VITE_API_URL;
const secretKey: string = import.meta.env.VITE_SECRET_KEY;

export default function MainCard() {
  // const [form, setForm] = useState({ form: { email: "" } });

  return (
    <>
      <div className="flex justify-center items-center min-h-screen lg:p-5 md:p-2">
        <Card className="w-full max-w-lg shadow-2xl -mt-10 mx-10">
          {/* <CardHeader>
              <CardTitle className="text-center"></CardTitle>
              <CardDescription className="text-center"></CardDescription>
            </CardHeader> */}
          <CardContent className="my-5">
            <div className="mb-7">
              <div>
                <h1 className="scroll-m-20 text-center text-2xl font-extrabold tracking-tight text-balance">
                  CV Summarizer
                </h1>
                <div className="scroll-m-20 text-lg font-semibold tracking-tight text-center">
                  Upload your CV and get an AI-generated summary.
                </div>
              </div>
              <div className="flex justify-between  mt-4">
                <DrawerRightSide />
                {/* <DialogPopUp title="Flow Diagram" /> */}
              </div>
            </div>
            <form className="mt-5">
              <div className="flex flex-col gap-6">
                <div className="grid gap-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="michael@example.com"
                    required
                  />
                </div>
              </div>
              <div className="flex justify-center w-full my-5">
                <Dropzone />
              </div>
            </form>
            <div className="flex-col gap-2">
              <Button size="lg" type="submit" className="w-full">
                Submit File
              </Button>
            </div>
          </CardContent>
          <div className="flex justify-center -mt-1">
            <small className="text-sm leading-none font-medium">
              Created by Michael Antoni
            </small>
            <br />
          </div>
        </Card>
      </div>
    </>
  );
}
