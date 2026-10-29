"use client";


// Preneto iz Devotion apps/web/components/workspace/chat/use-attachment-sender.ts (main @ c05c40f), SPAJANJE S15.
import { useCallback, useRef, useState } from "react";
import { useMutation } from "convex/react";
import { toast } from "@/lib/toast";
import { accessErrorMessage } from "@/lib/prostor/web/greske";

import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import {
  maxPageFileBytesFor,
  pageFileCategoryFor,
} from "@/convex/prostor/lib/page_files";
import type { ChatChannel, ChatMessage } from "@/lib/prostor/web/chat";

/** Dvocifreno sa vodećom nulom — za ime snimka ekrana. */
function pad(value: number): string {
  return String(value).padStart(2, "0");
}

/**
 * Ime za fajl koji ga nema. Screenshot iz clipboard-a stiže kao `image/png` bez
 * upotrebljivog imena (Chrome ga zove `image.png` za SVAKI snimak), pa bi razgovor
 * bio pun istoimenih priloga koje niko ne razlikuje.
 */
export function timestampedName(file: File, at: Date): string {
  const generic = !file.name || /^image\.(png|jpe?g|webp|gif)$/i.test(file.name);
  if (!generic) return file.name;
  const extension = (file.type.split("/")[1] ?? "png").replace("jpeg", "jpg");
  const stamp =
    `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}` +
    `-${pad(at.getHours())}-${pad(at.getMinutes())}-${pad(at.getSeconds())}`;
  return `snimak-${stamp}.${extension}`;
}

/**
 * Provera koju server ponavlja (`chat.sendMessage` → `resolveAttachment`). Ovde je
 * da fajl koji će ionako biti odbijen ne ode kroz upload i ne ostavi siroč blob:
 * `ctx.storage.delete` je deo iste transakcije, pa ga `throw` na serveru poništi.
 * Poruka je namerno ista kao serverska — korisnik ne sme da dobije dva teksta za
 * istu granicu.
 */
export function attachmentRejection(file: File): string | null {
  const category = pageFileCategoryFor(file.type || undefined, file.name);
  if (category === null) {
    return `Ovaj tip fajla nije podržan${file.type ? `: ${file.type}` : ""}.`;
  }
  const maxBytes = maxPageFileBytesFor(category);
  if (file.size > maxBytes) {
    return `Prilog može imati najviše ${Math.round(maxBytes / (1024 * 1024))} MB.`;
  }
  return null;
}

/**
 * Slanje priloga u razgovor — jedan put za sve tri ulazne tačke: spajalica i
 * glasovna poruka (`message-composer.tsx`), `Ctrl+V` sa slikom, i prevlačenje
 * fajla na prozor razgovora (`conversation-pane.tsx`).
 *
 * Zašto hook, a ne funkcija u komponenti: `replyTo` živi u `conversation-pane`, a
 * treba i composeru i drop zoni. Kopija upload logike na dva mesta bi značila da
 * se sledeća ispravka granica radi dvaput.
 */
export function useAttachmentSender({
  channel,
  replyTo,
  onSent,
}: {
  channel: ChatChannel;
  replyTo: ChatMessage | null;
  onSent: () => void;
}) {
  const [uploading, setUploading] = useState(false);
  // Prilozi se šalju BEZ optimističkog unosa (poruka se pojavi kad server potvrdi),
  // pa je ovo gola mutacija — optimizam za tekst ostaje u composeru.
  const send = useMutation(api.prostor.chat.sendMessage);
  const generateUploadUrl = useMutation(api.prostor.chat.generateUploadUrl);
  // Serijalizuje slanje: više fajlova odjednom mora da stigne redom kojim su
  // pušteni, a ne redom kojim se upload završi.
  const queueRef = useRef<Promise<void>>(Promise.resolve());

  const sendAttachment = useCallback(
    async (file: File, kind: "file" | "voice", voiceDurationMs?: number) => {
      const rejection = attachmentRejection(file);
      if (rejection !== null) {
        toast.error(rejection);
        return;
      }
      setUploading(true);
      const replyId = replyTo?._id;
      try {
        // Ime, tip i veličina idu i u predproveru: server odbija prevelik ili
        // nepodržan fajl PRE nego što blob nastane (`chat.generateUploadUrl`).
        const uploadUrl = await generateUploadUrl({
          channelId: channel._id,
          name: file.name,
          contentType: file.type || "application/octet-stream",
          size: file.size,
        });
        const response = await fetch(uploadUrl, {
          method: "POST",
          headers: { "Content-Type": file.type || "application/octet-stream" },
          body: file,
        });
        if (!response.ok) throw new Error("Otpremanje nije uspelo.");
        const { storageId } = (await response.json()) as {
          storageId: Id<"_storage">;
        };
        const result = await send({
          channelId: channel._id,
          body: "",
          kind,
          attachmentStorageId: storageId,
          attachmentName: file.name,
          attachmentType: file.type || "application/octet-stream",
          attachmentSize: file.size,
          voiceDurationMs,
          replyToMessageId: replyId,
        });
        // Odbijen prilog se ne baca nego vraća — server je u istoj transakciji
        // obrisao blob, pa greška stiže bez siročeta u storage-u.
        if (!result.ok) {
          toast.error(result.message);
          return;
        }
        onSent();
      } catch (error) {
        // Mrežni prekid stiže kao TypeError na engleskom: korisnik dobija srpski tekst.
        toast.error(
          error instanceof TypeError
            ? "Prilog nije poslat. Proveri vezu i pokušaj ponovo."
            : accessErrorMessage(error, "Prilog nije poslat."),
        );
      } finally {
        setUploading(false);
      }
    },
    [channel._id, generateUploadUrl, onSent, replyTo, send],
  );

  /** Više fajlova (drop ili paste): jedan upload → jedna poruka, redom. */
  const sendFiles = useCallback(
    (files: File[]) => {
      if (files.length === 0) return;
      const at = new Date();
      const named = files.map((file) => {
        const name = timestampedName(file, at);
        return name === file.name
          ? file
          : new File([file], name, { type: file.type });
      });
      queueRef.current = queueRef.current.then(async () => {
        for (const file of named) {
          await sendAttachment(file, "file");
        }
      });
    },
    [sendAttachment],
  );

  return { uploading, sendAttachment, sendFiles };
}
