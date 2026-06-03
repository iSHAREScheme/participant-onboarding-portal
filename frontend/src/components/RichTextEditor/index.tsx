import DefaultEditor from "react-simple-wysiwyg";
import type { ContentEditableEvent } from "react-simple-wysiwyg";
import styles from "./RichTextEditor.module.css";

interface RichTextEditorProps {
  value: string;
  onChange: (html: string) => void;
}

/**
 * Small WYSIWYG editor (bold/italic/underline, lists, links, headings, …) for the
 * portal's rich-text fields. It emits HTML — always run that HTML through
 * sanitizeRichText before rendering it. The editor relies on contentEditable, so
 * import it via next/dynamic with `ssr: false`.
 */
export default function RichTextEditor({ value, onChange }: RichTextEditorProps) {
  return (
    <div className={styles.wrapper}>
      <DefaultEditor
        value={value}
        onChange={(e: ContentEditableEvent) => onChange(e.target.value)}
      />
    </div>
  );
}
