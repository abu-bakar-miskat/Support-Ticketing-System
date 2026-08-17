import { prisma } from "@/lib/db";

export async function createTemporaryAttachment(
  uploaderProfileId: string,
  storageUrl: string,
  fileName: string,
  fileSize: number,
) {
  return await prisma.attachment.create({
    data: {
      ticketId: null,
      uploaderProfileId,
      storageUrl,
      fileName,
      fileSize,
      status: "temporary",
    },
  });
}

export async function linkAttachmentsToTicket(
  attachmentIds: string[],
  ticketId: string,
) {
  return await prisma.attachment.updateMany({
    where: { id: { in: attachmentIds } },
    data: { ticketId, status: "attached" },
  });
}

export async function deleteTemporaryAttachment(attachmentId: string) {
  return await prisma.attachment.delete({ where: { id: attachmentId } });
}
