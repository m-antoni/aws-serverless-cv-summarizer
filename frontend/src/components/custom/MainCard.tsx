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
// import { DialogPopUp } from "./DialogPopUp";
import DrawerRightSide from "./DrawerRightSide";
import { useState, type FormEvent } from "react";
import { v4 as uuidv4 } from "uuid";

const BASE_URL: string = import.meta.env.VITE_API_URL;
const AUTH_KEY: string = import.meta.env.VITE_AUTH_KEY;

type FormState = {
  email: string;
  files: File[] | null;
};

export default function MainCard() {
  const [form, setForm] = useState<FormState>({
    email: "michaelantoni.tech@gmail.com",
    files: null,
  });

  const handleOnSubmit = async (e: FormEvent) => {
    e.preventDefault();
    // required fields
    if (!form.email || !form.files) {
      alert("please complete the required fields!!");
    }
    // console.log(form);

    // authorizer api
    const res = await authAndPresignedURLAPI();
    // error
    if (res.error) {
      alert(res.error);
      return;
    }

    // upload the file to S3 Bucket
    await uploadFileToS3(res);
  };

  // ** Authorizer and Presigned URl from S3
  const authAndPresignedURLAPI = async () => {
    try {
      const payload = {
        file: form.files?.[0] && form.files[0].name,
        email: form.email,
        user_id: uuidv4(),
      };

      // call the authorizer api and get back a presigned url from S3
      const data = await fetch(`${BASE_URL}/authorizer`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: AUTH_KEY,
        },
        body: JSON.stringify(payload),
      });

      const response = await data.json();

      return { ...response, ...payload };
    } catch (error) {
      console.error("Failed to Authorized thhe user", error);
    }
  };

  // ** Upload file to S3 Bucket
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const uploadFileToS3 = async (args: any) => {
    const file = form.files?.[0];

    if (!file || file.size === 0) {
      console.error("No file found or file is empty.");
      return;
    }

    try {
      // use the presigned url
      const data = await fetch(args.presigned_url, {
        method: "PUT",
        headers: {
          "Content-Type": file.type,
          // These metadata headers must match the 'unhoistableHeaders' defined in the
          // Lambda's PreSignedUrl configuration. Removing them will trigger a
          // 403 Forbidden (SignatureDoesNotMatch) error from S3.
          "x-amz-meta-user-id": args.user_id,
          "x-amz-meta-email": args.email,
        },
        body: file,
      });

      if (data.ok) {
        console.log("Upload successfully", data);
      } else {
        const errorXml = await data.text();
        console.error("S3 Error XML:", errorXml);
        // Copy and paste this XML! It will contain a <Message> tag
        // explaining exactly which header failed the signature check.
      }
    } catch (error) {
      console.error("Network error during upload:", error);
    }
  };

  return (
    <>
      <div className="flex justify-center items-center min-h-screen lg:p-5 md:p-2">
        <Card className="w-full max-w-lg shadow-2xl -mt-10 mx-10">
          <CardHeader>
            <CardTitle className="text-center">
              <h1 className="scroll-m-20 text-center text-2xl font-extrabold tracking-tight text-balance">
                CV Summarizer
              </h1>
            </CardTitle>
            <CardDescription>
              <div className="scroll-m-20 text-md font-semibold tracking-tight text-center">
                Upload your CV and get an AI-generated summary. sent to your
                email
              </div>
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="mb-3 -mt-3">
              <div className="flex justify-center mt-4">
                <DrawerRightSide />
              </div>
            </div>
            <form className="mt-5">
              <div className="flex flex-col gap-6">
                <div className="grid gap-2">
                  <Label htmlFor="email">Email:</Label>
                  <Input
                    className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    id="email"
                    type="email"
                    value={form.email}
                    onChange={(e) =>
                      setForm((prev) => ({ ...prev, email: e.target.value }))
                    }
                    placeholder="michael@example.com"
                    required
                  />
                </div>
              </div>
              <div className="flex justify-center w-full my-5">
                <Dropzone setForm={setForm} />
              </div>
            </form>
            <div className="flex-col gap-2">
              <Button
                size="lg"
                type="submit"
                className="w-full"
                onClick={handleOnSubmit}
              >
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
