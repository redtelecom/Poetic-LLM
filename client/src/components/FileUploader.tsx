import { useState, useRef, useCallback, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { X, ImagePlus, Loader2 } from "lucide-react";

export interface FileAttachment {
  id: string;
  file: File;
  preview: string;
  type: "image" | "file";
  uploading: boolean;
  uploaded: boolean;
  storageKey?: string;
  url?: string;
  mimeType: string;
}

interface FileUploaderProps {
  attachments: FileAttachment[];
  setAttachments: React.Dispatch<React.SetStateAction<FileAttachment[]>>;
  disabled?: boolean;
}

const MAX_FILE_SIZE = 10 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp"];

export function FileUploader({ attachments, setAttachments, disabled }: FileUploaderProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  const uploadFile = async (file: File): Promise<{ storageKey: string; url: string }> => {
    const formData = new FormData();
    formData.append("file", file);
    
    const response = await fetch("/api/objects/upload", {
      method: "POST",
      body: formData
    });
    
    if (!response.ok) {
      throw new Error("Upload failed");
    }
    
    return response.json();
  };

  const addFiles = useCallback(async (files: FileList | File[]) => {
    for (const file of Array.from(files)) {
      if (file.size > MAX_FILE_SIZE) {
        console.warn(`File ${file.name} is too large (max 10MB)`);
        continue;
      }

      const isImage = ALLOWED_IMAGE_TYPES.includes(file.type);
      if (!isImage) continue;
      
      const id = crypto.randomUUID();
      const preview = URL.createObjectURL(file);

      const newAttachment: FileAttachment = {
        id,
        file,
        preview,
        type: "image",
        uploading: true,
        uploaded: false,
        mimeType: file.type
      };

      setAttachments(prev => [...prev, newAttachment]);

      try {
        const result = await uploadFile(file);
        setAttachments(prev => prev.map(a => 
          a.id === id 
            ? { ...a, uploading: false, uploaded: true, storageKey: result.storageKey, url: result.url }
            : a
        ));
      } catch (error) {
        console.error("Upload failed:", error);
        setAttachments(prev => prev.filter(a => a.id !== id));
        URL.revokeObjectURL(preview);
      }
    }
  }, [setAttachments]);

  const removeAttachment = useCallback((id: string) => {
    setAttachments(prev => {
      const attachment = prev.find(a => a.id === id);
      if (attachment?.preview) {
        URL.revokeObjectURL(attachment.preview);
      }
      return prev.filter(a => a.id !== id);
    });
  }, [setAttachments]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    
    if (e.dataTransfer.files.length > 0) {
      addFiles(e.dataTransfer.files);
    }
  }, [addFiles]);

  const handlePaste = useCallback((e: ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;

    const files: File[] = [];
    for (const item of Array.from(items)) {
      if (item.kind === "file") {
        const file = item.getAsFile();
        if (file) files.push(file);
      }
    }

    if (files.length > 0) {
      e.preventDefault();
      addFiles(files);
    }
  }, [addFiles]);

  useEffect(() => {
    if (disabled) return;
    document.addEventListener("paste", handlePaste);
    return () => {
      document.removeEventListener("paste", handlePaste);
    };
  }, [handlePaste, disabled]);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      addFiles(e.target.files);
    }
    e.target.value = "";
  }, [addFiles]);

  return (
    <div className="space-y-2">
      <div
        className={`relative border-2 border-dashed rounded-lg p-2 transition-colors ${
          isDragging 
            ? "border-indigo-500 bg-indigo-50" 
            : "border-neutral-200 hover:border-neutral-300"
        } ${disabled ? "opacity-50 pointer-events-none" : ""}`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => fileInputRef.current?.click()}
            disabled={disabled}
            className="text-neutral-600 hover:text-indigo-600"
            data-testid="button-add-attachment"
          >
            <ImagePlus className="w-4 h-4 mr-1" />
            Add Image
          </Button>
          <span className="text-xs text-neutral-500">
            or paste/drop images here
          </span>
        </div>
        
        <input
          ref={fileInputRef}
          type="file"
          accept={ALLOWED_IMAGE_TYPES.join(",")}
          multiple
          onChange={handleFileSelect}
          className="hidden"
          data-testid="input-file-upload"
        />
      </div>

      {attachments.length > 0 && (
        <div className="flex flex-wrap gap-2" data-testid="attachments-preview">
          {attachments.map(attachment => (
            <div
              key={attachment.id}
              className="relative group"
              data-testid={`attachment-${attachment.id}`}
            >
              {attachment.type === "image" ? (
                <div className="w-16 h-16 rounded-lg overflow-hidden border border-neutral-200">
                  <img
                    src={attachment.preview}
                    alt="Attachment preview"
                    className="w-full h-full object-cover"
                  />
                  {attachment.uploading && (
                    <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                      <Loader2 className="w-4 h-4 text-white animate-spin" />
                    </div>
                  )}
                </div>
              ) : (
                <div className="w-16 h-16 rounded-lg border border-neutral-200 flex items-center justify-center bg-neutral-50">
                  <span className="text-xs text-neutral-500 truncate px-1">
                    {attachment.file.name.slice(0, 8)}...
                  </span>
                </div>
              )}
              
              <button
                type="button"
                onClick={() => removeAttachment(attachment.id)}
                className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                data-testid={`button-remove-attachment-${attachment.id}`}
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
