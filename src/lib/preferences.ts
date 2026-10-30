import type { Settings } from "../types";

export const preferenceCategories: {
  id: string;
  title: string;
  keywords: string;
  keys: (keyof Settings)[];
}[] = [
  {
    id: "editing",
    title: "Appearance & editing",
    keywords:
      "interface layout workbench classic trial automatically format code on open color theme daylight light nightfall dark font size reading line height text width indentation spaces",
    keys: [
      "interfaceLayout",
      "theme",
      "formatOnOpen",
      "fontSize",
      "readingFontSize",
      "readingLineHeight",
      "readingWidth",
      "indentSize",
    ],
  },
  {
    id: "teaching",
    title: "Teaching & presentation",
    keywords:
      "teaching lesson projector beamer presentation font size theme F8 classroom",
    keys: ["presentationFontSize", "presentationTheme"],
  },
  {
    id: "spelling",
    title: "Spelling",
    keywords:
      "check spelling spellcheck language system Dutch Nederlands English French German dictionary offline Markdown",
    keys: ["spellcheckEnabled", "spellcheckLanguage"],
  },
  {
    id: "saving",
    title: "Saving & recovery",
    keywords:
      "autosave policy delay pause window focus manual save keep local version history storage limit versions per file recovery drafts folder",
    keys: [
      "autosave",
      "autosaveDelay",
      "historyEnabled",
      "historyLimitMB",
      "historyVersions",
    ],
  },
  {
    id: "attachments",
    title: "Images & attachments",
    keywords:
      "storage location folder path relative workspace root Markdown file paste screenshots images PNG JPEG GIF WebP assets",
    keys: ["attachmentMode", "attachmentFolder"],
  },
  {
    id: "filtering",
    title: "Workspace filtering",
    keywords:
      "ignored folder file names directories exclusions explorer watcher references git",
    keys: ["ignored"],
  },
];
