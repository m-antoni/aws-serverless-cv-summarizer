import { Upload, X } from "lucide-react";
import type { Dispatch, SetStateAction } from "react";
import { Button } from "@/components/ui/button";
import {
  FileUpload,
  FileUploadDropzone,
  FileUploadItem,
  FileUploadItemDelete,
  FileUploadItemMetadata,
  FileUploadItemPreview,
  FileUploadList,
  FileUploadTrigger,
} from "@/components/ui/file-upload";

type SetFormProps = {
  files: File[];
  setFiles: Dispatch<SetStateAction<File[]>>;
};

const Dropzone = ({ setFiles, files }: SetFormProps) => {
  // const [files, setFiles] = useState<File[]>([]);

  return (
    <FileUpload
      maxFiles={1} // change to your limit
      maxSize={3 * 1024 * 1024} // max MB size of the file
      className="w-full max-w-md"
      value={files}
      onValueChange={setFiles}
      // multiple // uncomment if using multiple files
    >
      <FileUploadDropzone>
        <div className="flex flex-col items-center gap-1 text-center">
          <div className="flex items-center justify-center rounded-full border p-2.5">
            <Upload className="size-6 text-muted-foreground" />
          </div>
          <p className="font-medium text-sm">Drop files here</p>
          <p className="text-muted-foreground text-xs">PDF, PNG, JPG</p>
          <p className="text-muted-foreground text-xs">(max 3MB)</p>
        </div>
        <FileUploadTrigger asChild>
          <Button size="sm" className="mt-2">
            Browse
          </Button>
        </FileUploadTrigger>
      </FileUploadDropzone>
      <FileUploadList orientation="vertical">
        {files.map((file, index) => (
          <FileUploadItem key={index} value={file}>
            <FileUploadItemPreview />
            <FileUploadItemMetadata />
            <FileUploadItemDelete asChild>
              <Button size="icon" className="size-8">
                <X className="size-5" />
              </Button>
            </FileUploadItemDelete>
          </FileUploadItem>
        ))}
      </FileUploadList>
    </FileUpload>
  );
};

export default Dropzone;
