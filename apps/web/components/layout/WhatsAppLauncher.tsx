import { whatsappHref, type Contact } from '../../lib/contact';
import styles from './WhatsAppLauncher.module.css';

/** A compact, accessible shortcut to the sales team's configured WhatsApp chat. */
export function WhatsAppLauncher({ contact }: { contact: Contact }) {
  const href = whatsappHref(contact);
  if (!contact.whatsappIconVisible || !href) return null;

  return (
    <a
      className={styles.launcher}
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Message the sales team on WhatsApp"
      data-analytics-source="whatsapp-launcher"
    >
      <svg viewBox="0 0 32 32" aria-hidden="true" focusable="false">
        <path
          fill="currentColor"
          d="M16.04 3a12.8 12.8 0 0 0-11.1 19.16L3 29l7-1.84A12.93 12.93 0 1 0 16.04 3Zm0 23.63c-1.9 0-3.75-.5-5.38-1.44l-.39-.23-4.15 1.09 1.11-4.05-.25-.42a10.64 10.64 0 1 1 9.06 5.05Zm5.84-7.97c-.32-.16-1.9-.94-2.2-1.04-.29-.1-.5-.16-.72.16-.21.32-.82 1.04-1.01 1.26-.18.21-.37.24-.69.08-.32-.16-1.35-.5-2.57-1.59a9.56 9.56 0 0 1-1.78-2.21c-.19-.32-.02-.5.14-.66.14-.14.32-.37.48-.56.16-.18.21-.32.32-.53.11-.22.05-.4-.03-.56-.08-.16-.72-1.73-.98-2.37-.26-.62-.52-.54-.72-.55h-.61c-.21 0-.56.08-.85.4-.3.32-1.12 1.1-1.12 2.66 0 1.57 1.14 3.08 1.3 3.3.16.21 2.24 3.42 5.42 4.8.76.33 1.35.52 1.81.67.76.24 1.45.21 2 .13.61-.09 1.9-.77 2.16-1.52.27-.74.27-1.38.19-1.51-.08-.14-.3-.22-.62-.38Z"
        />
      </svg>
      <span className="visually-hidden">WhatsApp</span>
    </a>
  );
}
