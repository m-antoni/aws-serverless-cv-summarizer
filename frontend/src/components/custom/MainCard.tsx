import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
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
import { Spinner } from "../ui/spinner";
import { ToastContainer, toast } from "react-toastify";
import { Bounce } from "react-toastify/unstyled";
import { useTheme } from "@/components/theme-provider";

const BASE_URL: string = import.meta.env.VITE_API_URL;
const AUTH_KEY: string = import.meta.env.VITE_AUTH_KEY;

export default function MainCard() {
  const [email, setEmail] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [loading, setLoading] = useState(false);

  // theme
  const { theme } = useTheme();
  const themeValue = theme === "dark" ? "dark" : "light";

  const handleOnSubmit = async (e: FormEvent) => {
    e.preventDefault();
    try {
      // required fields
      if (!email || files.length === 0) {
        toast.error("Email and File must be provided!", {
          toastId: uuidv4(),
          position: "top-center",
          autoClose: 3000,
          transition: Bounce,
          theme: themeValue,
        });
        return;
      }
      // validate email
      if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        toast.error("Please enter a valid email address.", {
          toastId: uuidv4(),
          position: "top-center",
          autoClose: 3000,
          transition: Bounce,
          theme: themeValue,
        });
        return;
      }

      setLoading(true);
      // authorizer api
      const res = await authAndPresignedURLAPI();
      // error
      if (res.error) {
        console.error("Error: ", res.error);
        toast.error(res.error, {
          toastId: uuidv4(),
          position: "top-center",
          autoClose: 3000,
          transition: Bounce,
          theme: themeValue,
        });
        return;
      }

      // upload the file to S3 Bucket
      await uploadFileToS3(res);
    } catch (error) {
      console.log(error);
      toast.error("Something went wrong!", {
        toastId: uuidv4(),
        position: "top-center",
        autoClose: 3000,
        transition: Bounce,
      });
      return;
    } finally {
      setLoading(false);
    }
  };

  // ** Authorizer and Presigned URl from S3
  const authAndPresignedURLAPI = async () => {
    try {
      const payload = {
        file: files?.[0] && files[0].name,
        email,
        user_id: uuidv4(),
      };

      // Authorizer api
      // Presigned URL S3, response
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
    const file = files?.[0];

    try {
      // Upload the file using the Presigned URL from S3
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
        setEmail("");
        setFiles([]);
        toast.success(
          "Uploaded successfully.You will receive an Email shortly.",
          {
            toastId: uuidv4(), // prevent duplicates
            position: "top-center",
            autoClose: 5000,
            hideProgressBar: false,
            closeOnClick: false,
            pauseOnHover: true,
            draggable: false,
            progress: undefined,
            transition: Bounce,
            theme: themeValue,
          }
        );
      } else {
        const errorXml = await data.text();
        console.error("S3 Error XML:", errorXml);
      }
    } catch (error) {
      console.error("Network error during upload:", error);
    }
  };

  return (
    <>
      <div className="flex justify-center items-center min-h-screen lg:p-5 md:p-2">
        <Card className="w-full max-w-lg shadow-2xl sm:mx-10 mx-3 mt-5">
          <CardHeader>
            <CardTitle className="text-center">
              <h1
                className="scroll-m-20 text-center font-extrabold tracking-tight"
                style={{ fontSize: "clamp(2rem, 5vw, 3.5rem)" }}
              >
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
                    className="w-full rounded-md border px-3 py-2 text-sm 
                    focus:outline-none"
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="michael@example.com"
                    required
                  />
                </div>
              </div>
              <div className="flex justify-center w-full my-5">
                <Dropzone files={files} setFiles={setFiles} />
              </div>
            </form>
            <div className="flex-col gap-2">
              <Button
                disabled={loading}
                size="lg"
                type="submit"
                className="w-full"
                onClick={handleOnSubmit}
              >
                {loading ? (
                  <>
                    <Spinner className="size-4" /> Submitting...
                  </>
                ) : (
                  "Submit"
                )}
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
      <ToastContainer
        position="top-right"
        autoClose={3000}
        hideProgressBar={false}
        newestOnTop={false}
        closeOnClick={false}
        rtl={false}
        pauseOnFocusLoss
        draggable
        pauseOnHover
        theme="light"
        transition={Bounce}
      />
    </>
  );
}
