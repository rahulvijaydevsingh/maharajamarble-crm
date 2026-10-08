import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import {
  CustomerAttachmentError,
  deleteCustomerAttachment,
  downloadCustomerAttachment,
  getCustomerAttachmentErrorMessage,
  listCustomerAttachments,
  renameCustomerAttachment,
  uploadCustomerAttachment,
} from "@/lib/customerAttachmentsApi";

export function useCustomerSecureAttachments(
  customerId: string,
  options?: { enabled?: boolean },
) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const queryKey = ["customer-secure-attachments", customerId];

  const listQuery = useQuery({
    queryKey,
    queryFn: () => listCustomerAttachments(customerId),
    enabled: !!customerId && (options?.enabled ?? true),
  });

  const uploadMutation = useMutation({
    mutationFn: ({ file }: { file: File }) =>
      uploadCustomerAttachment(customerId, file),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
    },
    onError: (error: unknown) => {
      const code =
        error instanceof CustomerAttachmentError ? error.code : "server_error";
      toast({
        title: "Upload Failed",
        description: getCustomerAttachmentErrorMessage(code),
        variant: "destructive",
      });
    },
  });

  const renameMutation = useMutation({
    mutationFn: ({
      attachmentId,
      fileName,
    }: {
      attachmentId: string;
      fileName: string;
    }) => renameCustomerAttachment(attachmentId, fileName),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
      toast({
        title: "File Renamed",
        description: "Attachment name has been updated.",
      });
    },
    onError: (error: unknown) => {
      const code =
        error instanceof CustomerAttachmentError ? error.code : "server_error";
      toast({
        title: "Rename Failed",
        description: getCustomerAttachmentErrorMessage(code),
        variant: "destructive",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (attachmentId: string) => deleteCustomerAttachment(attachmentId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
      toast({
        title: "File Deleted",
        description: "Attachment permanently removed.",
      });
    },
    onError: (error: unknown) => {
      const code =
        error instanceof CustomerAttachmentError ? error.code : "server_error";
      toast({
        title: "Delete Failed",
        description: getCustomerAttachmentErrorMessage(code),
        variant: "destructive",
      });
    },
  });

  const downloadFile = async (attachmentId: string): Promise<Blob> => {
    try {
      return await downloadCustomerAttachment(attachmentId);
    } catch (error: unknown) {
      const code =
        error instanceof CustomerAttachmentError ? error.code : "server_error";
      toast({
        title: "Download Failed",
        description: getCustomerAttachmentErrorMessage(code),
        variant: "destructive",
      });
      throw error;
    }
  };

  return {
    attachments: listQuery.data ?? [],
    isLoading: listQuery.isLoading,
    isError: listQuery.isError,
    refetch: listQuery.refetch,
    uploadMutation,
    renameMutation,
    deleteMutation,
    downloadFile,
  };
}
