"use client";

// Preneto iz Devotion apps/web/components/rich-text-editor.tsx (main @ c05c40f), SPAJANJE S10.
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { EditorContent, useEditor, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { Placeholder } from "@tiptap/extensions";
import { TaskItem, TaskList } from "@tiptap/extension-list";
import { TableKit } from "@tiptap/extension-table";
import {
  BetweenHorizontalEnd,
  BetweenVerticalEnd,
  Bold,
  Code2,
  Heading1,
  Heading2,
  ImagePlus,
  Italic,
  Link2,
  Link2Off,
  List,
  ListChecks,
  ListOrdered,
  LoaderCircle,
  PanelTop,
  Paperclip,
  Quote,
  Redo2,
  Strikethrough,
  Table2,
  TableColumnsSplit,
  TableRowsSplit,
  Trash2,
  Undo2,
} from "lucide-react";
import { toast } from "@/lib/toast";

import { NoteFile } from "@/components/app/prostor/editor/note-file-node";
import {
  NoteLinkDialog,
  type NoteLinkDraft,
} from "@/components/app/prostor/editor/link-dijalog";
import { EditorSkeleton } from "@/components/app/prostor/editor/editor-skeleton";
import type { AttachedPageFile } from "@/components/app/prostor/editor/prilozi-kontekst";
import { cn } from "@/lib/utils";
import "./editor.css";

type RichTextEditorProps = {
  content: string;
  documentKey: string;
  editable?: boolean;
  placeholder?: string;
  onChange: (value: { html: string; text: string }) => void;
  /**
   * Kad postoji, editor nudi upload priloga (toolbar, prevlačenje, paste).
   * Bez njega (npr. beleška koja još nije kreirana) upload UI se ne prikazuje,
   * a nalepljeni tuđi prilozi se prikazuju kao nedostupni.
   */
  attachments?: {
    upload: (file: File) => Promise<AttachedPageFile | null>;
  };
};

type ToolbarAction = {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  active?: () => boolean;
  disabled?: () => boolean;
  run: () => void;
};

/** Paste iz clipboard-a stiže kao generičko `image.png` — ime dobija vreme. */
function withReadableName(file: File) {
  if (!/^image\.(png|jpe?g|gif|webp)$/i.test(file.name)) return file;
  const stamp = new Date()
    .toISOString()
    .slice(0, 19)
    .replace("T", " ")
    .replace(/:/g, "-");
  const extension = file.name.split(".").pop() ?? "png";
  return new File([file], `slika ${stamp}.${extension}`, { type: file.type });
}

export function RichTextEditor({
  content,
  documentKey,
  editable = true,
  placeholder = "Zapiši kontekst, odluke i sledeće korake…",
  onChange,
  attachments,
}: RichTextEditorProps) {
  // `useEditor` sa dependencima ne osvežava opcije pri re-renderu, pa svaki
  // handler u `editorProps` mora da čita sveže vrednosti kroz ref.
  const attachmentsRef = useRef(attachments);
  useEffect(() => {
    attachmentsRef.current = attachments;
  }, [attachments]);
  const editorRef = useRef<Editor | null>(null);
  // Za otvaranje skrivenih inputa se ne koriste refovi — toolbar akcije nastaju
  // tokom rendera, a `react-hooks/refs` tu zabranjuje zatvaranje nad refom.
  const imageInputId = useId();
  const fileInputId = useId();
  // `done`/`total` hrane brojač „Otpremanje n/m…”; paralelne serije se sabiraju.
  const [uploadProgress, setUploadProgress] = useState({ done: 0, total: 0 });
  const [linkOpen, setLinkOpen] = useState(false);
  // Snimak preživljava zatvaranje: dok se dijalog gasi animacijom, sadržaj
  // treba da ostane isti umesto da se isprazni.
  const [linkDraft, setLinkDraft] = useState<NoteLinkDraft | null>(null);

  /**
   * Šalje fajlove redom i ubacuje `noteFile` blok po završetku svakog (v1 bez
   * placeholder-a u tekstu). `dropPos` je pozicija iz prevlačenja; bez nje se
   * ubacuje na trenutnu selekciju. Greške toast-uje sam upload.
   */
  const insertFiles = useCallback(async (files: File[], dropPos?: number) => {
    const upload = attachmentsRef.current?.upload;
    if (upload === undefined || files.length === 0) return;
    let insertAt = dropPos;
    setUploadProgress((progress) => ({
      done: progress.done,
      total: progress.total + files.length,
    }));
    let finishedCount = 0;
    try {
      for (const original of files) {
        try {
          const attrs = await upload(withReadableName(original));
          if (attrs === null) continue;
          const currentEditor = editorRef.current;
          if (currentEditor === null || currentEditor.isDestroyed) return;
          const node = {
            type: "noteFile",
            attrs: {
              fileId: attrs.fileId,
              category: attrs.category,
              name: attrs.name,
              size: attrs.size,
            },
          };
          if (insertAt !== undefined) {
            const at = Math.min(insertAt, currentEditor.state.doc.content.size);
            currentEditor.chain().focus().insertContentAt(at, node).run();
            insertAt = at + 1;
          } else {
            currentEditor.chain().focus().insertContent(node).run();
          }
        } finally {
          finishedCount += 1;
          setUploadProgress((progress) => {
            const done = progress.done + 1;
            return done >= progress.total
              ? { done: 0, total: 0 }
              : { done, total: progress.total };
          });
        }
      }
    } finally {
      // Rani izlaz (npr. uništen editor) ne sme da ostavi brojač zaglavljen:
      // fajlovi koji nikada neće krenuti skidaju se sa total-a.
      const skipped = files.length - finishedCount;
      if (skipped > 0) {
        setUploadProgress((progress) => {
          const total = progress.total - skipped;
          return progress.done >= total
            ? { done: 0, total: 0 }
            : { done: progress.done, total };
        });
      }
    }
  }, []);

  const editor = useEditor({
    immediatelyRender: false,
    shouldRerenderOnTransaction: true,
    editable,
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
        // Podrazumevano `openOnClick` otvara adresu i u režimu uređivanja, pa
        // klik na link ne bi mogao da postavi kursor u njega. Otvaranje ostaje
        // na čitanju (pravi `<a>`) i na Ctrl/Cmd+klik iz `handleClick`.
        link: { openOnClick: false },
      }),
      TaskList,
      TaskItem.configure({ nested: true }),
      Placeholder.configure({ placeholder }),
      NoteFile,
      TableKit.configure({ table: { resizable: true } }),
    ],
    content,
    editorProps: {
      attributes: {
        class:
          "tiptap min-h-[42vh] w-full max-w-none px-1 pb-28 pt-4 text-copy leading-7 text-foreground outline-none sm:min-h-[52vh] sm:text-base",
        "aria-label": "Sadržaj stranice",
      },
      handleClick: (view, _pos, event) => {
        // U režimu uređivanja klik samo pomera kursor (vidi `openOnClick`), pa
        // Ctrl/Cmd+klik ostaje način da se link otvori bez izlaska iz beleške.
        if (!view.editable || !(event.ctrlKey || event.metaKey)) return false;
        const target = event.target;
        if (!(target instanceof HTMLElement)) return false;
        const href = target.closest("a")?.getAttribute("href");
        if (href === null || href === undefined) return false;
        window.open(href, "_blank", "noopener,noreferrer");
        return true;
      },
      handleDrop: (view, event, _slice, moved) => {
        // `moved` je interno premeštanje postojećeg bloka — to radi ProseMirror.
        if (moved || !view.editable) return false;
        const files = Array.from(event.dataTransfer?.files ?? []);
        if (files.length === 0) return false;
        event.preventDefault();
        if (attachmentsRef.current === undefined) {
          toast.error("Fajlovi mogu da se dodaju tek kad stranica bude kreirana.");
          return true;
        }
        const coords = view.posAtCoords({
          left: event.clientX,
          top: event.clientY,
        });
        void insertFiles(files, coords?.pos ?? view.state.selection.from);
        return true;
      },
      handlePaste: (view, event) => {
        if (!view.editable || attachmentsRef.current === undefined) return false;
        const data = event.clipboardData;
        const files = Array.from(data?.files ?? []);
        // Bogat sadržaj (npr. iz Word-a) nosi i HTML i sliku — tekst ima prednost.
        if (files.length === 0 || (data?.types.includes("text/html") ?? false)) {
          return false;
        }
        event.preventDefault();
        void insertFiles(files);
        return true;
      },
    },
    onUpdate: ({ editor: currentEditor }) => {
      onChange({ html: currentEditor.getHTML(), text: currentEditor.getText() });
    },
  }, [documentKey]);

  useEffect(() => {
    editorRef.current = editor;
  }, [editor]);

  useEffect(() => {
    if (!editor) return;
    // Changing permissions is not a content edit. Tiptap emits an `update`
    // event by default here, which can leave read-only pages permanently dirty.
    editor.setEditable(editable, false);
  }, [editable, editor]);

  useEffect(() => {
    if (!editor) return;
    const nextContent = content || "<p></p>";
    if (editor.getHTML() !== nextContent) {
      editor
        .chain()
        .setMeta("addToHistory", false)
        .setContent(nextContent, { emitUpdate: false })
        // `setContent` ostavlja selekciju na kraju; kad telo završava atomom
        // (prilog), to je NodeSelection koju bi prvi sledeći unos zamenio.
        .setTextSelection(0)
        .run();
    }
  }, [content, documentKey, editor]);

  if (!editor) {
    return <EditorSkeleton />;
  }

  const linkActive = editor.isActive("link");

  const openLinkDialog = () => {
    // Kursor unutar postojećeg linka širi selekciju na celu adresu — dijalog
    // tada menja ceo link, a ne samo reč pod kursorom.
    editor.chain().focus().extendMarkRange("link").run();
    const { from, to, empty } = editor.state.selection;
    if (empty) {
      toast.error("Prvo obeleži tekst koji treba da vodi na link.");
      return;
    }
    const text = editor.state.doc.textBetween(from, to, " ").trim();
    const href = (editor.getAttributes("link").href as string | undefined) ?? "";
    setLinkDraft({
      text: text.length > 60 ? `${text.slice(0, 60)}…` : text,
      href,
      input: href,
    });
    setLinkOpen(true);
  };

  /**
   * Lanac izmene ide bez `focus()` u sebi: dok je dijalog otvoren Radix vraća
   * fokus sebi, pa se kursor u tekst vraća tek kad React upiše zatvoreno stanje
   * i zamka fokusa popusti (`onCloseAutoFocus` je isključen da fokus ne bi
   * završio na toolbar dugmetu).
   */
  const restoreEditorFocus = () => {
    setTimeout(() => {
      if (!editor.isDestroyed) editor.commands.focus();
    }, 0);
  };

  const applyLink = (href: string) => {
    setLinkOpen(false);
    editor.chain().extendMarkRange("link").setLink({ href }).run();
    restoreEditorFocus();
  };

  const removeLink = () => {
    setLinkOpen(false);
    editor.chain().extendMarkRange("link").unsetLink().run();
    restoreEditorFocus();
  };

  const actions: Array<ToolbarAction | "separator"> = [
    {
      label: "Podebljano",
      icon: Bold,
      active: () => editor.isActive("bold"),
      run: () => editor.chain().focus().toggleBold().run(),
    },
    {
      label: "Kurziv",
      icon: Italic,
      active: () => editor.isActive("italic"),
      run: () => editor.chain().focus().toggleItalic().run(),
    },
    {
      label: "Precrtano",
      icon: Strikethrough,
      active: () => editor.isActive("strike"),
      run: () => editor.chain().focus().toggleStrike().run(),
    },
    {
      label: "Kod",
      icon: Code2,
      active: () => editor.isActive("code"),
      run: () => editor.chain().focus().toggleCode().run(),
    },
    {
      label: linkActive ? "Izmeni link" : "Dodaj link",
      icon: Link2,
      active: () => linkActive,
      run: openLinkDialog,
    },
    // Brzo skidanje linka bez otvaranja dijaloga — kao kod alata za tabele,
    // dugme se pojavljuje samo kad ima šta da ukloni.
    ...(linkActive
      ? [
          {
            label: "Ukloni link",
            icon: Link2Off,
            run: removeLink,
          },
        ]
      : []),
    "separator",
    {
      label: "Naslov 1",
      icon: Heading1,
      active: () => editor.isActive("heading", { level: 1 }),
      run: () => editor.chain().focus().toggleHeading({ level: 1 }).run(),
    },
    {
      label: "Naslov 2",
      icon: Heading2,
      active: () => editor.isActive("heading", { level: 2 }),
      run: () => editor.chain().focus().toggleHeading({ level: 2 }).run(),
    },
    {
      label: "Lista",
      icon: List,
      active: () => editor.isActive("bulletList"),
      run: () => editor.chain().focus().toggleBulletList().run(),
    },
    {
      label: "Numerisana lista",
      icon: ListOrdered,
      active: () => editor.isActive("orderedList"),
      run: () => editor.chain().focus().toggleOrderedList().run(),
    },
    {
      label: "Checklist",
      icon: ListChecks,
      active: () => editor.isActive("taskList"),
      run: () => editor.chain().focus().toggleTaskList().run(),
    },
    {
      label: "Citat",
      icon: Quote,
      active: () => editor.isActive("blockquote"),
      run: () => editor.chain().focus().toggleBlockquote().run(),
    },
    "separator",
  ];

  if (attachments !== undefined) {
    actions.push(
      {
        label: "Dodaj sliku ili video",
        icon: ImagePlus,
        run: () => document.getElementById(imageInputId)?.click(),
      },
      {
        label: "Priloži fajl",
        icon: Paperclip,
        run: () => document.getElementById(fileInputId)?.click(),
      },
    );
  }
  actions.push(
    {
      label: "Ubaci tabelu",
      icon: Table2,
      // Tabela u tabeli pravi nečitljiv sadržaj — unutar tabele se ne nudi.
      disabled: () => editor.isActive("table"),
      run: () =>
        editor
          .chain()
          .focus()
          .insertTable({ rows: 3, cols: 3, withHeaderRow: true })
          .run(),
    },
  );

  if (editor.isActive("table")) {
    actions.push(
      "separator",
      {
        label: "Dodaj red",
        icon: BetweenHorizontalEnd,
        run: () => editor.chain().focus().addRowAfter().run(),
      },
      {
        label: "Obriši red",
        icon: TableRowsSplit,
        run: () => editor.chain().focus().deleteRow().run(),
      },
      {
        label: "Dodaj kolonu",
        icon: BetweenVerticalEnd,
        run: () => editor.chain().focus().addColumnAfter().run(),
      },
      {
        label: "Obriši kolonu",
        icon: TableColumnsSplit,
        run: () => editor.chain().focus().deleteColumn().run(),
      },
      {
        label: "Red zaglavlja",
        icon: PanelTop,
        run: () => editor.chain().focus().toggleHeaderRow().run(),
      },
      {
        label: "Obriši tabelu",
        icon: Trash2,
        run: () => editor.chain().focus().deleteTable().run(),
      },
    );
  }

  actions.push(
    "separator",
    {
      label: "Poništi",
      icon: Undo2,
      disabled: () => !editor.can().chain().focus().undo().run(),
      run: () => editor.chain().focus().undo().run(),
    },
    {
      label: "Ponovi",
      icon: Redo2,
      disabled: () => !editor.can().chain().focus().redo().run(),
      run: () => editor.chain().focus().redo().run(),
    },
  );

  return (
    <div className="relative">
      {editable ? (
        <div
          className="sticky top-0 z-10 -mx-2 flex min-h-12 flex-wrap items-center gap-0.5 overflow-visible border-y border-line-soft bg-background px-2 py-1.5 sm:flex-nowrap sm:overflow-x-auto sm:rounded-xl sm:border sm:shadow-elev-1 sm:[scrollbar-width:thin]"
          role="toolbar"
          aria-label="Alati za uređivanje"
        >
          {actions.map((action, index) => {
            if (action === "separator") {
              return <span key={`separator-${index}`} aria-hidden="true" className="mx-1 h-5 w-px shrink-0 bg-line" />;
            }

            const Icon = action.icon;
            const isActive = action.active?.() ?? false;
            return (
              <button
                key={action.label}
                type="button"
                title={action.label}
                aria-label={action.label}
                aria-pressed={action.active ? isActive : undefined}
                disabled={action.disabled?.()}
                onClick={action.run}
                className={cn(
                  "inline-flex size-8 shrink-0 items-center justify-center rounded-lg text-text-secondary transition-colors hover:bg-surface-control-hover hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:text-text-muted pointer-coarse:size-11",
                  isActive && "bg-surface-control-hover text-foreground",
                )}
              >
                <Icon className="size-4" />
              </button>
            );
          })}
        </div>
      ) : null}
      {editable && attachments !== undefined ? (
        <>
          <input
            id={imageInputId}
            type="file"
            accept="image/*,video/*"
            multiple
            tabIndex={-1}
            className="sr-only"
            aria-label="Izbor slika i video snimaka za belešku"
            onChange={(event) => {
              // Input se prazni tek posle slanja: iOS Safari ume da poništi
              // File handle ako se value obriše dok se sadržaj još čita.
              const input = event.currentTarget;
              const files = Array.from(input.files ?? []);
              void insertFiles(files).finally(() => {
                input.value = "";
              });
            }}
          />
          <input
            id={fileInputId}
            type="file"
            multiple
            tabIndex={-1}
            className="sr-only"
            aria-label="Izbor fajlova za belešku"
            onChange={(event) => {
              const input = event.currentTarget;
              const files = Array.from(input.files ?? []);
              void insertFiles(files).finally(() => {
                input.value = "";
              });
            }}
          />
        </>
      ) : null}
      <EditorContent editor={editor} />
      {uploadProgress.total > 0 ? (
        <div
          className="pointer-events-none absolute bottom-4 right-2 z-20 flex items-center gap-2 rounded-full border border-line-soft bg-surface-raised px-3 py-1.5 text-meta font-semibold text-text-secondary shadow-elev-2"
          role="status"
          aria-live="polite"
        >
          <LoaderCircle className="size-3.5 animate-spin" aria-hidden="true" />
          {uploadProgress.total > 1
            ? `Otpremanje ${Math.min(uploadProgress.done + 1, uploadProgress.total)}/${uploadProgress.total}…`
            : "Otpremanje…"}
        </div>
      ) : null}
      <NoteLinkDialog
        open={linkOpen}
        draft={linkDraft}
        onInputChange={(input) =>
          setLinkDraft((current) =>
            current === null ? null : { ...current, input },
          )
        }
        onClose={() => setLinkOpen(false)}
        onSubmit={applyLink}
        onRemove={removeLink}
      />
    </div>
  );
}
